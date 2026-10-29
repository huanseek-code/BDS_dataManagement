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

// Thu thập danh sách keys
const rawKeys = (env.GEMINI_API_KEYS || "").split(/[,\n;]/).map(k => k.trim()).filter(k => k.length > 5);
if (env.GEMINI_API_KEY && !rawKeys.includes(env.GEMINI_API_KEY.trim())) {
  rawKeys.push(env.GEMINI_API_KEY.trim());
}
const apiKeys = rawKeys.length > 0 ? rawKeys : [env.GEMINI_API_KEY || ""];
const candidateModels = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];

async function callGeminiWithRetry(promptText) {
  let lastErr = null;
  for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
    const key = apiKeys[keyIdx];
    const client = new GoogleGenAI({ apiKey: key });

    for (const model of candidateModels) {
      try {
        const response = await client.models.generateContent({
          model: model,
          contents: [{ role: "user", parts: [{ text: promptText }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema
          }
        });
        if (response && response.text) {
          return JSON.parse(response.text);
        }
      } catch (err) {
        lastErr = err;
        const msg = err?.message || String(err);
        if (msg.includes("503") || msg.includes("429") || msg.includes("UNAVAILABLE")) {
          // Thử model khác hoặc key khác
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        throw err;
      }
    }
  }
  throw lastErr;
}

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
     * Có thể mỗi tin nhắn là 1 căn.
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
   - "180m2 x 8 tầng" -> floor_area_m2: 180, total_lease_area_m2: 1440
   - "4.5 USD/m2/tháng" -> price_amount: 4.5, price_currency: "USD", price_basis: "per_m2", price_period: "month"

6. TÓM TẮT 3 NGÔN NGỮ (key_details: vi, en, zh):
   - Tạo bản tóm tắt ngắn gọn, súc tích bằng Tiếng Việt, Tiếng Anh, Tiếng Trung dựa HOÀN TOÀN vào các thông số có thật của căn đó.
`;

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
};

// Hàm hậu xử lý tất định
function postProcessListing(prop, text) {
  const combined = `${prop.source_text_snippet || ""} ${text} ${prop.key_details?.vi || ""}`;

  // 1. Handover condition
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

  // 2. Price fallback
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
      }
    }
  }

  // 3. Multi floor area fallback
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

  // 4. Negative constraint
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

// Hàm chạy 1 test case
async function runSingleTestCase(name, messages) {
  console.log(`\n========================================================================`);
  console.log(`🧪 ${name}`);
  console.log(`========================================================================`);

  // Khử trùng lặp tin nhắn
  const seenTexts = new Set();
  const uniqueItems = [];
  for (const item of messages) {
    const norm = (item.text || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!seenTexts.has(norm)) {
      seenTexts.add(norm);
      uniqueItems.push(item);
    }
  }

  console.log(`📥 Tổng số tin nhắn: ${messages.length} | Sau lọc trùng: ${uniqueItems.length}`);

  let transcript = "--- DÒNG THỜI GIAN TIN NHẮN TỪ ĐỐI TÁC (TỪ CŨ ĐẾN MỚI) ---\n";
  uniqueItems.forEach((item, index) => {
    transcript += `[Tin nhắn ${index + 1} | ${item.sent_time || "Vừa gửi"}] (ID: ${item.msg_id || "id_" + index}):\n${item.text.trim()}\n\n`;
  });

  const parsed = await callGeminiWithRetry(`${systemPrompt}\n\n${transcript}`);
  const properties = (parsed.properties || []).map(p => postProcessListing(p, transcript));

  console.log(`🎯 Số lượng BĐS bóc tách được: ${properties.length}`);
  properties.forEach((p, idx) => {
    console.log(`\n  👉 [Căn ${idx + 1}]: ${p.address_text}`);
    console.log(`     • Diện tích: ${p.floor_area_m2 ?? "null"} m² ${p.total_lease_area_m2 ? `(Tổng: ${p.total_lease_area_m2} m²)` : ""}`);
    console.log(`     • Giá tiền: ${p.price_amount ? p.price_amount.toLocaleString("vi-VN") : "null"} ${p.price_currency || ""} (${p.price_text || "không ghi"})`);
    console.log(`     • Bàn giao: ${p.handover_condition ?? "null"}`);
    console.log(`     • Hoa hồng: ${p.landlord_commission_text ?? "null"}`);
    console.log(`     • Điều kiện thuê / HĐ: ${p.lease_term_text ?? "null"}`);
    console.log(`     • Snippet: ${p.source_text_snippet?.replace(/\n/g, " ")}`);
    console.log(`     • VI: ${p.key_details?.vi}`);
    console.log(`     • EN: ${p.key_details?.en}`);
    console.log(`     • ZH: ${p.key_details?.zh}`);
  });

  return properties;
}

async function runAll() {
  console.log("🚀 BẮT ĐẦU BỘ TEST CASE ĐA DẠNG CHO KHO DỮ LIỆU THUẦN VĂN BẢN (TEXT-ONLY)");
  console.log("Model AI ưu tiên:", candidateModels[0]);

  // -------------------------------------------------------------
  // Test Case 1: Đơn căn chung cư tiêu chuẩn
  // -------------------------------------------------------------
  await runSingleTestCase("TEST CASE 1: Đơn căn chung cư có đầy đủ thông số", [
    {
      msg_id: "tc1_msg1",
      sent_time: "09:15:00",
      text: "Tòa S205 - Căn 12A08 - Vinhomes Smart City\n2 ngủ 1 vệ sinh, 55m2\nFull đồ đẹp, chỉ việc xách vali vào ở\nGiá 13.5 triệu/tháng (bao phí quản lý)\nCọc 1 đóng 3, hợp đồng tối thiểu 1 năm\nPhí môi giới 50%"
    }
  ]);

  // -------------------------------------------------------------
  // Test Case 2: Đa căn trong cùng 1 tin nhắn dài
  // -------------------------------------------------------------
  await runSingleTestCase("TEST CASE 2: Đa căn trong cùng 1 tin nhắn (Multi-property in 1 text)", [
    {
      msg_id: "tc2_msg1",
      sent_time: "10:00:20",
      text: "Em gửi bên anh 2 căn hot trong tuần nhé:\n1. Shophouse chân đế The Rainbow, Vinhomes Grand Park, Quận 9. DT 120m2 (1 trệt 1 lầu), giá thuê 45 tr/tháng, bàn giao nhà thô tiện decor làm cafe hoặc siêu thị mini. Hợp đồng 3 năm.\n2. Căn hộ 3PN 105m2 The Origami, full nội thất cao cấp, view vườn Nhật. Giá thuê 18 triệu/tháng, cọc 2 đóng 1, phí môi giới 1 tháng."
    }
  ]);

  // -------------------------------------------------------------
  // Test Case 3: Chuyển tiếp dồn dập nhiều tin (Aoran bulk forward)
  // -------------------------------------------------------------
  await runSingleTestCase("TEST CASE 3: Chuyển tiếp dồn dập nhiều tin ngắn (Bulk Forward 3 căn)", [
    {
      msg_id: "tc3_a3",
      sent_time: "11:52:14",
      text: "Tòa A3 . 2n2 - 62m -full đồ\nGiá 16tr  mpdv\nĐóng 3 cọc 1\nHh full"
    },
    {
      msg_id: "tc3_s403",
      sent_time: "11:52:14",
      text: "Cho thuê\nS403- 3 ngủ 95m2 full, view hồ, công viên trung tâm.\nGiá thuê 17 triệu/tháng. \nNhận nhà luôn hh full"
    },
    {
      msg_id: "tc3_a2",
      sent_time: "11:52:14",
      text: "Tòa a2 2n2n 60m Full đồ\ngiá thuê 14 tr mpdv\nthời gian vào luôn\n(Đóng 3) (cọc 1) (hợp đồng 1 năm) \nPhí mô giới 1 tháng 0398646983"
    }
  ]);

  // -------------------------------------------------------------
  // Test Case 4: Chống trùng lặp tin nhắn gửi lặp (Deduplication Stress Test)
  // -------------------------------------------------------------
  await runSingleTestCase("TEST CASE 4: Lọc trùng lặp khi người gửi ấn chuyển tiếp lặp nhiều lần", [
    {
      msg_id: "tc4_dup1",
      sent_time: "14:10:01",
      text: "Tòa a2 2n2n 60m Full đồ giá thuê 14 tr mpdv thời gian vào luôn (Đóng 3) (cọc 1) (hợp đồng 1 năm) Phí mô giới 1 tháng 0398646983"
    },
    {
      msg_id: "tc4_dup2",
      sent_time: "14:10:02",
      text: "Tòa a2 2n2n 60m Full đồ giá thuê 14 tr mpdv thời gian vào luôn (Đóng 3) (cọc 1) (hợp đồng 1 năm) Phí mô giới 1 tháng 0398646983"
    },
    {
      msg_id: "tc4_dup3",
      sent_time: "14:10:02",
      text: "Tòa a2  2n2n 60m Full đồ giá thuê 14 tr mpdv thời gian vào luôn (Đóng 3) (cọc 1) (hợp đồng 1 năm) Phí mô giới 1 tháng 0398646983"
    }
  ]);

  // -------------------------------------------------------------
  // Test Case 5: Tin nhắn thiếu trường / viết tắt (Sparse Message)
  // -------------------------------------------------------------
  await runSingleTestCase("TEST CASE 5: Tin nhắn thiếu trường dữ liệu (Không bịa đặt, trường thiếu trả null)", [
    {
      msg_id: "tc5_msg1",
      sent_time: "15:30:10",
      text: "Kepler 75m 2 ngủ 18tr/tháng"
    }
  ]);

  // -------------------------------------------------------------
  // Test Case 6: Điều kiện cấm / Ngành nghề hạn chế (Negative Constraints)
  // -------------------------------------------------------------
  await runSingleTestCase("TEST CASE 6: Bảo tồn điều kiện cấm (Không làm hàng ăn / F&B)", [
    {
      msg_id: "tc6_msg1",
      sent_time: "16:45:00",
      text: "Cho thuê nhà mặt phố 45 Thi Sách, Hai Bà Trưng.\nDiện tích 65m2 x 4 tầng. Giá 40 triệu/tháng.\nCHỦ NHÀ YÊU CẦU: Tuyệt đối KHÔNG LÀM HÀNG ĂN, không kinh doanh ăn uống, không cho thuê làm phòng khám. Ưu tiên văn phòng hoặc thời trang sạch sẽ."
    }
  ]);

  // -------------------------------------------------------------
  // Test Case 7: Mặt phố đa tầng & Diện tích lớn (Multi-Floor Commercial)
  // -------------------------------------------------------------
  await runSingleTestCase("TEST CASE 7: Mặt phố đa tầng quy đổi diện tích (180m2 x 8 tầng)", [
    {
      msg_id: "tc7_msg1",
      sent_time: "17:20:00",
      text: "Mặt phố Trần Vỹ, Cầu Giấy. Diện tích 180m2 x 8 tầng, có thang máy tốc độ cao, PCCC đạt chuẩn. Giá thuê 200 tr/tháng có thương lượng. Hoa hồng chủ gửi 1 tháng tiền nhà."
    }
  ]);

  // -------------------------------------------------------------
  // Test Case 8: Ngoại tệ USD & Nhà xưởng công nghiệp (Industrial Factory USD)
  // -------------------------------------------------------------
  await runSingleTestCase("TEST CASE 8: BĐS Công nghiệp tính giá USD/m2", [
    {
      msg_id: "tc8_msg1",
      sent_time: "18:00:00",
      text: "Cho thuê kho xưởng KCN VSIP 1, TP. Thuận An, Bình Dương. Diện tích 3500m2 xưởng, trạm điện 1000kVA, PCCC tự động nghiệm thu. Giá thuê: 4.5 USD/m2/tháng. Hợp đồng 5 năm."
    }
  ]);

  console.log("\n🎉 HOÀN TẤT TOÀN BỘ 8 TEST CASES THỰC TẾ!");
}

runAll().catch(console.error);
