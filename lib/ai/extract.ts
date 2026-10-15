import "server-only";
import { GoogleGenAI, Type } from "@google/genai";

export interface ExtractedProperty {
  address_text: string;
  house_number: string | null;
  street_name: string | null;
  ward: string | null;
  district_legacy: string | null;
  province: string | null;
  property_types: string[]; // factory, warehouse, office, retail, townhouse, villa, apartment, land, hotel, other
  floor_area_m2: number | null;
  total_lease_area_m2: number | null;
  price_amount: number | null;
  price_currency: string;
  price_period: string;
  price_basis: string;
  price_text: string | null;
  key_details: {
    vi: string;
    en: string;
    zh: string;
  };
  landlord_commission_text: string | null;
  our_share_percent: number | null;
  our_share_text: string | null;
}

export interface ExtractionResult {
  decision?: "CONTINUATION" | "NEW_PROPERTY";
  properties: ExtractedProperty[];
  needs_reply: boolean;
  reply_suggestion?: string;
}

export async function extractPropertiesFromChat(
  rawText: string,
  imageUrls: string[] = [],
  existingContext?: string | null
): Promise<ExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const modelId = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  const ai = new GoogleGenAI({ apiKey });

  const hasContext = Boolean(existingContext && existingContext.trim().length > 0);

  const systemPrompt = `
Bạn là chuyên gia bóc tách dữ liệu Bất động sản (BĐS) chuyên nghiệp cho công ty Huanseek.
Nhiệm vụ của bạn là đọc các tin nhắn gửi từ đối tác môi giới (có thể viết tắt, tiếng lóng, gửi rải rác) và trích xuất thành danh sách các căn BĐS chuẩn hóa.

QUY TẮC CỐT LÕI:
1. MỘT LẦN GỬI CÓ THỂ CHỨA NHIỀU CĂN: Hãy tách riêng từng căn vào mảng "properties".
2. KHÔNG SUY ĐOÁN: Trường nào tin nhắn không nhắc tới thì trả về null.
3. QUY ĐỔI GIÁ:
   - "12 tỷ 5", "12.5 tỷ" -> price_amount: 12500000000, price_currency: "VND"
   - "45 tr", "45 triệu" -> price_amount: 45000000, price_currency: "VND"
   - "4.5 USD/m2", "5$/m2" -> price_amount: 4.5, price_currency: "USD", price_basis: "per_m2"
   - "85000đ/m2", "85k/m2" -> price_amount: 85000, price_currency: "VND", price_basis: "per_m2"
   - Luôn giữ nguyên văn ở "price_text" (ví dụ: "85000đ/m2/tháng").
4. LOẠI HÌNH (property_types): Chọn từ danh sách: ["factory", "warehouse", "office", "retail", "townhouse", "villa", "apartment", "land", "hotel", "other"].
5. CHI TIẾT CHÍNH (key_details):
   - Tóm tắt kết cấu, hiện trạng, PCCC, đường xe tải, tiện ích...
   - Tự động viết bằng 3 ngôn ngữ: vi (Tiếng Việt), en (English), zh (中文).
6. CHU KỲ GIÁ (price_period): Chỉ chọn "month", "year", hoặc "one_time" (không dùng "monthly").
${
  hasContext
    ? `
7. PHÁN ĐOÁN NGỮ NGHĨA KHI CÓ HỒ SƠ ĐANG CHỜ DUYỆT TRƯỚC ĐÓ:
   - Trường "decision":
     + Điền "CONTINUATION" nếu tin nhắn mới là phần tiếp nối hoặc bổ sung thông tin (giá tiền, diện tích, hoa hồng, tiện ích PCCC, số điện thoại, sửa giá...) cho căn BĐS đang chờ duyệt. Trong trường hợp này, HỢP NHẤT TOÀN BỘ thông tin cũ và mới lại thành 1 căn DUY NHẤT hoàn chỉnh (không bỏ sót địa chỉ cũ, ghép giá và SĐT mới vào).
     + Điền "NEW_PROPERTY" nếu tin nhắn mới rõ ràng là một căn BĐS khác (địa chỉ/vị trí khác hoàn toàn, hoặc khách nói "căn thứ 2", "căn nữa").
`
    : `
7. Trường "decision": Mặc định điền "NEW_PROPERTY".
`
}
`;

  try {
    const promptUserText = hasContext
      ? `${systemPrompt}

--- HỒ SƠ BĐS ĐANG CHỜ DUYỆT TRƯỚC ĐÓ CỦA ĐỐI TÁC NÀY ---
${existingContext}

--- TIN NHẮN MỚI VỪA GỬI ---
${rawText}`
      : `${systemPrompt}

--- NỘI DUNG TIN NHẮN TỪ ĐỐI TÁC ---
${rawText}`;

    const contents: any[] = [
      {
        role: "user",
        parts: [
          {
            text: promptUserText,
          },
        ],
      },
    ];

    const response = await ai.models.generateContent({
      model: modelId,
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            decision: {
              type: Type.STRING,
              description: "CONTINUATION (bổ sung cho căn trước) hoặc NEW_PROPERTY (căn BĐS mới)",
            },
            properties: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
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
            needs_reply: { type: Type.BOOLEAN },
            reply_suggestion: { type: Type.STRING, nullable: true },
          },
          required: ["properties", "needs_reply"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    return {
      decision: (parsed.decision === "CONTINUATION" || parsed.decision === "NEW_PROPERTY") ? parsed.decision : (hasContext ? "CONTINUATION" : "NEW_PROPERTY"),
      properties: parsed.properties || [],
      needs_reply: Boolean(parsed.needs_reply),
      reply_suggestion: parsed.reply_suggestion,
    };
  } catch (error: any) {
    console.error("AI extraction error:", error);
    throw error;
  }
}
