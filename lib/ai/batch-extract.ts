import "server-only";
import { Type } from "@google/genai";
import { executeWithKeyRotation } from "./key-manager";
import { ExtractedProperty } from "./extract";
import {
  getGoldenSamplesForPrompt,
  verifyVerbatimSpan,
  detectPricePeriod,
  extractMultiFloorAreas,
  auditAndVerifyExtractedProperty,
} from "./golden-samples";

export interface BatchTimelineItem {
  msg_id: string;
  time: number;
  sent_time: string;
  type: "text" | "photo";
  text?: string;
  photo_url?: string;
}

export interface BatchExtractionResult {
  properties: ExtractedProperty[];
  summary_note?: string;
}

/**
 * Bóc tách Đa căn BĐS thuần Văn bản theo Dòng thời gian hội thoại
 * Ưu tiên độ chính xác tuyệt đối: Chỉ lấy thông số có trong tin nhắn, thiếu trường để null.
 */
export async function extractBatchPropertiesFromTimeline(
  timeline: BatchTimelineItem[]
): Promise<BatchExtractionResult> {
  // Chỉ lấy các tin nhắn dạng text có nội dung thực tế
  const textItems = (timeline || []).filter(
    (t) => t.type === "text" && t.text && t.text.trim().length > 0
  );

  if (textItems.length === 0) {
    return { properties: [] };
  }

  // Khử trùng lặp các tin nhắn text giống hệt nhau gửi liền kề
  const seenTexts = new Set<string>();
  const uniqueTextItems: BatchTimelineItem[] = [];
  for (const item of textItems) {
    const normalized = (item.text || "").trim().toLowerCase();
    if (!seenTexts.has(normalized)) {
      seenTexts.add(normalized);
      uniqueTextItems.push(item);
    }
  }

  // Xây dựng transcript văn bản dòng thời gian sạch cho Gemini
  let transcript = "--- DÒNG THỜI GIAN TIN NHẮN TỪ ĐỐI TÁC (TỪ CŨ ĐẾN MỚI) ---\n";
  uniqueTextItems.forEach((item, index) => {
    transcript += `[Tin nhắn ${index + 1} | ${item.sent_time || "Vừa gửi"}] (ID: ${item.msg_id}):\n${(item.text || "").trim()}\n\n`;
  });

  const goldenSamplesText = await getGoldenSamplesForPrompt();

  const systemPrompt = `
Bạn là chuyên gia thẩm định và bóc tách dữ liệu Bất động sản (BĐS) hàng đầu cho Huanseek.
Nhiệm vụ của bạn là đọc DÒNG THỜI GIAN CÁC TIN NHẮN VĂN BẢN từ đối tác môi giới, nhận diện chính xác có MỘT hay NHIỀU căn BĐS độc lập và trích xuất thành danh sách chuẩn hóa thuần text.

NGUYÊN TẮC CỐT LÕI - BÓC TÁCH NGUYÊN GỐC CHỮ TRONG TIN NHẮN (STRICT VERBATIM FIDELITY):

1. BÓC TÁCH TOÀN BỘ CÁC THÔNG SỐ CÓ THỰC TRONG TIN NHẮN:
   - Trích xuất đầy đủ và triệt để mọi thông tin có trong văn bản: địa chỉ, loại hình, diện tích sàn, tổng diện tích, số tầng, mặt tiền, kết cấu phòng/vệ sinh, đồ đạc nội thất, giá thuê/bán, điều kiện thanh toán/cọc, thời hạn hợp đồng, hoa hồng chủ nhà trả, hoa hồng bên mình nhận, công năng phù hợp, ngành nghề cấm/hạn chế, số điện thoại liên hệ...
   - CHỈ TRÍCH XUẤT THÔNG TIN THỰC SỰ CÓ TRONG TIN NHẮN. NẾU THIẾU TRƯỜNG DỮ LIỆU CŨNG KHÔNG SAO: Nếu tin nhắn không nói rõ quận, phường, số nhà, thời hạn thuê, hoa hồng... -> BẮT BUỘC ĐỂ NULL HOẶC ĐỂ TRỐNG.
   - TUYỆT ĐỐI KHÔNG TỰ BỊA RA, KHÔNG SUY ĐOÁN những thông tin không có trong văn bản!

2. PHÂN TÁCH ĐA CĂN BĐS (MULTI-PROPERTY SEPARATION) & DANH SÁCH GẠCH ĐẦU DÒNG:
   - Khi đối tác gửi danh sách gồm nhiều dòng gạch đầu dòng '-' hoặc bullet point (ví dụ danh sách các căn Studio, 1N, 2N, 3N): BẮT BUỘC BÓC TÁCH TỪNG DÒNG THÀNH TỪNG CĂN ĐỘC LẬP trong mảng "properties", TUYỆT ĐỐI KHÔNG ĐƯỢC BỎ SÓT BẤT KỲ CĂN NÀO!
   - LOẠI TRỪ TIN TÌM CĂN / NHU CẦU CỦA KHÁCH: Nếu tin nhắn thể hiện nhu cầu tìm thuê (ví dụ: "E tìm 1n/1n+ cho khách thuê", "khách e chiều 2h đi xem tìm 1pn+..."), đây là tin tìm căn của khách, KHÔNG PHẢI NGUỒN CĂN CHO THUÊ -> BỎ QUA, không đưa vào danh sách properties.
   - "source_text_snippet": BẮT BUỘC trích nguyên văn đoạn văn bản mô tả riêng của chính căn đó để người duyệt đối chiếu.

3. LOẠI HÌNH BĐS (property_types) - GIỮ NGUYÊN BẢN TIẾNG VIỆT:
   - Trích xuất NGUYÊN MẪU cụm từ chỉ loại hình BĐS có trong tin nhắn dưới dạng tiếng Việt (ví dụ: ["Nhà liền kề"], ["Nhà mặt phố"], ["Căn hộ chung cư"], ["Biệt thự"], ["Kho xưởng"], ["Văn phòng"], ["Mặt bằng kinh doanh"]...).
   - TUYỆT ĐỐI KHÔNG DỊCH sang tiếng Anh (không dùng "townhouse", "apartment", "villa"...).

4. TỔNG DIỆN TÍCH (total_lease_area_m2) & DIỆN TÍCH MỖI TẦNG (floor_area_m2):
   - "total_lease_area_m2": Luôn là TỔNG TOÀN BỘ DIỆN TÍCH CHO THUÊ (ví dụ: "tổng MB kho DT 1800m" -> 1800; "180m2 x 8 tầng" -> 1440; "Tầng 1: 50m, Tầng 2: 70m, Tầng 3: 80m" -> 200; "kho xưởng 800m2" -> 800; "căn hộ 65m2" -> 65).
   - "floor_area_m2" (DIỆN TÍCH MỖI TẦNG):
     * QUY TẮC CỐT LÕI: CHỈ ĐIỀN KHI TIN NHẮN CÓ NÓI RÕ DIỆN TÍCH TỪNG TẦNG / DIỆN TÍCH MỖI TẦNG / DIỆN TÍCH 1 SÀN!
       - Ví dụ có nhiều tầng và nói rõ: "180m2 x 8 tầng" -> floor_area_m2: "180" (mỗi tầng 180m2).
       - Ví dụ các tầng khác nhau: "Tầng 1: 50m, Tầng 2: 70m, Tầng 3: 80m" -> floor_area_m2: "50, 70, 80".
       - Ví dụ nói rõ "mỗi sàn 100m2" -> floor_area_m2: "100".
     * TUYỆT ĐỐI CẤM TỰ Ý ĐIỀN VÀO floor_area_m2 KHI TIN NHẮN KHÔNG ĐỀ CẬP DIỆN TÍCH MỖI TẦNG:
       - Nếu tin nhắn chỉ nói tổng diện tích hoặc mặt bằng chung (ví dụ: "tổng MB kho DT 1800m", "kho xưởng 1800m", "đất 2000m2", "MBKD 80m", "kho cao 8-9m", "căn hộ 65m2"): BẮT BUỘC ĐỂ floor_area_m2: NULL!
       - TUYỆT ĐỐI KHÔNG copy tổng diện tích sang floor_area_m2 khi không có thông tin về diện tích từng tầng!

5. NỘI THẤT & DANH SÁCH MÓN ĐỒ (VERBATIM SPAN EXTRACTION - TRÍCH NGUYÊN GỐC TỪNG CHỮ):
   - "furniture_status": CẮT ĐÚNG TỪ/CỤM TỪ NGUYÊN GỐC trong tin nhắn thể hiện hiện trạng nội thất (ví dụ: "đủ đồ", "full đồ", "đồ cơ bản", "full gỗ", "nhà trống", "bàn giao thô", "nguyên bản cđt"...).
     * TUYỆT ĐỐI KHÔNG TỰ QUY ĐỔI (ví dụ: tin ghi "đủ đồ" thì trích đúng "đủ đồ", CẤM đổi thành "đầy đủ nội thất").
     * NẾU TIN KHÔNG CÓ CỤM TỪ NÀO CHỈ HIỆN TRẠNG (ví dụ: chỉ liệt kê món đồ "Dh, nl, giường, bếp" hoặc không nhắc gì): BẮT BUỘC ĐỂ NULL, TUYỆT ĐỐI KHÔNG TỰ ĐẶT TỪ "chưa rõ" VÀO ĐÂY!
   - "furniture_list": Trích xuất NGUYÊN MẪU danh sách các món đồ được liệt kê trong tin nhắn (ví dụ: "Dh, nl, giường, bếp", "Dh âm trần, nl, THANG MÁY", "có bếp rèm", "6 điều hoà, 6 nóng lạnh, tủ bếp").
     * Nguồn nói rõ không có món nào thì ghi rõ đúng câu chữ đó (ví dụ: "riêng tủ lạnh chưa có", "chưa có giường").
     * Nếu tin nhắn không liệt kê món đồ nào thì để null hoặc "".

6. GIÁ TIỀN & ĐƠN VỊ & CƠ SỞ TÍNH GIÁ (GIỮ NGUYÊN BẢN TIẾNG VIỆT):
   - "price_amount": Con số quy đổi đầy đủ (ví dụ: "60 triệu/tháng" -> 60000000, "12 tr" -> 12000000, "150K / m2" -> 150000, "85k/m2" -> 85000; "2000$" -> 2000). Luôn tính đúng đơn vị triệu, tuyệt đối không để số 12 hay 85.
   - "price_currency": "VND" hoặc "USD".
   - "price_basis" (CƠ SỞ TÍNH GIÁ - PHÂN BIỆT RÕ):
     * KHI GIÁ TÍNH THEO MÉT VUÔNG (ví dụ: "150K / m2", "150k/m2", "85000đ/m2", "100k/m2/tháng", "12$/m2", "giá theo m2", "đơn giá /m2"): BẮT BUỘC ĐIỀN price_basis: "Theo m²".
     * KHI GIÁ TÍNH TRỌN CĂN / TỔNG DIỆN TÍCH (ví dụ: "50 triệu/tháng", "16tr", "200 tr/ tháng", "18tr"): BẮT BUỘC ĐIỀN price_basis: "Tổng căn".
     * Kho bãi, nhà xưởng, đất, văn phòng cho thuê báo giá theo m2: BẮT BUỘC điền price_basis: "Theo m²".
   - "price_period": KỲ HẠN GIÁ (QUY TẮC BẢO TOÀN NGUYÊN BẢN - ZERO EXTRAPOLATION):
     * "Theo tháng": CHỈ ĐIỀN khi tin nhắn có chữ rõ ràng chỉ kỳ hạn theo tháng (ví dụ: "/tháng", "triệu/tháng", "tr/tháng", "tr/th", "/th", "theo tháng", "1 tháng", "hàng tháng").
     * "Theo năm": CHỈ ĐIỀN khi tin nhắn có chữ rõ ràng chỉ kỳ hạn theo năm (ví dụ: "/năm", "triệu/năm", "theo năm", "1 năm").
     * "Một lần": CHỈ ĐIỀN khi tin nhắn thể hiện giao dịch bán, mua đứt, chuyển nhượng 1 lần.
     * NẾU TIN NHẮN KHÔNG NÊU RÕ KỲ HẠN (ví dụ: chỉ ghi "GIÁ thuê:150K / m2", "Giá thuê : 55tr", "giá 8,5tr", "12 triệu", "50tr", "39 triệu"): BẮT BUỘC ĐỂ NULL, TUYỆT ĐỐI KHÔNG TỰ SUY DIỄN HAY TỰ DỊCH NGHĨA THÀNH "Theo tháng"!
   - "price_text": Sao chép NGUYÊN VĂN câu giá từ tin nhắn (ví dụ: "150K / m2", "60 triệu/tháng (có TL)", "14 tr mpdv", "85 triệu/tháng", "55tr").

7. HOA HỒNG & ĐIỀU KIỆN HỢP ĐỒNG (GIỮ NGUYÊN VĂN):
   - "landlord_commission_text": Sao chép NGUYÊN VĂN câu chữ hoa hồng của chủ nhà (ví dụ: "1 tháng bên mình 50%", "hh full", "1 tháng tiền nhà").
   - "our_share_percent": Tỷ lệ % bên mình nhận nếu có nhắc (ví dụ: 50).
   - "our_share_text": Sao chép NGUYÊN VĂN (ví dụ: "bên mình 50%").
   - "lease_term_text": Sao chép NGUYÊN VĂN điều kiện cọc, đóng tiền, thời hạn hợp đồng từ tin nhắn (ví dụ: "thanh toán 3 cọc 1, hợp đồng 1 năm", "ký từ 3 năm trở lên", "6 cọc 1 hoặc 3 cọc 1, hợp đồng 3 năm trở lên").

8. BẢO TOÀN ĐIỀU KIỆN CẤM & NGÀNH NGHỀ HẠN CHẾ (NEGATIVE CONSTRAINTS):
   - Nếu tin nhắn có ghi chú hạn chế / ngành cấm của chủ nhà như:
     "không làm hàng ăn", "không ăn uống", "không nấu nướng", "không làm spa", "không ở lại", "cấm kinh doanh ăn uống"...
   - BẮT BUỘC PHẢI GIỮ NGUYÊN ĐIỀU KIỆN NÀY trong tóm tắt "key_details" ở cả 3 thứ tiếng:
     * vi: "... (chủ nhà không cho làm hàng ăn / kinh doanh ăn uống)"
     * en: "... (no food & beverage / restaurant businesses allowed)"
     * zh: "... (房东禁止餐饮业)"

8. TÓM TẮT 3 NGÔN NGỮ (key_details: vi, en, zh):
   - vi: Tóm tắt đầy đủ, súc tích, trung thực 100% dựa vào các thông số có thật của căn đó.
   - en & zh: Bản dịch tương ứng sát nghĩa và đầy đủ.

${goldenSamplesText}
`;

  try {
    const contents: any[] = [
      {
        role: "user",
        parts: [
          {
            text: `${systemPrompt}\n\n${transcript}`,
          },
        ],
      },
    ];

    const parsed = await executeWithKeyRotation(async (ai, apiKey, modelId) => {
      const response = await ai.models.generateContent({
        model: modelId,
        contents,
        config: {
          temperature: 0.0,
          topP: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              properties: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    source_text_snippet: { type: Type.STRING },
                    reasoning: {
                      type: Type.STRING,
                      nullable: true,
                      description: "Giải thích ngắn gọn trước khi bóc tách: căn này có nói diện tích từng tầng không, giá tính trọn căn hay theo m2, các trường nào thiếu để null.",
                    },
                    price_evidence: {
                      type: Type.STRING,
                      nullable: true,
                      description: "Chuỗi ký tự nguyên bản thể hiện giá tiền trong tin nhắn (ví dụ: '150K / m2', '60tr/ tháng')",
                    },
                    floor_area_evidence: {
                      type: Type.STRING,
                      nullable: true,
                      description: "Chuỗi ký tự nguyên bản thể hiện số tầng / diện tích từng tầng (ví dụ: '60m x 4 tầng', 'mỗi sàn 100m'). Nếu không có nhắc đến tầng thì bắt buộc null.",
                    },
                    furniture_evidence: {
                      type: Type.STRING,
                      nullable: true,
                      description: "Chuỗi ký tự nguyên bản thể hiện đồ đạc/hiện trạng nội thất",
                    },
                    address_text: { type: Type.STRING },
                    house_number: { type: Type.STRING, nullable: true },
                    street_name: { type: Type.STRING, nullable: true },
                    ward: { type: Type.STRING, nullable: true },
                    district_legacy: { type: Type.STRING, nullable: true },
                    province: { type: Type.STRING, nullable: true },
                    property_types: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    floor_area_m2: {
                      type: Type.STRING,
                      nullable: true,
                      description: "Diện tích mỗi tầng. CHỈ ĐIỀN KHI TIN NHẮN CÓ NÓI RÕ DIỆN TÍCH TỪNG TẦNG. Nếu tin nhắn chỉ nói tổng diện tích chung (như kho xưởng, đất, căn hộ): BẮT BUỘC ĐỂ NULL.",
                    },
                    total_lease_area_m2: { type: Type.NUMBER, nullable: true },
                    price_amount: { type: Type.NUMBER, nullable: true },
                    price_currency: {
                      type: Type.STRING,
                      enum: ["VND", "USD"],
                    },
                    price_period: {
                      type: Type.STRING,
                      nullable: true,
                      description: "Chỉ ghi 'Theo tháng', 'Theo năm', hoặc 'Một lần' nếu tin nhắn có từ ngữ nêu rõ kỳ hạn. Nếu không có chữ theo tháng/năm thì bắt buộc để null.",
                    },
                    price_basis: {
                      type: Type.STRING,
                      enum: ["total", "per_m2"],
                    },
                    price_text: { type: Type.STRING, nullable: true },
                    lease_term_text: { type: Type.STRING, nullable: true },
                    key_details: {
                      type: Type.OBJECT,
                      properties: {
                        vi: { type: Type.STRING },
                        en: { type: Type.STRING },
                        zh: { type: Type.STRING },
                      },
                      required: ["vi", "en", "zh"],
                    },
                    landlord_commission_text: { type: Type.STRING, nullable: true },
                    our_share_percent: { type: Type.NUMBER, nullable: true },
                    our_share_text: { type: Type.STRING, nullable: true },
                    handover_condition: {
                      type: Type.STRING,
                      nullable: true,
                    },
                    furniture_status: {
                      type: Type.STRING,
                      nullable: true,
                      description: "Cắt nguyên văn từ/cụm từ mô tả hiện trạng có trong tin nhắn (ví dụ: 'đủ đồ', 'full đồ', 'đồ cơ bản', 'full gỗ', 'nhà trống'...). Nếu không có thì để null.",
                    },
                    furniture_list: {
                      type: Type.STRING,
                      nullable: true,
                      description: "Danh sách món đồ liệt kê nguyên mẫu trong tin nhắn. Nếu không có thì để null.",
                    },
                  },
                  required: [
                    "address_text",
                    "property_types",
                    "price_currency",
                    "price_basis",
                    "key_details",
                  ],
                },
              },
              summary_note: { type: Type.STRING, nullable: true },
            },
            required: ["properties"],
          },
        },
      });

      if (!response || !response.text) {
        throw new Error("Phản hồi từ Gemini API rỗng.");
      }

      return JSON.parse(response.text);
    });

    const rawProps: any[] = parsed.properties || [];
    const sanitizedProps: ExtractedProperty[] = [];

    // Hậu kiểm soát chất lượng (Deterministic Sanity Check Gate)
    // Chỉ kiểm tra trên source_text_snippet của chính căn đó, tuyệt đối KHÔNG nối transcript chung
    for (const rawP of rawProps) {
      const textContext = rawP.source_text_snippet || "";
      const processed = postProcessBatchListing(rawP, textContext);
      sanitizedProps.push(processed);
    }

    return {
      properties: sanitizedProps,
      summary_note: parsed.summary_note,
    };
  } catch (err: any) {
    console.error("[Batch Extraction] Lỗi bóc tách hội thoại văn bản:", err);
    throw err;
  }
}

/**
 * Lớp bảo vệ hậu xử lý tất định cho từng căn trong Batch
 */
function postProcessBatchListing(prop: any, snippetText: string): ExtractedProperty {
  const text = `${prop.source_text_snippet || ""} ${snippetText || ""}`;

  // 1. Kiểm toán logic độc lập & xác minh bằng chứng (Grounding Auditor)
  const { prop: auditedProp, audit } = auditAndVerifyExtractedProperty(prop, text);
  prop = auditedProp;

  if (prop.key_details) {
    prop.key_details.grounding_audit = audit;
  }

  // 2. Fallback giá tiền nếu price_amount rỗng
  if (!prop.price_amount || prop.price_amount <= 0) {
    const priceMatch = text.match(/(?:giá(?: thuê)?|chào)?\s*[:\s]*(\d+(?:[.,]\d+)?)\s*(tr(?:iệu)?|củ|tỷ|k|usd|\$)/i);
    if (priceMatch) {
      const num = parseFloat(priceMatch[1].replace(",", "."));
      const unit = priceMatch[2].toLowerCase();
      if (unit.startsWith("tr") || unit === "củ") {
        prop.price_amount = Math.round(num * 1000000);
        prop.price_currency = "VND";
        prop.price_basis = prop.price_basis || "total";
        if (!prop.price_text) prop.price_text = `${priceMatch[1]} triệu`;
      } else if (unit === "tỷ") {
        prop.price_amount = Math.round(num * 1000000000);
        prop.price_currency = "VND";
        if (!prop.price_text) prop.price_text = `${priceMatch[1]} tỷ`;
      } else if (unit === "usd" || unit === "$") {
        prop.price_amount = num;
        prop.price_currency = "USD";
        if (!prop.price_text) prop.price_text = `${priceMatch[1]} USD`;
      }
    }
  } else if (prop.price_amount > 0 && prop.price_amount < 1000 && prop.price_currency !== "USD") {
    prop.price_amount = Math.round(prop.price_amount * 1000000);
  }

  // 3. Fallback diện tích đa tầng & diện tích từng tầng
  const multiFloorAreas = extractMultiFloorAreas(text);
  if (multiFloorAreas) {
    prop.floor_area_m2 = multiFloorAreas.floorAreaStr;
    if (!prop.total_lease_area_m2 || prop.total_lease_area_m2 <= 0) {
      prop.total_lease_area_m2 = multiFloorAreas.totalArea;
    }
  }

  // 4. Kỳ hạn giá: Chỉ gán khi tin nhắn thực sự có từ ngữ chỉ kỳ hạn
  const detectedPeriod = detectPricePeriod(prop.price_text, prop.source_text_snippet || text);
  if (detectedPeriod) {
    prop.price_period = detectedPeriod;
  } else {
    prop.price_period = null;
  }

  // 5. Chuẩn hóa tiếng Việt cho Loại hình BĐS
  const TYPE_MAP: Record<string, string> = {
    townhouse: "Nhà phố",
    apartment: "Chung cư",
    villa: "Biệt thự",
    warehouse: "Kho bãi",
    factory: "Nhà xưởng",
    office: "Văn phòng",
    retail: "Mặt bằng",
    land: "Đất",
    hotel: "Khách sạn",
  };
  if (Array.isArray(prop.property_types)) {
    prop.property_types = prop.property_types.map((t: string) => TYPE_MAP[t] || t);
  } else if (typeof prop.property_types === "string") {
    prop.property_types = [TYPE_MAP[prop.property_types] || prop.property_types];
  }

  return prop;
}
