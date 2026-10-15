const { GoogleGenAI, Type } = require("@google/genai");

const apiKey = process.env.GEMINI_API_KEY || "";
const modelId = "gemini-3.1-flash-lite";
const ai = new GoogleGenAI({ apiKey });

const sampleChat = `
Em chào bên anh. Em gửi bên anh 2 căn nguồn này nhé:
Căn 1: Kho xưởng KCN Sóng Thần 2, Dĩ An, Bình Dương. Diện tích 4.200m2, trạm điện 630kVA, PCCC vách tường nghiệm thu. Giá chào 4.2$/m2/tháng. Hoa hồng chủ gửi 1 tháng, bên em chia 50-50.
Căn 2: Nhà mặt tiền 85 Nguyễn Trãi, P. Bến Thành, Quận 1. DT 8x20m, 1 trệt 3 lầu, DTSD khoảng 640m2. Giá 180 triệu/tháng còn thương lượng. Hoa hồng nửa tháng.
`;

const systemPrompt = `
Bạn là chuyên gia bóc tách dữ liệu Bất động sản (BĐS) cho Huanseek.
Nhiệm vụ: đọc tin nhắn môi giới và bóc tách thành mảng "properties".
Quy tắc:
1. Tách từng căn thành 1 phần tử trong mảng properties.
2. Không suy đoán trường bị thiếu (trả null).
3. Quy đổi giá về VND hoặc USD.
4. Trường key_details viết tóm tắt bằng 3 thứ tiếng: vi, en, zh.
`;

async function test() {
  console.log("Đang gửi tin nhắn mẫu đến Gemini 3.8 Flash...");
  const response = await ai.models.generateContent({
    model: modelId,
    contents: [{
      role: "user",
      parts: [{ text: `${systemPrompt}\n\n--- TIN NHẮN ---\n${sampleChat}` }]
    }],
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
                address_text: { type: Type.STRING },
                property_types: { type: Type.ARRAY, items: { type: Type.STRING } },
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
                  required: ["vi", "en", "zh"]
                },
                landlord_commission_text: { type: Type.STRING, nullable: true },
                our_share_percent: { type: Type.NUMBER, nullable: true },
              },
              required: ["address_text", "property_types", "price_currency", "price_period", "price_basis", "key_details"]
            }
          }
        },
        required: ["properties"]
      }
    }
  });

  const parsed = JSON.parse(response.text || "{}");
  console.log("=== KẾT QUẢ BÓC TÁCH THÀNH CÔNG ===");
  console.log(JSON.stringify(parsed, null, 2));
}

test().catch(console.error);
