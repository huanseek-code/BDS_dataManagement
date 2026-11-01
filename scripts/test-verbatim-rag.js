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
const ai = new GoogleGenAI({ apiKey });
const modelId = env.GEMINI_MODEL || "gemini-2.5-flash";

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    properties: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source_text_snippet: { type: Type.STRING },
          address_text: { type: Type.STRING },
          floor_area_m2: { type: Type.NUMBER, nullable: true },
          price_amount: { type: Type.NUMBER, nullable: true },
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
        required: ["address_text", "key_details"],
      },
    },
  },
  required: ["properties"],
};

const fewShotExamples = `
--- CÁC VÍ DỤ MẪU CHUẨN ĐỐI CHIẾU (FEW-SHOT GOLDEN EXAMPLES) ---

[VÍ DỤ 1] (Khách dùng chữ 'đủ đồ' nguyên gốc):
TIN NHẮN: "Cho thuê nhanh căn 2N1wc đủ đồ vào luôn toà S3 giá 8,5tr"
KẾT QUẢ: { "address_text": "toà S3", "furniture_status": "đủ đồ", "furniture_list": null, "price_amount": 8500000 }

[VÍ DỤ 2] (Khách dùng chữ 'full đồ' nguyên gốc):
TIN NHẮN: "Tòa GS6 63m2 view bể bơi, nội thất: full đồ, giá 10,5tr"
KẾT QUẢ: { "address_text": "Tòa GS6", "furniture_status": "full đồ", "furniture_list": null, "price_amount": 10500000 }

[VÍ DỤ 3] (Chỉ liệt kê thiết bị cụ thể, không có từ hiện trạng):
TIN NHẮN: "Shophouse Vinhomes Greenbay 120m2 x 4 tầng giá 60tr. Đồ đạc: Dh, nl, giường, bếp"
KẾT QUẢ: { "address_text": "Shophouse Vinhomes Greenbay", "furniture_status": null, "furniture_list": "Dh, nl, giường, bếp", "price_amount": 60000000 }

[VÍ DỤ 4] (Hoàn toàn không đề cập nội thất):
TIN NHẮN: "Mặt phố Trần Vỹ 180m2 x 8 tầng giá 200 tr/tháng"
KẾT QUẢ: { "address_text": "Mặt phố Trần Vỹ", "furniture_status": null, "furniture_list": null, "price_amount": 200000000 }

[VÍ DỤ 5] (Ghi rõ 'đồ cơ bản: tủ bếp, giường'):
TIN NHẮN: "- 2N+1 64m2 giá 8,5tr đồ cơ bản: tủ bếp, giường,... S106 Đông Nam - Tây Nam"
KẾT QUẢ: { "address_text": "S106", "furniture_status": "đồ cơ bản", "furniture_list": "tủ bếp, giường,...", "price_amount": 8500000 }

[VÍ DỤ 6] (Ghi 'full gỗ'):
TIN NHẮN: "- S203 full gỗ 2N+1 giá 11tr - ngày 15/11 vào"
KẾT QUẢ: { "address_text": "S203", "furniture_status": "full gỗ", "furniture_list": null, "price_amount": 11000000 }
`;

const systemPrompt = `
Bạn là chuyên gia thẩm định và bóc tách dữ liệu Bất động sản (BĐS) hàng đầu cho Huanseek.
Nhiệm vụ: Trích xuất các căn BĐS từ tin nhắn theo nguyên tắc NGUYÊN GỐC CHỮ TRONG TIN NHẮN (VERBATIM SPAN EXTRACTION):

1. NỘI THẤT (furniture_status):
   - CẮT ĐÚNG TỪ/CỤM TỪ NGUYÊN GỐC trong tin nhắn thể hiện hiện trạng (ví dụ: 'đủ đồ', 'full đồ', 'đồ cơ bản', 'full gỗ', 'nhà trống'...).
   - TUYỆT ĐỐI KHÔNG TỰ QUY ĐỔI (ví dụ: tin ghi 'đủ đồ' thì trích đúng 'đủ đồ', CẤM đổi thành 'đầy đủ nội thất').
   - NẾU TIN KHÔNG CÓ CỤM TỪ NÀO CHỈ HIỆN TRẠNG (ví dụ chỉ liệt kê món đồ "Dh, nl, giường, bếp" hoặc không nhắc gì): BẮT BUỘC ĐỂ NULL!

2. DANH SÁCH MÓN ĐỒ (furniture_list):
   - Trích xuất NGUYÊN MẪU danh sách các món đồ được liệt kê (ví dụ: "Dh, nl, giường, bếp", "Dh âm trần, nl, THANG MÁY", "tủ bếp, giường").
   - Nếu không có món đồ nào thì để null.

${fewShotExamples}
`;

function verifyVerbatimSpan(extractedPhrase, rawText) {
  if (!extractedPhrase || typeof extractedPhrase !== "string") return null;
  const trimmed = extractedPhrase.trim();
  if (!trimmed || trimmed.toLowerCase() === "chưa rõ" || trimmed.toLowerCase() === "null") return null;
  if (rawText.toLowerCase().includes(trimmed.toLowerCase())) {
    return trimmed;
  }
  return null;
}

async function extractOne(rawText) {
  const res = await ai.models.generateContent({
    model: modelId,
    contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nTin nhắn Zalo:\n${rawText}` }] }],
    config: {
      temperature: 0.0,
      topP: 0.1,
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  const parsed = JSON.parse(res.text);
  const p = (parsed.properties || [])[0] || {};
  const statusVerified = verifyVerbatimSpan(p.furniture_status, rawText);
  const listVerified = verifyVerbatimSpan(p.furniture_list, rawText) || p.furniture_list || null;
  return { ...p, furniture_status: statusVerified, furniture_list: listVerified };
}

async function main() {
  console.log("================================================================================");
  console.log(" KIỂM THỬ TRÍCH XUẤT CHỮ NGUYÊN GỐC VỚI FEW-SHOT GOLDEN EXAMPLES");
  console.log(" Không enum cứng - Không quy đổi 'đủ đồ' sang 'đầy đủ nội thất' - 100% nguyên bản");
  console.log("================================================================================\n");

  const cases = [
    {
      name: "Case 1: Tin có chữ 'đủ đồ' nguyên gốc",
      input: "Cho thuê nhanh căn 2N1wc đủ đồ vào luôn toà S3 giá 8,5tr",
      expectedStatus: "đủ đồ",
      expectedList: null,
    },
    {
      name: "Case 2: Tin có chữ 'full đồ' nguyên gốc",
      input: "Tòa GS6/ 2N2wc 63m view bể bơi, nội thất: full đồ, giá 10,5tr",
      expectedStatus: "full đồ",
      expectedList: null,
    },
    {
      name: "Case 3: Tin Greenbay chỉ liệt kê 'Dh, nl, giường, bếp'",
      input: "Shophouse Vinhomes Greenbay 120m2 x 4 tầng giá 60tr. Đồ đạc: Dh, nl, giường, bếp",
      expectedStatus: null,
      expectedListMatch: /Dh.*nl.*giường.*bếp/i,
    },
    {
      name: "Case 4: Tin Gardenia chỉ liệt kê 'Dh âm trần, nl, THANG MÁY'",
      input: "Vinhome Gardenia 100m2 giá 60tr/tháng. Thiết bị: Dh âm trần, nl, THANG MÁY",
      expectedStatus: null,
      expectedListMatch: /Dh.*nl.*thang\s*máy/i,
    },
    {
      name: "Case 5: Tin Trần Vỹ không nhắc nội thất",
      input: "Mặt phố Trần Vỹ 180m2 x 8 tầng mặt tiền 9m giá 200 tr/tháng",
      expectedStatus: null,
      expectedList: null,
    },
    {
      name: "Case 6: Tin S106 có 'đồ cơ bản: tủ bếp, giường'",
      input: "- 2N+1 64m2 giá 8,5tr đồ cơ bản: tủ bếp, giường,... S106 Đông Nam - Tây Nam",
      expectedStatus: "đồ cơ bản",
      expectedListMatch: /tủ\s*bếp.*giường/i,
    },
    {
      name: "Case 7: Tin có 'full gỗ'",
      input: "- S203 full gỗ 2N+1 giá 11tr - ngày 15/11 vào",
      expectedStatus: "full gỗ",
      expectedList: null,
    },
  ];

  let passedAll = true;

  for (const c of cases) {
    process.stdout.write(`▶ ${c.name}: `);
    try {
      const res = await extractOne(c.input);
      let statusOk = false;
      if (c.expectedStatus === null) {
        statusOk = res.furniture_status === null || res.furniture_status === "";
      } else {
        statusOk = (res.furniture_status || "").toLowerCase() === c.expectedStatus.toLowerCase();
      }

      let listOk = true;
      if (c.expectedListMatch) {
        listOk = c.expectedListMatch.test(res.furniture_list || "");
      } else if (c.expectedList === null) {
        listOk = res.furniture_list === null || res.furniture_list === "";
      }

      if (statusOk && listOk) {
        console.log(`✓ PASS [status: "${res.furniture_status}", list: "${res.furniture_list}"]`);
      } else {
        console.log(`✗ FAIL`);
        console.log(`  -> Thực tế: status = "${res.furniture_status}", list = "${res.furniture_list}"`);
        console.log(`  -> Kỳ vọng: status = ${c.expectedStatus}, listMatch = ${c.expectedListMatch || c.expectedList}`);
        passedAll = false;
      }
    } catch (err) {
      console.log(`✗ ERROR:`, err.message);
      passedAll = false;
    }
  }

  console.log("\n================================================================================");
  if (passedAll) {
    console.log(" TẤT CẢ CÁC TRƯỜNG HỢP ĐỀU GIỮ NGUYÊN 100% CHỮ GỐC TRONG TIN NHẮN!");
  } else {
    console.log(" CẦN ĐIỀU CHỈNH THÊM");
  }
  console.log("================================================================================\n");
}

main().catch(console.error);
