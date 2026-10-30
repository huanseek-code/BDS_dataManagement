import "server-only";
import { Type } from "@google/genai";
import { executeWithKeyRotation } from "./key-manager";
import { ExtractedProperty } from "./extract";

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

  const systemPrompt = `
Bạn là chuyên gia thẩm định và bóc tách dữ liệu Bất động sản (BĐS) hàng đầu cho Huanseek.
Nhiệm vụ của bạn là đọc DÒNG THỜI GIAN CÁC TIN NHẮN VĂN BẢN từ đối tác môi giới, nhận diện chính xác có MỘT hay NHIỀU căn BĐS độc lập và trích xuất thành danh sách chuẩn hóa thuần text.

NGUYÊN TẮC CỐT LÕI - BÓC TÁCH ĐẦY ĐỦ & GIỮ NGUYÊN BẢN TIN NHẮN (STRICT VERBATIM FIDELITY):

1. BÓC TÁCH TOÀN BỘ CÁC THÔNG SỐ CÓ THỰC TRONG TIN NHẮN:
   - Trích xuất đầy đủ và triệt để mọi thông tin có trong văn bản: địa chỉ, loại hình, diện tích sàn, tổng diện tích, số tầng, mặt tiền, kết cấu phòng/vệ sinh, đồ đạc nội thất, giá thuê/bán, điều kiện thanh toán/cọc, thời hạn hợp đồng, hoa hồng chủ nhà trả, hoa hồng bên mình nhận, công năng phù hợp, ngành nghề cấm/hạn chế, số điện thoại liên hệ...
   - CHỈ TRÍCH XUẤT THÔNG TIN THỰC SỰ CÓ TRONG TIN NHẮN. NẾU THIẾU TRƯỜNG DỮ LIỆU CŨNG KHÔNG SAO: Nếu tin nhắn không nói rõ quận, phường, số nhà, thời hạn thuê, hoa hồng... -> BẮT BUỘC ĐỂ NULL HOẶC ĐỂ TRỐNG.
   - TUYỆT ĐỐI KHÔNG TỰ BỊA RA, KHÔNG SUY ĐOÁN những thông tin không có trong văn bản!

2. PHÂN TÁCH ĐA CĂN BĐS (MULTI-PROPERTY SEPARATION):
   - Nhận diện đúng có bao nhiêu căn BĐS độc lập trong đợt gửi (mỗi căn là một phần tử riêng trong mảng "properties").
   - "source_text_snippet": BẮT BUỘC trích nguyên văn đoạn văn bản mô tả riêng của căn đó để người duyệt đối chiếu.

3. LOẠI HÌNH BĐS (property_types) - GIỮ NGUYÊN BẢN TIẾNG VIỆT:
   - Trích xuất NGUYÊN MẪU cụm từ chỉ loại hình BĐS có trong tin nhắn dưới dạng tiếng Việt (ví dụ: ["Nhà liền kề"], ["Nhà mặt phố"], ["Căn hộ chung cư"], ["Biệt thự"], ["Kho xưởng"], ["Văn phòng"], ["Mặt bằng kinh doanh"]...).
   - TUYỆT ĐỐI KHÔNG DỊCH sang tiếng Anh (không dùng "townhouse", "apartment", "villa"...).

4. NỘI THẤT & DANH SÁCH MÓN ĐỒ (Trích xuất nguyên mẫu câu chữ tiếng Việt):
   - "furniture_status": Điền trực tiếp chữ tiếng Việt (Chỉ chọn 1 trong 5 giá trị):
     * "đầy đủ nội thất": Khi nguồn ghi rõ "full nội thất", "full đồ", "full option", "đầy đủ nội thất", "đủ đồ".
     * "cơ bản": Khi nguồn ghi "nội thất cơ bản", "đồ cơ bản", "không full", "bán hoàn thiện". TUYỆT ĐỐI KHÔNG DỰA VÀO SỐ LƯỢNG ĐỒ ĐƯỢC LIỆT KÊ ĐỂ TỰ ĐỔI TỪ CƠ BẢN THÀNH FULL! Dù liệt kê bao nhiêu món đồ đi nữa, hễ có chữ "cơ bản/không full" thì bắt buộc ghi "cơ bản".
     * "không nội thất": Khi nguồn ghi rõ "không nội thất", "không đồ", "nhà trống".
     * "bàn giao thô": Khi nguồn ghi rõ "bàn giao thô", "nhà thô".
     * "chưa rõ": Khi tin nhắn hoàn toàn KHÔNG NHẮC GÌ đến nội thất (tin này vẫn nhập bình thường, không dừng lại).
   - "furniture_list": Trích xuất NGUYÊN MẪU danh sách các món đồ được liệt kê trong tin nhắn (ví dụ: "6 điều hoà, 6 nóng lạnh, thang máy tốc độ cao, tủ bếp").
     * Nguồn nói rõ không có món nào thì ghi rõ đúng câu chữ đó (ví dụ: "riêng tủ lạnh chưa có", "chưa có giường").
     * Không nhắc đến không có nghĩa là không có (tuyệt đối không tự suy đoán thêm món nào).
     * Nếu tin nhắn không liệt kê món đồ nào thì để null hoặc "".

5. GIÁ TIỀN & ĐƠN VỊ & CƠ SỞ TÍNH GIÁ (GIỮ NGUYÊN BẢN TIẾNG VIỆT):
   - "price_amount": Con số quy đổi đầy đủ (ví dụ: "60 triệu/tháng" -> 60000000, "12 tr" -> 12000000, "85 triệu" -> 85000000; "2000$" -> 2000). Luôn tính đúng đơn vị triệu, tuyệt đối không để số 12 hay 85.
   - "price_currency": "VND" hoặc "USD".
   - "price_basis": Điền chữ tiếng Việt nguyên bản: "Tổng căn" hoặc "Theo m²".
   - "price_period": Điền chữ tiếng Việt nguyên bản: "Theo tháng", "Theo năm", hoặc "Một lần".
   - "price_text": Sao chép NGUYÊN VĂN câu giá từ tin nhắn (ví dụ: "60 triệu/tháng (có TL)", "14 tr mpdv", "85 triệu/tháng").

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
                    floor_area_m2: { type: Type.NUMBER, nullable: true },
                    total_lease_area_m2: { type: Type.NUMBER, nullable: true },
                    price_amount: { type: Type.NUMBER, nullable: true },
                    price_currency: { type: Type.STRING },
                    price_period: { type: Type.STRING },
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
                      enum: ["đầy đủ nội thất", "cơ bản", "không nội thất", "bàn giao thô", "chưa rõ"],
                    },
                    furniture_list: {
                      type: Type.STRING,
                      nullable: true,
                    },
                  },
                  required: [
                    "address_text",
                    "property_types",
                    "price_currency",
                    "price_period",
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
    for (const rawP of rawProps) {
      const textContext = `${rawP.source_text_snippet || ""} ${transcript}`;
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
function postProcessBatchListing(prop: any, text: string): ExtractedProperty {
  const combined = `${prop.source_text_snippet || ""} ${text} ${prop.key_details?.vi || ""}`;

  // 1. Chuẩn hóa furniture_status & handover_condition theo đúng 3 quy tắc
  if (/nội\s*thất\s*cơ\s*bản|đồ\s*cơ\s*bản|không\s*full/i.test(combined)) {
    // Quy tắc 1: Có "cơ bản / không full" thì tuyệt đối là "cơ bản", không cho đổi thành full
    prop.furniture_status = "cơ bản";
  } else if (/full\s*(?:nội\s*thất|đồ|option)|đầy\s*đủ\s*(?:nội\s*thất|đồ)/i.test(combined)) {
    prop.furniture_status = "đầy đủ nội thất";
  } else if (/không\s*nội\s*thất|không\s*đồ|nhà\s*trống/i.test(combined)) {
    // Quy tắc 3: Ghi rõ không có nội thất -> "không nội thất"
    prop.furniture_status = "không nội thất";
  } else if (/bàn\s*giao\s*thô|nhà\s*thô/i.test(combined)) {
    prop.furniture_status = "bàn giao thô";
  } else if (!prop.furniture_status || prop.furniture_status === "unknown" || prop.furniture_status === "chưa rõ") {
    // Quy tắc 3: Không nói gì -> "chưa rõ"
    prop.furniture_status = "chưa rõ";
  }

  prop.handover_condition = prop.furniture_status;

  // 2. Fallback giá tiền nếu price_amount rỗng
  if (!prop.price_amount || prop.price_amount <= 0) {
    const priceMatch = combined.match(/(?:giá(?: thuê)?|chào)?\s*[:\s]*(\d+(?:[.,]\d+)?)\s*(tr(?:iệu)?|củ|tỷ|k|usd|\$)/i);
    if (priceMatch) {
      const num = parseFloat(priceMatch[1].replace(",", "."));
      const unit = priceMatch[2].toLowerCase();
      if (unit.startsWith("tr") || unit === "củ") {
        prop.price_amount = Math.round(num * 1000000);
        prop.price_currency = "VND";
        prop.price_period = prop.price_period || "month";
        prop.price_basis = prop.price_basis || "total";
        if (!prop.price_text) prop.price_text = `${priceMatch[1]} triệu/tháng`;
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

  // 3. Fallback diện tích đa tầng: "180m2 x 8 tầng"
  if (!prop.floor_area_m2) {
    const multiFloorMatch = combined.match(/(\d+(?:[.,]\d+)?)\s*m2?\s*[x*]\s*(\d+)\s*tầng/i);
    if (multiFloorMatch) {
      const perFloor = parseFloat(multiFloorMatch[1].replace(",", "."));
      const floors = parseInt(multiFloorMatch[2], 10);
      prop.floor_area_m2 = perFloor;
      if (!prop.total_lease_area_m2) {
        prop.total_lease_area_m2 = Math.round(perFloor * floors);
      }
    }
  }

  // 4. Bảo tồn điều kiện cấm "không làm hàng ăn"
  const foodBanMatch = combined.match(/không\s*(?:làm\s*)?(?:hàng\s*ăn|ăn\s*uống|kinh\s*doanh\s*ăn\s*uống|quán\s*ăn)/i);
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

  if (prop.price_period === "year" || String(prop.price_period).toLowerCase().includes("năm")) {
    prop.price_period = "Theo năm";
  } else if (prop.price_period === "one_time" || String(prop.price_period).toLowerCase().includes("lần") || String(prop.price_period).toLowerCase().includes("bán")) {
    prop.price_period = "Một lần";
  } else {
    prop.price_period = "Theo tháng";
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
