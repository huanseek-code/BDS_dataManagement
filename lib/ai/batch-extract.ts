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
Nhiệm vụ của bạn là đọc DÒNG THỜI GIAN CÁC TIN NHẮN VĂN BẢN từ đối tác môi giới, nhận diện chính xác có MỘT hay NHIỀU căn BĐS độc lập và trích xuất thành danh sách chuẩn hóa.

NGUYÊN TẮC CỐT LÕI (ƯU TIÊN ĐỘ CHÍNH XÁC TUYỆT ĐỐI):

1. CHỈ TRÍCH XUẤT CÁC THÔNG SỐ CÓ THỰC TRONG TIN NHẮN (STRICT FIDELITY - NO HALLUCINATION):
   - CHỈ lấy những thông tin thực sự được viết trong tin nhắn.
   - NẾU THIẾU TRƯỜNG DỮ LIỆU CŨNG KHÔNG SAO: Nếu tin nhắn không nói rõ quận, phường, số nhà, thời hạn thuê, hoa hồng... -> BẮT BUỘC ĐỂ NULL HOẶC ĐỂ TRỐNG.
   - TUYỆT ĐỐI KHÔNG TỰ BỊA RA, KHÔNG SUY ĐOÁN những thông tin không có trong văn bản!

2. PHÂN TÁCH ĐA CĂN BĐS (MULTI-PROPERTY SEPARATION):
   - Nhận diện đúng có bao nhiêu căn BĐS độc lập trong đợt gửi:
     * Có thể mỗi tin nhắn là 1 căn (Ví dụ: Tin 1 là Tòa A3, Tin 2 là S403, Tin 3 là Tòa A2).
     * Hoặc trong cùng 1 tin nhắn dài có danh sách nhiều căn.
   - Mỗi căn BĐS phải là một phần tử riêng trong mảng "properties".
   - "source_text_snippet": BẮT BUỘC trích nguyên văn đoạn văn bản mô tả riêng của căn đó để người duyệt đối chiếu.

3. HIỆN TRẠNG BÀN GIAO (handover_condition - BẮT BUỘC DÙNG 4 MÃ ENUM KHI CÓ DỮ LIỆU):
   - "fully_furnished": Đầy đủ nội thất, full đồ, full nội thất, full option
   - "partially_furnished": Nội thất cơ bản, đồ liền tường, đã có bếp/điều hòa
   - "basic_unfurnished": Hoàn thiện cơ bản, không đồ, nhà trống, chưa có nội thất rời
   - "bare_shell": Bàn giao thô, nhà thô, chưa hoàn thiện trần sàn đèn
   Nếu tin nhắn không đề cập đến hiện trạng nội thất -> để null.

4. BẢO TOÀN ĐIỀU KIỆN CẤM & NGÀNH NGHỀ HẠN CHẾ (NEGATIVE CONSTRAINTS):
   - Nếu tin nhắn có ghi chú hạn chế / ngành cấm của chủ nhà như:
     "không làm hàng ăn", "không ăn uống", "không nấu nướng", "không làm spa", "không ở lại", "cấm kinh doanh ăn uống"...
   - BẮT BUỘC PHẢI GIỮ NGUYÊN ĐIỀU KIỆN NÀY trong tóm tắt "key_details" ở cả 3 thứ tiếng:
     * vi: "... (chủ nhà không cho làm hàng ăn / kinh doanh ăn uống)"
     * en: "... (no food & beverage / restaurant businesses allowed)"
     * zh: "... (房东禁止餐饮业)"

5. QUY ĐỔI GIÁ TIỀN & DIỆN TÍCH:
   - "16tr mpdv" -> price_amount: 16000000, price_currency: "VND", price_basis: "total", price_period: "month", price_text: "16 triệu/tháng (miễn phí dịch vụ)"
   - "17 triệu/tháng" -> price_amount: 17000000, price_currency: "VND", price_basis: "total", price_period: "month", price_text: "17 triệu/tháng"
   - "14 tr mpdv" -> price_amount: 14000000, price_currency: "VND", price_basis: "total", price_period: "month", price_text: "14 triệu/tháng (mpdv)"
   - "180m2 x 8 tầng" -> floor_area_m2: 180, total_lease_area_m2: 1440
   - "62m" -> floor_area_m2: 62
   - "95m2" -> floor_area_m2: 95
   - "60m" -> floor_area_m2: 60

6. TÓM TẮT 3 NGÔN NGỮ (key_details: vi, en, zh):
   - Tạo bản tóm tắt ngắn gọn, súc tích bằng Tiếng Việt, Tiếng Anh, Tiếng Trung dựa HOÀN TOÀN vào các thông số có thật của căn đó.
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
                      enum: ["bare_shell", "basic_unfurnished", "partially_furnished", "fully_furnished"],
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

  // 1. Chuẩn hóa handover_condition
  if (prop.handover_condition) {
    const hc = String(prop.handover_condition).toLowerCase();
    if (hc.includes("full") || hc.includes("đầy đủ") || hc.includes("精装") || hc === "fully_furnished") {
      prop.handover_condition = "fully_furnished";
    } else if (hc.includes("liền tường") || hc.includes("cơ bản") || hc === "partially_furnished") {
      prop.handover_condition = "partially_furnished";
    } else if (hc.includes("thô") || hc.includes("毛坯") || hc === "bare_shell") {
      prop.handover_condition = "bare_shell";
    } else if (hc.includes("không đồ") || hc.includes("nhà trống") || hc === "basic_unfurnished") {
      prop.handover_condition = "basic_unfurnished";
    }
  } else {
    if (/full\s*(?:nội\s*thất|đồ)/i.test(combined)) {
      prop.handover_condition = "fully_furnished";
    } else if (/bàn\s*giao\s*thô|nhà\s*thô/i.test(combined)) {
      prop.handover_condition = "bare_shell";
    } else if (/không\s*đồ|nhà\s*trống|chưa\s*có\s*nội\s*thất/i.test(combined)) {
      prop.handover_condition = "basic_unfurnished";
    }
  }

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

  return prop;
}
