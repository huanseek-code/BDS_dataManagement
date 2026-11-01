import "server-only";
import { Type } from "@google/genai";
import { executeWithKeyRotation } from "./key-manager";
import { ExtractedProperty } from "./extract";
import { getGoldenSamplesForPrompt, verifyVerbatimSpan, detectPricePeriod, extractMultiFloorAreas } from "./golden-samples";

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

4. DIỆN TÍCH MỖI TẦNG (floor_area_m2) & TỔNG DIỆN TÍCH (total_lease_area_m2):
   - "total_lease_area_m2": Luôn là TỔNG TOÀN BỘ DIỆN TÍCH CHO THUÊ (ví dụ: 180m2 x 8 tầng = 1440; hoặc Tầng 1: 50m, Tầng 2: 70m, Tầng 3: 80m -> Tổng = 50 + 70 + 80 = 200).
   - "floor_area_m2" (DIỆN TÍCH MỖI TẦNG):
     * NẾU CÁC TẦNG ĐỀU NHAU (hoặc nhà 1 tầng, chung cư, kho xưởng): Điền 1 con số diện tích mỗi tầng (ví dụ: "180m2 x 8 tầng" -> "180", "90m2 x 5 tầng" -> "90", "63m2" -> "63").
     * NẾU DIỆN TÍCH CÁC TẦNG KHÁC NHAU: Liệt kê diện tích từng tầng cách nhau bằng dấu phẩy theo thứ tự từ tầng 1 lên (ví dụ: "Tầng 1: 50m, Tầng 2: 70m, Tầng 3: 80m" -> điền "50, 70, 80").
     * TUYỆT ĐỐI KHÔNG chỉ lấy mỗi tầng 1 mà bỏ sót các tầng khác khi các tầng có diện tích khác nhau!

5. NỘI THẤT & DANH SÁCH MÓN ĐỒ (VERBATIM SPAN EXTRACTION - TRÍCH NGUYÊN GỐC TỪNG CHỮ):
   - "furniture_status": CẮT ĐÚNG TỪ/CỤM TỪ NGUYÊN GỐC trong tin nhắn thể hiện hiện trạng nội thất (ví dụ: "đủ đồ", "full đồ", "đồ cơ bản", "full gỗ", "nhà trống", "bàn giao thô", "nguyên bản cđt"...).
     * TUYỆT ĐỐI KHÔNG TỰ QUY ĐỔI (ví dụ: tin ghi "đủ đồ" thì trích đúng "đủ đồ", CẤM đổi thành "đầy đủ nội thất").
     * NẾU TIN KHÔNG CÓ CỤM TỪ NÀO CHỈ HIỆN TRẠNG (ví dụ: chỉ liệt kê món đồ "Dh, nl, giường, bếp" hoặc không nhắc gì): BẮT BUỘC ĐỂ NULL, TUYỆT ĐỐI KHÔNG TỰ ĐẶT TỪ "chưa rõ" VÀO ĐÂY!
   - "furniture_list": Trích xuất NGUYÊN MẪU danh sách các món đồ được liệt kê trong tin nhắn (ví dụ: "Dh, nl, giường, bếp", "Dh âm trần, nl, THANG MÁY", "có bếp rèm", "6 điều hoà, 6 nóng lạnh, tủ bếp").
     * Nguồn nói rõ không có món nào thì ghi rõ đúng câu chữ đó (ví dụ: "riêng tủ lạnh chưa có", "chưa có giường").
     * Nếu tin nhắn không liệt kê món đồ nào thì để null hoặc "".

5. GIÁ TIỀN & ĐƠN VỊ & CƠ SỞ TÍNH GIÁ (GIỮ NGUYÊN BẢN TIẾNG VIỆT):
   - "price_amount": Con số quy đổi đầy đủ (ví dụ: "60 triệu/tháng" -> 60000000, "12 tr" -> 12000000, "85 triệu" -> 85000000; "2000$" -> 2000). Luôn tính đúng đơn vị triệu, tuyệt đối không để số 12 hay 85.
   - "price_currency": "VND" hoặc "USD".
   - "price_basis": Điền chữ tiếng Việt nguyên bản: "Tổng căn" hoặc "Theo m²".
   - "price_period": KỲ HẠN GIÁ (QUY TẮC BẢO TOÀN NGUYÊN BẢN - ZERO EXTRAPOLATION):
     * "Theo tháng": CHỈ ĐIỀN khi tin nhắn có chữ rõ ràng chỉ kỳ hạn theo tháng (ví dụ: "/tháng", "triệu/tháng", "tr/tháng", "tr/th", "/th", "theo tháng", "1 tháng", "hàng tháng").
     * "Theo năm": CHỈ ĐIỀN khi tin nhắn có chữ rõ ràng chỉ kỳ hạn theo năm (ví dụ: "/năm", "triệu/năm", "theo năm", "1 năm").
     * "Một lần": CHỈ ĐIỀN khi tin nhắn thể hiện giao dịch bán, mua đứt, chuyển nhượng 1 lần.
     * NẾU TIN NHẮN KHÔNG NÊU RÕ KỲ HẠN (ví dụ: chỉ ghi "Giá thuê : 55tr", "giá 8,5tr", "12 triệu", "50tr", "39 triệu"): BẮT BUỘC ĐỂ NULL, TUYỆT ĐỐI KHÔNG TỰ SUY DIỄN HAY TỰ DỊCH NGHĨA THÀNH "Theo tháng"!
   - "price_text": Sao chép NGUYÊN VĂN câu giá từ tin nhắn (ví dụ: "60 triệu/tháng (có TL)", "14 tr mpdv", "85 triệu/tháng", "55tr").

6. HOA HỒNG & ĐIỀU KIỆN HỢP ĐỒNG (GIỮ NGUYÊN VĂN):
   - "landlord_commission_text": Sao chép NGUYÊN VĂN câu chữ hoa hồng của chủ nhà (ví dụ: "1 tháng bên mình 50%", "hh full", "1 tháng tiền nhà").
   - "our_share_percent": Tỷ lệ % bên mình nhận nếu có nhắc (ví dụ: 50).
   - "our_share_text": Sao chép NGUYÊN VĂN (ví dụ: "bên mình 50%").
   - "lease_term_text": Sao chép NGUYÊN VĂN điều kiện cọc, đóng tiền, thời hạn hợp đồng từ tin nhắn (ví dụ: "thanh toán 3 cọc 1, hợp đồng 1 năm", "ký từ 3 năm trở lên").

7. BẢO TOÀN ĐIỀU KIỆN CẤM & NGÀNH NGHỀ HẠN CHẾ (NEGATIVE CONSTRAINTS):
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
                      description: "Diện tích mỗi tầng. Nếu các tầng bằng nhau hoặc nhà 1 tầng: ghi 1 số (vd: '180', '90'). Nếu các tầng khác nhau: liệt kê cách nhau bằng dấu phẩy theo thứ tự từ tầng 1 lên (vd: '50, 70, 80').",
                    },
                    total_lease_area_m2: { type: Type.NUMBER, nullable: true },
                    price_amount: { type: Type.NUMBER, nullable: true },
                    price_currency: { type: Type.STRING },
                    price_period: {
                      type: Type.STRING,
                      nullable: true,
                      description: "Chỉ ghi 'Theo tháng', 'Theo năm', hoặc 'Một lần' nếu tin nhắn có từ ngữ nêu rõ kỳ hạn. Nếu không có chữ theo tháng/năm thì bắt buộc để null.",
                    },
                    price_basis: { type: Type.STRING },
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

  // 1. Chốt chặn xác thực chuỗi con nguyên bản (Zero-Hallucination Substring Verifier):
  // Bất kỳ chữ nào không có trong tin nhắn gốc -> tự động loại bỏ về null
  prop.furniture_status = verifyVerbatimSpan(prop.furniture_status, text);
  prop.furniture_list = verifyVerbatimSpan(prop.furniture_list, text) || prop.furniture_list || null;
  prop.handover_condition = prop.furniture_status || null;

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
  }

  // 3. Fallback diện tích đa tầng & diện tích từng tầng
  const multiFloorAreas = extractMultiFloorAreas(text);
  if (multiFloorAreas) {
    // Nếu có bóc tách đa tầng cụ thể (vd: T1: 50m, T2: 70m, T3: 80m -> '50, 70, 80')
    prop.floor_area_m2 = multiFloorAreas.floorAreaStr;
    if (!prop.total_lease_area_m2 || prop.total_lease_area_m2 <= 0) {
      prop.total_lease_area_m2 = multiFloorAreas.totalArea;
    }
  } else if (!prop.floor_area_m2) {
    const multiFloorMatch = text.match(/(\d+(?:[.,]\d+)?)\s*m2?\s*[x*]\s*(\d+)\s*tầng/i);
    if (multiFloorMatch) {
      const perFloor = parseFloat(multiFloorMatch[1].replace(",", "."));
      const floors = parseInt(multiFloorMatch[2], 10);
      prop.floor_area_m2 = String(perFloor);
      if (!prop.total_lease_area_m2) {
        prop.total_lease_area_m2 = Math.round(perFloor * floors);
      }
    }
  } else if (typeof prop.floor_area_m2 === "number") {
    prop.floor_area_m2 = String(prop.floor_area_m2);
  }

  // 4. Bảo tồn điều kiện cấm "không làm hàng ăn"
  const foodBanMatch = text.match(/không\s*(?:làm\s*)?(?:hàng\s*ăn|ăn\s*uống|kinh\s*doanh\s*ăn\s*uống|quán\s*ăn)/i);
  if (foodBanMatch && prop.key_details) {
    if (!/không\s*(?:làm\s*)?(?:hàng\s*ăn|ăn\s*uống)/i.test(prop.key_details.vi)) {
      prop.key_details.vi += " (Không làm hàng ăn/uống)";
    }
    if (!/no\s*(?:f&b|food|restaurant)/i.test(prop.key_details.en)) {
      prop.key_details.en += " (No F&B/restaurant allowed)";
    }
    if (!/禁止餐饮/i.test(prop.key_details.zh)) {
      prop.key_details.zh += " (禁止餐饮餐饮业)";
    }
  }

  // 5. Chuẩn hóa tỷ lệ tiền triệu nếu price_amount nhỏ hơn 1000 (ví dụ AI trả 12 thay vì 12000000)
  if (prop.price_amount && prop.price_amount > 0 && prop.price_amount < 1000) {
    prop.price_amount = Math.round(prop.price_amount * 1000000);
  }

  // 6. Giữ nguyên bản tiếng Việt cho Cách tính giá & Kỳ hạn
  if (prop.price_basis === "per_m2" || String(prop.price_basis).toLowerCase().includes("m2") || String(prop.price_basis).toLowerCase().includes("m²")) {
    prop.price_basis = "Theo m²";
  } else {
    prop.price_basis = "Tổng căn";
  }

  // Xác thực kỳ hạn giá: chỉ gán khi tin nhắn thực sự có từ ngữ chỉ kỳ hạn
  const detectedPeriod = detectPricePeriod(prop.price_text, prop.source_text_snippet || text);
  if (detectedPeriod) {
    prop.price_period = detectedPeriod;
  } else {
    // Tin nhắn KHÔNG CÓ chữ tháng/năm/bán -> Tuyệt đối không tự suy diễn hay dịch nghĩa theo tháng!
    prop.price_period = null;
  }

  // 7. Chuẩn hóa tiếng Việt cho Loại hình BĐS
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
