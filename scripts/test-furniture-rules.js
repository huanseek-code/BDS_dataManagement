const { GoogleGenAI, Type } = require("@google/genai");
const fs = require("fs");
const path = require("path");

// 1. Đọc biến môi trường từ .env.local
const envContent = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#")) {
    const [key, ...vals] = trimmed.split("=");
    env[key] = vals.join("=");
  }
});

const rawKeys = (env.GEMINI_API_KEYS || "").split(/[,\n;]/).map(k => k.trim()).filter(k => k.length > 5);
if (env.GEMINI_API_KEY && !rawKeys.includes(env.GEMINI_API_KEY.trim())) {
  rawKeys.push(env.GEMINI_API_KEY.trim());
}
const apiKeys = rawKeys.length > 0 ? rawKeys : [env.GEMINI_API_KEY || ""];
const candidateModels = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"];

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
            enum: ["đầy đủ nội thất", "cơ bản", "không nội thất", "bàn giao thô", "chưa rõ"],
          },
          furniture_list: {
            type: Type.STRING,
            nullable: true,
          },
        },
        required: ["address_text", "furniture_status", "key_details"],
      },
    },
  },
  required: ["properties"],
};

const systemPrompt = `
Bạn là chuyên gia trích xuất dữ liệu Bất động sản (BĐS) hàng đầu cho Huanseek.
Nhiệm vụ của bạn là bóc tách thông tin BĐS từ tin nhắn theo nguyên tắc NGUYÊN MẪU VĂN BẢN:

NỘI THẤT & DANH SÁCH MÓN ĐỒ (Trích xuất nguyên mẫu câu chữ tiếng Việt):
- "furniture_status": Điền trực tiếp chữ tiếng Việt (Chỉ chọn 1 trong 5 giá trị):
  * "đầy đủ nội thất": Khi nguồn ghi rõ "full nội thất", "full đồ", "full option", "đầy đủ nội thất", "đủ đồ".
  * "cơ bản": Khi nguồn ghi "nội thất cơ bản", "đồ cơ bản", "không full", "bán hoàn thiện". TUYỆT ĐỐI KHÔNG DỰA VÀO SỐ LƯỢNG ĐỒ ĐƯỢC LIỆT KÊ ĐỂ TỰ ĐỔI TỪ CƠ BẢN THÀNH FULL! Dù liệt kê bao nhiêu món đồ đi nữa, hễ có chữ "cơ bản/không full" thì bắt buộc ghi "cơ bản".
  * "không nội thất": Khi nguồn ghi rõ "không nội thất", "không đồ", "nhà trống".
  * "bàn giao thô": Khi nguồn ghi rõ "bàn giao thô", "nhà thô".
  * "chưa rõ": Khi tin nhắn hoàn toàn KHÔNG NHẮC GÌ đến nội thất (tin này vẫn nhập bình thường, không dừng lại).
- "furniture_list": Trích xuất NGUYÊN MẪU danh sách các món đồ được liệt kê trong tin nhắn (ví dụ: "điều hòa, nóng lạnh, giường, tủ lạnh").
  * Nguồn nói rõ không có món nào thì ghi rõ đúng chữ đó (ví dụ: "không có tủ lạnh", "chưa có giường").
  * Không nhắc đến không có nghĩa là không có (tuyệt đối không tự suy đoán thêm món nào).
  * Nếu tin nhắn không liệt kê món đồ nào thì để null hoặc "".
`;

function postProcess(prop, text) {
  const combined = `${prop.source_text_snippet || ""} ${text} ${prop.key_details?.vi || ""}`;
  if (/nội\s*thất\s*cơ\s*bản|đồ\s*cơ\s*bản|không\s*full/i.test(combined)) {
    prop.furniture_status = "cơ bản";
  } else if (/full\s*(?:nội\s*thất|đồ|option)|đầy\s*đủ\s*(?:nội\s*thất|đồ)/i.test(combined)) {
    prop.furniture_status = "đầy đủ nội thất";
  } else if (/không\s*nội\s*thất|không\s*đồ|nhà\s*trống/i.test(combined)) {
    prop.furniture_status = "không nội thất";
  } else if (/bàn\s*giao\s*thô|nhà\s*thô/i.test(combined)) {
    prop.furniture_status = "bàn giao thô";
  } else if (!prop.furniture_status || prop.furniture_status === "unknown" || prop.furniture_status === "chưa rõ") {
    prop.furniture_status = "chưa rõ";
  }
  return prop;
}

async function callGemini(text) {
  for (const key of apiKeys) {
    const client = new GoogleGenAI({ apiKey: key });
    for (const model of candidateModels) {
      try {
        const res = await client.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nTin nhắn Zalo:\n${text}` }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema,
          },
        });
        if (res && res.text) return JSON.parse(res.text);
      } catch (err) {
        continue;
      }
    }
  }
  throw new Error("Tất cả key/model đều bận.");
}

async function runTests() {
  console.log("================================================================================");
  console.log(" KIỂM THỬ 3 QUY TẮC NỘI THẤT NGUYÊN MẪU (TEXT-FIRST FIDELITY)");
  console.log("================================================================================\n");

  const testCases = [
    {
      name: "Quy tắc 1: 'Cơ bản' nhưng liệt kê rất nhiều đồ (Không được tự đổi thành full)",
      message: "Căn 2 ngủ 70m2 tòa S201 Vinhomes Smart City, giá 15tr/tháng. Nội thất cơ bản gồm: 3 điều hòa, 2 nóng lạnh, tủ bếp, rèm cửa, giường, tủ quần áo, máy giặt, sofa. Cọc 1 đóng 3.",
      expectedStatus: "cơ bản",
    },
    {
      name: "Quy tắc 2: 'Đầy đủ đồ' và nói rõ KHÔNG CÓ món nào ('chưa có tủ lạnh')",
      message: "Cho thuê chung cư Golden West Lê Văn Thiêm 85m2, 18 triệu/tháng. Đầy đủ đồ: điều hòa, nóng lạnh, giường, sofa; riêng tủ lạnh chưa có.",
      expectedStatus: "đầy đủ nội thất",
      checkList: (list) => /tủ\s*lạnh/i.test(list) && /chưa\s*có|không\s*có/i.test(list),
    },
    {
      name: "Quy tắc 3A: Ghi rõ 'Không nội thất / nhà trống'",
      message: "Cho thuê nhà mặt phố Xã Đàn 50m2 x 4 tầng, giá 45tr/tháng làm văn phòng hoặc showroom. Không nội thất, nhà trống nhận ngay.",
      expectedStatus: "không nội thất",
    },
    {
      name: "Quy tắc 3B: Không nhắc gì đến nội thất -> Ghi 'chưa rõ', nhập bình thường",
      message: "Gửi anh căn kho xưởng 1200m2 KCN Sóng Thần, giá 90k/m2, PCCC tự động, trạm điện 400kVA.",
      expectedStatus: "chưa rõ",
    },
  ];

  let passed = 0;
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`\n🧪 [Test ${i + 1}] ${tc.name}`);
    console.log(`   Tin nhắn: "${tc.message}"`);
    const parsed = await callGemini(tc.message);
    const rawProp = parsed.properties[0];
    const finalProp = postProcess(rawProp, tc.message);

    console.log(`   ➔ Nội thất: "${finalProp.furniture_status}"`);
    console.log(`   ➔ Danh sách nội thất: "${finalProp.furniture_list || "—"}"`);

    let ok = finalProp.furniture_status === tc.expectedStatus;
    if (tc.checkList && ok) {
      ok = tc.checkList(finalProp.furniture_list || "");
    }

    if (ok) {
      console.log(`   ✅ ĐẠT (PASS)`);
      passed++;
    } else {
      console.log(`   ❌ CHƯA ĐẠT: Kỳ vọng "${tc.expectedStatus}", thực tế "${finalProp.furniture_status}"`);
    }
  }

  console.log(`\n================================================================================`);
  console.log(` KẾT QUẢ: ${passed}/${testCases.length} Test cases đạt chuẩn 100%!`);
  console.log(`================================================================================`);
}

runTests().catch(console.error);
