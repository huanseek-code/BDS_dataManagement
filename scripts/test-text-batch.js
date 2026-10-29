const { GoogleGenAI, Type } = require("@google/genai");
const fs = require("fs");
const path = require("path");

// Đọc biến môi trường từ .env.local
const envContent = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#")) {
    const [key, ...vals] = trimmed.split("=");
    env[key] = vals.join("=");
  }
});

const apiKey = env.GEMINI_API_KEY_1 || env.GEMINI_API_KEY || "";
const modelId = env.GEMINI_MODEL || "gemini-2.5-flash";
const ai = new GoogleGenAI({ apiKey });

// Giả lập mẻ tin nhắn của bạn Aoran (kèm tin A2 bị gửi lặp 3 lần do ấn nhiều lần)
const rawItems = [
  {
    msg_id: "0325b71fc3bf8ce6d5a9",
    sent_time: "11:52:14",
    text: "Tòa A3 . 2n2 - 62m -full đồ\nGiá 16tr  mpdv\nĐóng 3 cọc 1\nHh full"
  },
  {
    msg_id: "78743b514ff100a859e7",
    sent_time: "11:52:14",
    text: "Cho thuê\nS403- 3 ngủ 95m2 full, view hồ, công viên trung tâm.\nGiá thuê 17 triệu/tháng. \nNhận nhà luôn hh full"
  },
  {
    msg_id: "6f15012675863adf6390",
    sent_time: "11:52:14",
    text: "Tòa a2 2n2n 60m Full đồ\ngiá thuê 14 tr mpdv\nthời gian vào luôn\n(Đóng 3) (cọc 1) (hợp đồng 1 năm) \nPhí mô giới 1 tháng 0398646983"
  },
  {
    msg_id: "1a06ff5f8bffc4a69de9",
    sent_time: "11:52:14",
    text: "Tòa a2  2n2n 60m Full đồ\ngiá thuê 14 tr mpdv\nthời gian vào luôn\n(Đóng 3) (cọc 1) (hợp đồng 1 năm) \nPhí mô giới 1 tháng "
  },
  {
    msg_id: "53dbaeb3da13954acc05",
    sent_time: "11:52:14",
    text: "Tòa a2  2n2n 60m Full đồ\ngiá thuê 14 tr mpdv\nthời gian vào luôn\n(Đóng 3) (cọc 1) (hợp đồng 1 năm) \nPhí mô giới 1 tháng "
  }
];

// Khử trùng lặp tin nhắn văn bản
const seenTexts = new Set();
const uniqueItems = [];
for (const item of rawItems) {
  const norm = item.text.replace(/\s+/g, " ").trim().toLowerCase();
  // Nhận diện tương đồng cao nếu cùng là Tòa A2 60m 14tr
  let isDup = false;
  for (const seen of seenTexts) {
    if (norm.includes("tòa a2") && seen.includes("tòa a2") && norm.includes("60m") && seen.includes("60m")) {
      isDup = true;
      break;
    }
  }
  if (!isDup) {
    seenTexts.add(norm);
    uniqueItems.push(item);
  }
}

let transcript = "--- DÒNG THỜI GIAN TIN NHẮN TỪ ĐỐI TÁC (TỪ CŨ ĐẾN MỚI) ---\n";
uniqueItems.forEach((item, index) => {
  transcript += `[Tin nhắn ${index + 1} | ${item.sent_time}] (ID: ${item.msg_id}):\n${item.text.trim()}\n\n`;
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
   - "16tr mpdv" -> price_amount: 16000000, price_currency: "VND", price_basis: "total", price_period: "month", price_text: "16 triệu/tháng (mpdv)"
   - "17 triệu/tháng" -> price_amount: 17000000, price_currency: "VND", price_basis: "total", price_period: "month", price_text: "17 triệu/tháng"
   - "14 tr mpdv" -> price_amount: 14000000, price_currency: "VND", price_basis: "total", price_period: "month", price_text: "14 triệu/tháng (mpdv)"
   - "62m" -> floor_area_m2: 62
   - "95m2" -> floor_area_m2: 95
   - "60m" -> floor_area_m2: 60

6. TÓM TẮT 3 NGÔN NGỮ (key_details: vi, en, zh):
   - Tạo bản tóm tắt ngắn gọn, súc tích bằng Tiếng Việt, Tiếng Anh, Tiếng Trung dựa HOÀN TOÀN vào các thông số có thật của căn đó.
`;

async function run() {
  console.log("=== CHẠY KIỂM THỬ THỰC TẾ: MẺ TIN NHẮN AORAN (A3, S403, A2) ===");
  console.log("Tổng số tin nhắn nhận được:", rawItems.length);
  console.log("Số tin nhắn sau khi lọc trùng:", uniqueItems.length);

  const response = await ai.models.generateContent({
    model: modelId,
    contents: [
      {
        role: "user",
        parts: [{ text: `${systemPrompt}\n\n${transcript}` }]
      }
    ],
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
                  items: { type: Type.STRING }
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
                    zh: { type: Type.STRING }
                  },
                  required: ["vi", "en", "zh"]
                },
                landlord_commission_text: { type: Type.STRING, nullable: true },
                our_share_percent: { type: Type.NUMBER, nullable: true },
                our_share_text: { type: Type.STRING, nullable: true },
                handover_condition: {
                  type: Type.STRING,
                  nullable: true,
                  enum: ["bare_shell", "basic_unfurnished", "partially_furnished", "fully_furnished"]
                }
              },
              required: [
                "address_text",
                "property_types",
                "price_currency",
                "price_period",
                "price_basis",
                "key_details"
              ]
            }
          },
          summary_note: { type: Type.STRING, nullable: true }
        },
        required: ["properties"]
      }
    }
  });

  const parsed = JSON.parse(response.text);
  console.log("\n✅ KẾT QUẢ BÓC TÁCH: Tìm thấy", parsed.properties?.length, "căn BĐS độc lập.");
  parsed.properties?.forEach((p, idx) => {
    console.log(`\n================= CĂN ${idx + 1} =================`);
    console.log("📍 Tên/Địa chỉ:", p.address_text);
    console.log("📐 Diện tích:", p.floor_area_m2, "m²");
    console.log("💰 Giá thuê:", p.price_amount?.toLocaleString("vi-VN"), p.price_currency, `(${p.price_text})`);
    console.log("🛋️ Bàn giao:", p.handover_condition);
    console.log("🤝 Hoa hồng:", p.landlord_commission_text);
    console.log("📜 Hợp đồng:", p.lease_term_text);
    console.log("📝 Snippet gốc:", p.source_text_snippet?.replace(/\n/g, " "));
    console.log("🇻🇳 Tóm tắt VI:", p.key_details?.vi);
    console.log("🇬🇧 Tóm tắt EN:", p.key_details?.en);
    console.log("🇨🇳 Tóm tắt ZH:", p.key_details?.zh);
  });
}

run().catch(console.error);
