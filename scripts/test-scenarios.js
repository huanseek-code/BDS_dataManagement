const { GoogleGenAI, Type } = require("@google/genai");

const rawMultiKeys = process.env.GEMINI_API_KEYS || "";
const singleKey = process.env.GEMINI_API_KEY || "";
const keysFromMulti = rawMultiKeys.split(/[,\n;]/).map((k) => k.trim()).filter((k) => k.length > 5);
const apiKeys = [...keysFromMulti];
if (singleKey && singleKey.trim().length > 5 && !apiKeys.includes(singleKey.trim())) {
  apiKeys.push(singleKey.trim());
}

if (apiKeys.length === 0) {
  console.error("❌ No GEMINI_API_KEY or GEMINI_API_KEYS configured.");
  process.exit(1);
}

const modelId = process.env.GEMINI_MODEL || "gemini-flash-latest";

const systemPrompt = `
Bạn là chuyên gia bóc tách dữ liệu Bất động sản (BĐS) chuyên nghiệp hàng đầu cho Huanseek.
Nhiệm vụ của bạn là đọc các tin nhắn gửi từ đối tác môi giới (có thể viết tắt, tiếng lóng, tin rời rạc, hoặc gửi hàng loạt nhiều căn) và trích xuất thành danh sách các căn BĐS chuẩn hóa.

QUY TẮC CỐT LÕI:
1. MỘT LẦN GỬI CÓ THỂ CHỨA NHIỀU CĂN (MULTI-PROPERTY):
   - Nếu trong nội dung có nhiều căn BĐS khác nhau (ví dụ: căn 1 ở Vĩnh Hưng, căn 2 ở Ciputra, căn 3 ở Starlake, căn 4 ở Nam Dư), BẮT BUỘC phải tách thành từng phần tử riêng biệt trong mảng "properties".
   - Mỗi phần tử BẮT BUỘC phải có trường "source_text_snippet": trích đúng đoạn văn bản gốc tương ứng của riêng căn đó từ nội dung tin nhắn, TUYỆT ĐỐI không copy toàn bộ tin nhắn chung vào từng căn.

2. CHUẨN HÓA ĐỊA DANH & TỈNH / THÀNH PHỐ (province):
   - Phải tự động suy luận Tỉnh / Thành phố dựa trên tên dự án, đường phố, phường xã, quận huyện phổ biến tại Việt Nam:
     * HÀ NỘI: Vĩnh Hưng, Nam Dư, Thanh Lân, Lĩnh Nam, Hoàng Mai, Sunshine City, Ciputra, Starlake (Tây Hồ Tây), Ngoại Giao Đoàn, Tây Hồ, Tô Ngọc Vân, Cầu Giấy, Hoàng Quốc Việt, Nam Từ Liêm, Bắc Từ Liêm, Hoài Đức, An Khánh, Hà Đông, Thanh Xuân, Hai Bà Trưng, Đống Đa, Ba Đình, Hoàn Kiếm, Long Biên, Gia Lâm, Đông Anh, Thanh Trì...
     * TP. HỒ CHÍ MINH: Bến Thành, Nguyễn Trãi, Nguyễn Thị Minh Khai, Quận 1, Quận 2, Quận 3, Quận 4, Quận 5, Quận 6, Quận 7, Quận 8, Quận 10, Quận 11, Quận 12, Bình Thạnh, Phú Nhuận, Gò Vấp, Tân Bình, Tân Phú, Bình Tân, TP. Thủ Đức, KCN Linh Trung, Nhà Bè, Bình Chánh, Củ Chi, Hóc Môn...
     * BÌNH DƯƠNG: Dĩ An, Thuận An, Thủ Dầu Một, Bến Cát, Tân Uyên, KCN Sóng Thần, KCN VSIP, Bàu Bàng...
     * ĐỒNG NAI: Biên Hòa, Long Thành, Nhơn Trạch, KCN Amata, Trảng Bom...
     * LONG AN: Bến Lức, Cần Giuộc, Đức Hòa, Tân An...
     * Các tỉnh thành khác: Hải Phòng, Đà Nẵng, Quảng Ninh, Cần Thơ, Bắc Ninh, Hưng Yên...
   - QUY TẮC CẤM SUY ĐOÁN BỪA: Nếu tin nhắn hoàn toàn không có bất kỳ dữ kiện địa danh nào xác định được tỉnh/thành phố, trả về province: null. TUYỆT ĐỐI KHÔNG tự ý gán bừa là "TP. Hồ Chí Minh" hay bất kỳ tỉnh nào.

3. QUY ĐỔI GIÁ TIỀN & ĐƠN VỊ:
   - "80 ạ", "80 tr", "80 triệu" -> price_amount: 80000000, price_currency: "VND"
   - "16,5 triệu", "16.5tr" -> price_amount: 16500000, price_currency: "VND"
   - "12 triệu" -> price_amount: 12000000, price_currency: "VND"
   - "2000$", "2000 usd" -> price_amount: 2000, price_currency: "USD"
   - "12 tỷ 5", "12.5 tỷ" -> price_amount: 12500000000, price_currency: "VND"
   - "85000đ/m2", "85k/m2" -> price_amount: 85000, price_currency: "VND", price_basis: "per_m2"
   - "4.5 USD/m2", "5$/m2" -> price_amount: 4.5, price_currency: "USD", price_basis: "per_m2"
   - Luôn giữ nguyên văn ở "price_text" (ví dụ: "16,5 triệu", "2000$").

4. LOẠI HÌNH (property_types): Chọn từ danh sách: ["factory", "warehouse", "office", "retail", "townhouse", "villa", "apartment", "land", "hotel", "other"].
   - Nhà mặt phố / nhà nguyên căn -> ["townhouse"]
   - Chung cư / căn hộ / duplex / penthouse -> ["apartment"]
   - Kho / xưởng -> ["warehouse", "factory"]
   - Mặt bằng kinh doanh / văn phòng -> ["retail", "office"]

5. CHI TIẾT CHÍNH (key_details):
   - Tóm tắt kết cấu (số tầng, số phòng ngủ, thang máy, phòng đọc sách...), hiện trạng nội thất, tiện ích...
   - Tự động viết bằng 3 ngôn ngữ chuẩn chỉnh: vi (Tiếng Việt), en (English), zh (中文).

6. CHU KỲ GIÁ (price_period): Chỉ chọn "month", "year", hoặc "one_time".
`;

const GEMINI_3X_MODELS = Array.from(
  new Set([
    process.env.GEMINI_MODEL || "gemini-flash-latest",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.1-flash-lite",
  ])
).filter(Boolean);

let keyIndex = 0;

async function callGemini(rawText, existingContext = null) {
  const hasContext = Boolean(existingContext && existingContext.trim().length > 0);
  const contextRules = hasContext
    ? `
7. PHÁN ĐOÁN NGỮ NGHĨA KHI CÓ HỒ SƠ ĐANG CHỜ DUYỆT TRƯỚC ĐÓ:
   - Trường "decision":
     + Điền "CONTINUATION" KHI VÀ CHỈ KHI: Tin nhắn mới là câu nói tiếp / bổ sung / đính chính thông tin (giá tiền, diện tích, hoa hồng, ảnh chụp, liên hệ, hoặc giảm giá: "chủ bớt còn 11tr") cho CĂN BĐS ĐANG ĐƯỢC NÓI TỚI ở tin trước. HỢP NHẤT TOÀN BỘ thông tin cũ và mới lại thành 1 căn DUY NHẤT hoàn chỉnh.
     + Điền "NEW_PROPERTY" KHI:
       * Tin nhắn mới có các từ khóa chuyển tiếp mở căn mới: "hoặc", "mình có thêm", "căn nữa", "căn khác", "ngoài ra bên em còn...", "căn 2..."
       * Hoặc nhắc đến một địa chỉ / tên tòa nhà / vị trí hoàn toàn khác biệt với căn đang chờ duyệt trước đó.
`
    : `
7. Trường "decision": Mặc định điền "NEW_PROPERTY".
`;

  const promptUserText = hasContext
    ? `${systemPrompt}\n${contextRules}\n\n--- HỒ SƠ BĐS ĐANG CHỜ DUYỆT TRƯỚC ĐÓ CỦA ĐỐI TÁC NÀY ---\n${existingContext}\n\n--- TIN NHẮN MỚI VỪA GỬI ---\n${rawText}`
    : `${systemPrompt}\n${contextRules}\n\n--- NỘI DUNG TIN NHẮN TỪ ĐỐI TÁC ---\n${rawText}`;

  let response;
  let lastErr;

  for (let k = 0; k < apiKeys.length; k++) {
    const curKey = apiKeys[(keyIndex + k) % apiKeys.length];
    const masked = `${curKey.slice(0, 6)}...${curKey.slice(-4)}`;
    const ai = new GoogleGenAI({ apiKey: curKey });

    for (const m of GEMINI_3X_MODELS) {
      try {
        response = await ai.models.generateContent({
          model: m,
          contents: [{ role: "user", parts: [{ text: promptUserText }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                decision: { type: Type.STRING },
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
        if (response && response.text) {
          keyIndex = (keyIndex + k + 1) % apiKeys.length;
          return JSON.parse(response.text || "{}");
        }
      } catch (e) {
        lastErr = e;
        const msg = String(e.message || "");
        if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
          console.warn(`[Key ${masked} - Model ${m}] Chạm 429 quota. Đang trượt xuống model Gemini 3.x tiếp theo...`);
          continue;
        } else if (msg.includes("503") || msg.includes("high demand")) {
          console.warn(`[Model ${m}] Gặp lỗi / spike 503. Chuyển sang model Gemini 3.x tiếp theo...`);
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        } else {
          console.warn(`[Model ${m}] Lỗi: ${msg.slice(0, 70)}...`);
          continue;
        }
      }
    }
  }

  if (!response && lastErr) throw lastErr;
  return JSON.parse(response.text || "{}");
}

let totalTests = 0;
let passedTests = 0;

function assert(description, condition, details = "") {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${description}`);
  } else {
    console.error(`  ❌ [FAIL] ${description} -> ${details}`);
  }
}

async function runTestSuite() {
  console.log("==================================================================");
  console.log("🚀 BẮT ĐẦU CHẠY BỘ KIỂM THỬ HỆ THỐNG BÓC TÁCH BĐS ZALO HUANSEEK");
  console.log(`🤖 Model: ${modelId}`);
  console.log("==================================================================\n");

  // ==========================================
  // TEST CASE 1: KỊCH BẢN THỰC TẾ ẢNH 4 (4 căn trong chuỗi 7 tin)
  // ==========================================
  console.log("📌 TEST CASE 1: Kịch bản Ảnh 4 - Môi giới gửi 4 căn khác nhau trong chuỗi tin");
  const tc1Input = `
CHO THUÊ NHÀ NGUYÊN CĂN VĨNH HƯNG - FULL NỘI THẤT
Vị trí: Ngay UBND phường Vĩnh Hưng.
Diện tích: 35m2 x 5 tầng.
Thiết kế: 3 phòng ngủ rộng rãi, thoáng mát.
Nội thất: Đầy đủ (Điều hòa, bếp từ, máy giặt... hình thật 100%).
Giá: 12 triệu, 3 cọc 1

Mình có thêm căn Duplex ở toà Sunshine City Ciputra 3 ngủ, 1 phòng đọc sách nha bạn
Giá 2000$, 214m2, ở chung cư được có nhiều tiện ích, riêng tư hơn an

Hoặc có ở Starlake chung cư 231m2, 4 ngủ giá 80 ạ

Tháng máy mặt phố
Nam dư, Thanh lân
16,5 triệu
5 tầng 3 ngủ đủ giường tủ, điều hoà, nóng lạnh, ko có rèm
`.trim();

  const tc1Result = await callGemini(tc1Input);
  const tc1Props = tc1Result.properties || [];

  assert("TC1.1: Tách chính xác 4 căn BĐS riêng biệt", tc1Props.length === 4, `Số căn thực tế: ${tc1Props.length}`);
  
  // Kiểm tra Tỉnh/Thành phố
  const allHanoi = tc1Props.every(p => p.province === "Hà Nội");
  assert("TC1.2: Tất cả các căn (Vĩnh Hưng, Ciputra, Starlake, Nam Dư) đều nhận diện là Hà Nội", allHanoi, 
    `Thực tế: ${tc1Props.map(p => `${p.address_text} (${p.province})`).join(" | ")}`);

  // Kiểm tra giá tiền và loại tiền
  const vinhHung = tc1Props.find(p => p.address_text.toLowerCase().includes("vĩnh hưng"));
  const ciputra = tc1Props.find(p => p.address_text.toLowerCase().includes("ciputra") || p.address_text.toLowerCase().includes("sunshine"));
  const starlake = tc1Props.find(p => p.address_text.toLowerCase().includes("starlake"));
  const namDu = tc1Props.find(p => p.address_text.toLowerCase().includes("nam dư") || p.address_text.toLowerCase().includes("thanh lân"));

  assert("TC1.3: Căn Vĩnh Hưng đúng giá 12.000.000 VND", vinhHung && vinhHung.price_amount === 12000000 && vinhHung.price_currency === "VND", JSON.stringify(vinhHung?.price_amount));
  
  const ciputraArea = ciputra?.floor_area_m2 || ciputra?.total_lease_area_m2;
  assert("TC1.4: Căn Sunshine Ciputra đúng giá 2000 USD, DT 214m2", 
    ciputra && ciputra.price_amount === 2000 && ciputra.price_currency === "USD" && ciputraArea === 214, 
    JSON.stringify(ciputra));

  const starlakeArea = starlake?.floor_area_m2 || starlake?.total_lease_area_m2;
  assert("TC1.5: Căn Starlake đúng giá 80.000.000 VND, DT 231m2", 
    starlake && starlake.price_amount === 80000000 && starlake.price_currency === "VND" && starlakeArea === 231, 
    JSON.stringify(starlake));

  assert("TC1.6: Căn Nam Dư đúng giá 16.500.000 VND", namDu && namDu.price_amount === 16500000, JSON.stringify(namDu?.price_amount));

  // Kiểm tra source_text_snippet riêng từng căn
  const allHaveSnippets = tc1Props.every(p => Boolean(p.source_text_snippet && p.source_text_snippet.trim().length > 10));
  assert("TC1.7: Mỗi căn có đoạn source_text_snippet riêng tương ứng", allHaveSnippets, "Một số căn thiếu source_text_snippet");

  console.log("\n------------------------------------------------------------------\n");

  // ==========================================
  // TEST CASE 2: BỒI ĐẮP THÔNG TIN CHO 1 CĂN (CONTINUATION)
  // ==========================================
  console.log("📌 TEST CASE 2: Bồi đắp thông tin (Tin nhắn tiếp nối cùng 1 căn BĐS)");
  const existingContextTc2 = `
- Địa chỉ: KCN Sóng Thần 2, Dĩ An, Bình Dương
- Diện tích: 1200 m2
- Đơn giá chào: Chưa có
- Đặc điểm: Kho xưởng xà gồ thép tiền chế, trạm điện riêng
`.trim();
  const tc2NewMessage = "Giá 85k/m2 nhé anh, hợp đồng 3 năm, hoa hồng 1 tháng bên e gửi";

  const tc2Result = await callGemini(tc2NewMessage, existingContextTc2);
  assert("TC2.1: Quyết định phải là CONTINUATION", tc2Result.decision === "CONTINUATION", `Decision thực tế: ${tc2Result.decision}`);
  assert("TC2.2: Trả về đúng 1 căn duy nhất sau khi hợp nhất", tc2Result.properties.length === 1, `Số căn: ${tc2Result.properties.length}`);
  const propTc2 = tc2Result.properties[0];
  assert("TC2.3: Giữ nguyên địa chỉ Bình Dương và cập nhật giá 85.000 VND/m2", 
    propTc2?.province === "Bình Dương" && propTc2?.price_amount === 85000 && propTc2?.price_basis === "per_m2",
    JSON.stringify(propTc2));
  assert("TC2.4: Bổ sung hoa hồng 1 tháng", Boolean(propTc2?.landlord_commission_text?.includes("1 tháng")), propTc2?.landlord_commission_text);

  console.log("\n------------------------------------------------------------------\n");

  // ==========================================
  // TEST CASE 3: ĐÍNH CHÍNH / SỬA GIÁ (PRICE CORRECTION)
  // ==========================================
  console.log("📌 TEST CASE 3: Đính chính / sửa đổi giá tiền cho căn đang thương lượng");
  const existingContextTc3 = `
- Địa chỉ: Biệt thự Ciputra Tây Hồ, Hà Nội
- Diện tích: 300 m2
- Đơn giá chào: 60000000 VND
- Đặc điểm: Biệt thự đơn lập, có sân vườn
`.trim();
  const tc3NewMessage = "À chủ nhà vừa gọi lại báo bớt xuống còn 55 triệu chốt nhanh nhé bạn!";

  const tc3Result = await callGemini(tc3NewMessage, existingContextTc3);
  console.log("TC3 Raw Result:", JSON.stringify(tc3Result, null, 2));
  assert("TC3.1: Nhận diện là CONTINUATION", tc3Result.decision === "CONTINUATION", tc3Result.decision);
  const propTc3 = tc3Result.properties?.[0];
  assert("TC3.2: Giá tiền được cập nhật chuẩn xác thành 55.000.000 VND", propTc3?.price_amount === 55000000, `Giá thực tế: ${propTc3?.price_amount}`);

  console.log("\n------------------------------------------------------------------\n");

  // ==========================================
  // TEST CASE 4: ĐA ĐỊA PHƯƠNG TRONG 1 TIN (BẮC & NAM)
  // ==========================================
  console.log("📌 TEST CASE 4: Tin nhắn chứa đồng thời các căn ở Tỉnh/Thành phố khác nhau");
  const tc4Input = `
Bên em có 2 căn hot mới về:
1. Kho 2000m2 KCN Sóng Thần, Dĩ An, Bình Dương. Giá 4.5 USD/m2.
2. Mặt bằng 85 Nguyễn Trãi, Phường Bến Thành, Quận 1, TP.HCM. Diện tích 160m2, giá 150 triệu/tháng.
`.trim();

  const tc4Result = await callGemini(tc4Input);
  const tc4Props = tc4Result.properties || [];
  assert("TC4.1: Tách đúng 2 căn", tc4Props.length === 2, `Số căn: ${tc4Props.length}`);
  const khoBD = tc4Props.find(p => p.address_text.includes("Sóng Thần") || p.address_text.includes("Bình Dương"));
  const mbHCM = tc4Props.find(p => p.address_text.includes("Nguyễn Trãi") || p.address_text.includes("Bến Thành") || p.address_text.includes("Quận 1"));
  assert("TC4.2: Căn 1 chuẩn xác Tỉnh Bình Dương", khoBD && khoBD.province === "Bình Dương", `Tỉnh căn 1: ${khoBD?.province}`);
  assert("TC4.3: Căn 2 chuẩn xác TP. Hồ Chí Minh", mbHCM && (mbHCM.province === "TP. Hồ Chí Minh" || mbHCM.province === "TP.HCM"), `Tỉnh căn 2: ${mbHCM?.province}`);

  console.log("\n------------------------------------------------------------------\n");

  // ==========================================
  // TEST CASE 5: DỮ LIỆU THIẾU / KHÔNG TỰ BỊA (NO HALLUCINATION)
  // ==========================================
  console.log("📌 TEST CASE 5: Dữ liệu sơ khai thiếu thông tin -> Không được tự bịa (null)");
  const tc5Input = "Cho thuê nhà mặt ngõ 180 Hoàng Hoa Thám 4 tầng. Liên hệ 0988776655 xem nhà";
  const tc5Result = await callGemini(tc5Input);
  const propTc5 = tc5Result.properties[0];

  assert("TC5.1: Nhận diện đúng địa chỉ Hoàng Hoa Thám, Hà Nội", 
    propTc5?.address_text.includes("Hoàng Hoa Thám") && propTc5?.province === "Hà Nội",
    `Địa chỉ: ${propTc5?.address_text}, Tỉnh: ${propTc5?.province}`);
  assert("TC5.2: Giá tiền không có -> Trả về null (Không bịa)", propTc5?.price_amount === null, `Giá: ${propTc5?.price_amount}`);
  assert("TC5.3: Diện tích không có -> Trả về null (Không bịa)", propTc5?.floor_area_m2 === null && propTc5?.total_lease_area_m2 === null, `DT: ${propTc5?.floor_area_m2}`);

  console.log("\n==================================================================");
  console.log(`📊 TỔNG KẾT KẾT QUẢ TESTCASE: ${passedTests}/${totalTests} TESTS PASSED (${Math.round(passedTests/totalTests*100)}%)`);
  console.log("==================================================================");

  if (passedTests === totalTests) {
    console.log("🎉 TẤT CẢ TEST CASES ĐÃ PASS 100%! HỆ THỐNG ĐẠT CHUẨN ĐỂ ĐƯA VÀO VẬN HÀNH!");
  } else {
    console.error("⚠️ CÓ TESTCASE CHƯA ĐẠT. CẦN TIẾP TỤC ĐIỀU CHỈNH!");
  }
}

runTestSuite().catch(console.error);
