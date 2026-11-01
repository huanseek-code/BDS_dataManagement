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
          total_lease_area_m2: { type: Type.NUMBER, nullable: true },
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
Bạn là chuyên gia thẩm định và bóc tách dữ liệu Bất động sản (BĐS) hàng đầu cho Huanseek.
Nhiệm vụ của bạn là đọc DÒNG THỜI GIAN CÁC TIN NHẮN VĂN BẢN từ đối tác môi giới, nhận diện chính xác có MỘT hay NHIỀU căn BĐS độc lập và trích xuất thành danh sách chuẩn hóa thuần text.

NGUYÊN TẮC CỐT LÕI - BÓC TÁCH ĐẦY ĐỦ & GIỮ NGUYÊN BẢN TIN NHẮN (STRICT VERBATIM FIDELITY):

1. BÓC TÁCH TOÀN BỘ CÁC THÔNG SỐ CÓ THỰC TRONG TIN NHẮN:
   - Trích xuất đầy đủ và triệt để mọi thông tin có trong văn bản: địa chỉ, loại hình, diện tích sàn, tổng diện tích, số tầng, mặt tiền, kết cấu phòng/vệ sinh, đồ đạc nội thất, giá thuê/bán, điều kiện thanh toán/cọc, thời hạn hợp đồng...
   - CHỈ TRÍCH XUẤT THÔNG TIN THỰC SỰ CÓ TRONG TIN NHẮN. NẾU THIẾU TRƯỜNG DỮ LIỆU CŨNG KHÔNG SAO -> BẮT BUỘC ĐỂ NULL HOẶC ĐỂ TRỐNG.
   - TUYỆT ĐỐI KHÔNG TỰ BỊA RA, KHÔNG SUY ĐOÁN những thông tin không có trong văn bản!

2. PHÂN TÁCH ĐA CĂN BĐS & DANH SÁCH GẠCH ĐẦU DÒNG:
   - Khi đối tác gửi danh sách gồm nhiều dòng gạch đầu dòng '-' hoặc bullet point (ví dụ danh sách các căn Studio, 1N, 2N, 3N): BẮT BUỘC BÓC TÁCH TỪNG DÒNG THÀNH TỪNG CĂN ĐỘC LẬP trong mảng "properties", TUYỆT ĐỐI KHÔNG ĐƯỢC BỎ SÓT BẤT KỲ CĂN NÀO!
   - LOẠI TRỪ TIN TÌM CĂN / NHU CẦU CỦA KHÁCH: Nếu tin nhắn thể hiện nhu cầu tìm thuê (ví dụ: "E tìm 1n/1n+ cho khách thuê", "khách e chiều 2h đi xem tìm 1pn+..."), đây là tin tìm căn của khách, KHÔNG PHẢI NGUỒN CĂN CHO THUÊ -> BỎ QUA, không đưa vào danh sách properties.
   - "source_text_snippet": BẮT BUỘC trích nguyên văn đoạn văn bản mô tả riêng của chính căn đó.

3. NỘI THẤT & DANH SÁCH MÓN ĐỒ (STRICT FIDELITY - TUYỆT ĐỐI KHÔNG SUY DIỄN / KHÔNG TỰ BỊA):
   - "furniture_status": Điền trực tiếp chữ tiếng Việt (Chỉ chọn 1 trong 5 giá trị):
     * "đầy đủ nội thất": KHI VÀ CHỈ KHI nguồn ghi rõ: "full nội thất", "full đồ", "full option", "full gỗ", "đầy đủ nội thất", "đủ đồ".
     * "cơ bản": KHI VÀ CHỈ KHI nguồn ghi rõ: "nội thất cơ bản", "đồ cơ bản", "không full", "bán hoàn thiện". TUYỆT ĐỐI KHÔNG DỰA VÀO SỐ LƯỢNG ĐỒ ĐƯỢC LIỆT KÊ ĐỂ TỰ ĐỔI TỪ CƠ BẢN THÀNH FULL! Dù liệt kê bao nhiêu món đồ đi nữa, hễ có chữ "cơ bản/không full" thì bắt buộc ghi "cơ bản".
     * "không nội thất": KHI VÀ CHỈ KHI nguồn ghi rõ: "không nội thất", "không đồ", "nhà trống".
     * "bàn giao thô": KHI VÀ CHỈ KHI nguồn ghi rõ: "bàn giao thô", "nhà thô".
     * "chưa rõ": BẮT BUỘC CHỌN "chưa rõ" TRONG CẢ 2 TRƯỜNG HỢP SAU:
       (a) Tin nhắn hoàn toàn KHÔNG NHẮC GÌ đến nội thất (ví dụ: tin chỉ có diện tích, số tầng, giá như Trần Vỹ -> furniture_status BẮT BUỘC LÀ "chưa rõ", TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ SUY ĐOÁN LÀ "cơ bản"!).
       (b) Tin nhắn CHỈ LIỆT KÊ TÊN THIẾT BỊ / MÓN ĐỒ mà KHÔNG CÓ từ khẳng định "full" hay "cơ bản" (ví dụ: chỉ ghi "Dh, nl, giường, bếp" hoặc "Dh âm trần, nl, THANG MÁY" hoặc "có bếp rèm" -> furniture_status BẮT BUỘC LÀ "chưa rõ", TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ KẾT LUẬN LÀ "đầy đủ nội thất"!).
   - "furniture_list": Trích xuất NGUYÊN MẪU danh sách các món đồ được liệt kê trong tin nhắn (ví dụ: "Dh, nl, giường, bếp", "Dh âm trần, nl, THANG MÁY", "có bếp rèm").
     * Nếu tin nhắn không liệt kê món đồ nào thì để null hoặc "".
`;

function postProcess(prop, snippetText) {
  const text = `${prop.source_text_snippet || ""} ${snippetText || ""}`;

  // 1. Chuẩn hóa furniture_status & handover_condition theo đúng nguyên tắc Strict Fidelity
  if (/nội\s*thất\s*cơ\s*bản|đồ\s*cơ\s*bản|không\s*full/i.test(text)) {
    prop.furniture_status = "cơ bản";
  } else if (/full\s*(?:nội\s*thất|đồ|option|gỗ)|đầy\s*đủ\s*(?:nội\s*thất|đồ)|đủ\s*đồ/i.test(text)) {
    prop.furniture_status = "đầy đủ nội thất";
  } else if (/không\s*nội\s*thất|không\s*đồ|nhà\s*trống/i.test(text)) {
    prop.furniture_status = "không nội thất";
  } else if (/bàn\s*giao\s*thô|nhà\s*thô/i.test(text)) {
    prop.furniture_status = "bàn giao thô";
  } else {
    // Nếu tin nhắn chỉ liệt kê món đồ cụ thể (ví dụ "Dh, nl, giường, bếp") hoặc không nhắc gì -> bắt buộc "chưa rõ"
    prop.furniture_status = "chưa rõ";
  }

  return prop;
}

async function callGemini(text) {
  let lastErr = null;
  for (const key of apiKeys) {
    const client = new GoogleGenAI({ apiKey: key });
    for (const model of candidateModels) {
      try {
        const res = await client.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nTin nhắn Zalo:\n${text}` }] }],
          config: {
            temperature: 0.0,
            topP: 0.1,
            responseMimeType: "application/json",
            responseSchema,
          },
        });
        if (res && res.text) {
          const parsed = JSON.parse(res.text);
          return (parsed.properties || []).map(p => postProcess(p, p.source_text_snippet || ""));
        }
      } catch (err) {
        lastErr = err;
        continue;
      }
    }
  }
  throw new Error("Tất cả key/model đều bận: " + (lastErr?.message || String(lastErr)));
}

async function runTestCase(name, input, validator, runs = 3) {
  console.log(`\n▶ [TEST] ${name} (Chạy ${runs} lần kiểm tra tính tất định 100%):`);
  for (let r = 1; r <= runs; r++) {
    try {
      const start = Date.now();
      const properties = await callGemini(input);
      const elapsed = Date.now() - start;
      const result = validator(properties);
      if (result.pass) {
        console.log(`  ✓ Lần ${r}/${runs} (${elapsed}ms): PASS - ${result.message}`);
      } else {
        console.error(`  ✗ Lần ${r}/${runs} (${elapsed}ms): FAIL - ${result.message}`);
        console.error("    Dữ liệu trả về:", JSON.stringify(properties, null, 2));
        return false;
      }
    } catch (err) {
      console.error(`  ✗ Lần ${r}/${runs}: LỖI GỌI API:`, err.message);
      return false;
    }
  }
  return true;
}

async function main() {
  console.log("================================================================================");
  console.log(" KIỂM THỬ ĐỘ CHÍNH XÁC NGUYÊN BẢN (STRICT FIDELITY) & TÍNH TẤT ĐỊNH (MULTI-RUN)");
  console.log(" Cấu hình Gemini: temperature = 0.0, topP = 0.1");
  console.log("================================================================================");

  let allPassed = true;

  // TEST 1: Greenbay (Chỉ liệt kê món đồ "Dh, nl, giường, bếp", không có từ full/cơ bản)
  const pass1 = await runTestCase(
    "Test 1 - Greenbay: Chỉ liệt kê 'Dh, nl, giường, bếp' -> furniture_status phải là 'chưa rõ'",
    `Cần cho thuê nhà Shophouse Vinhomes Greenbay, Nam Từ Liêm Có Thang Máy
- Diện tích: 120m2 x 4 tầng, mặt tiền 6m
- Giá thuê: 60tr/ tháng
- Nội thất: Dh, nl, giường, bếp
- Phù hợp: Văn phòng, ở gia đình, cty`,
    (props) => {
      if (props.length === 0) return { pass: false, message: "Không tìm thấy căn nào" };
      const p = props[0];
      const statusCorrect = p.furniture_status === "chưa rõ";
      const listCorrect = p.furniture_list && /Dh.*nl.*giường.*bếp/i.test(p.furniture_list);
      if (statusCorrect && listCorrect) {
        return { pass: true, message: `furniture_status = "${p.furniture_status}", furniture_list = "${p.furniture_list}"` };
      }
      return { pass: false, message: `Mong muốn furniture_status='chưa rõ', thực tế='${p.furniture_status}' | furniture_list='${p.furniture_list}'` };
    },
    3
  );
  if (!pass1) allPassed = false;

  // TEST 2: Gardenia (Chỉ liệt kê "Dh âm trần, nl, THANG MÁY")
  const pass2 = await runTestCase(
    "Test 2 - Gardenia: Chỉ liệt kê 'Dh âm trần, nl, THANG MÁY' -> furniture_status phải là 'chưa rõ'",
    `Vinhome Gardenia Hàm Nghi, Nam Từ Liêm
- DT: 100m2 x 4 tầng
- Giá: 60tr/ tháng
- Thiết bị: Dh âm trần, nl, THANG MÁY
- Cọc 1 thanh toán 3`,
    (props) => {
      if (props.length === 0) return { pass: false, message: "Không tìm thấy căn nào" };
      const p = props[0];
      const statusCorrect = p.furniture_status === "chưa rõ";
      const listCorrect = p.furniture_list && /Dh.*nl.*thang\s*máy/i.test(p.furniture_list);
      if (statusCorrect && listCorrect) {
        return { pass: true, message: `furniture_status = "${p.furniture_status}", furniture_list = "${p.furniture_list}"` };
      }
      return { pass: false, message: `Mong muốn furniture_status='chưa rõ', thực tế='${p.furniture_status}' | furniture_list='${p.furniture_list}'` };
    },
    3
  );
  if (!pass2) allPassed = false;

  // TEST 3: Trần Vỹ (Hoàn toàn không nhắc gì đến nội thất)
  const pass3 = await runTestCase(
    "Test 3 - Trần Vỹ: Không nhắc nội thất -> furniture_status phải là 'chưa rõ', KHÔNG được suy đoán là 'cơ bản'",
    `Mặt phố Trần Vỹ - Hồ Tùng Mậu
Diện tích 180m2 x 8 tầng - 1 hầm
Mặt tiền 9m
Giá 200 tr/ tháng (có thương lượng)
Ký hợp đồng dài hạn`,
    (props) => {
      if (props.length === 0) return { pass: false, message: "Không tìm thấy căn nào" };
      const p = props[0];
      const statusCorrect = p.furniture_status === "chưa rõ";
      const listEmpty = !p.furniture_list || p.furniture_list.trim() === "";
      if (statusCorrect && listEmpty) {
        return { pass: true, message: `furniture_status = "${p.furniture_status}", furniture_list = null/rỗng` };
      }
      return { pass: false, message: `Mong muốn furniture_status='chưa rõ', thực tế='${p.furniture_status}' | furniture_list='${p.furniture_list}'` };
    },
    3
  );
  if (!pass3) allPassed = false;

  // TEST 4: Khẳng định rõ "đồ cơ bản"
  const pass4 = await runTestCase(
    "Test 4 - S106: Ghi rõ 'đồ cơ bản: tủ bếp, giường' -> furniture_status phải là 'cơ bản'",
    `- 2N+1 64m2 giá 8,5tr đồ cơ bản: tủ bếp, giường,... S106 Đông Nam - Tây Nam`,
    (props) => {
      if (props.length === 0) return { pass: false, message: "Không tìm thấy căn nào" };
      const p = props[0];
      const statusCorrect = p.furniture_status === "cơ bản";
      const listCorrect = p.furniture_list && /tủ\s*bếp.*giường/i.test(p.furniture_list);
      if (statusCorrect && listCorrect) {
        return { pass: true, message: `furniture_status = "${p.furniture_status}", furniture_list = "${p.furniture_list}"` };
      }
      return { pass: false, message: `Mong muốn furniture_status='cơ bản', thực tế='${p.furniture_status}' | furniture_list='${p.furniture_list}'` };
    },
    3
  );
  if (!pass4) allPassed = false;

  // TEST 5: Khẳng định rõ "full đồ"
  const pass5 = await runTestCase(
    "Test 5 - GS6 63m2: Ghi rõ 'full đồ', giá 10,5tr -> furniture_status = 'đầy đủ nội thất', price = 10.5tr",
    `Tòa: GS6/ 2N2wc 63m
Tầng/view: Tầng thấp/ ban công Đông Nam - Tây Nam / view bể bơi tuyệt đẹp
Nội thất: full đồ
Thanh toán : đóng 3 cọc 1 hoặc 2 cọc 1 
Ngày vào: vào luôn
Giá thuê: 10,5tr
Lh 0938936894`,
    (props) => {
      if (props.length === 0) return { pass: false, message: "Không tìm thấy căn nào" };
      const p = props[0];
      const statusCorrect = p.furniture_status === "đầy đủ nội thất";
      const priceCorrect = p.price_amount === 10500000;
      const areaCorrect = p.floor_area_m2 === 63;
      if (statusCorrect && priceCorrect && areaCorrect) {
        return { pass: true, message: `furniture_status = "${p.furniture_status}", price = 10,500,000, area = 63m²` };
      }
      return { pass: false, message: `Thực tế: status='${p.furniture_status}', price=${p.price_amount}, area=${p.floor_area_m2}` };
    },
    3
  );
  if (!pass5) allPassed = false;

  // TEST 6: Toàn bộ đợt tin nhắn của Aoran (chứa I2, I3, S106, GS6 63m² 10.5tr)
  const aoranBatchText = `Cho thuê nhanh 1+ impe toà I2 full đồ điện tử giá 9tr mpdv vào luôn
Tòa i3  2n2w+ có bếp  rèm
giá thuê 9,5 tr mpdv
thời gian vào 1/11
(Đóng 3) (cọc 1) (hợp đồng 1 năm) 
Phí mô giới 7tr

2n2WC 2N+1 2WC 60-64M2
"- GS6 2N2wc full đồ 11tr - vào luôn - Đông nam view bể bơi *sẵn pass
- 2N+1 64m2 giá 8,5tr đồ cơ bản: tủ bếp, giường,... S106 Đông Nam - Tây Nam
- 2N+1 64m2 mas B full đồ 17tr - Đông Bắc - view hồ điều hoà, công viên - vào luôn
- S203 Đồ cơ bản vào luôn 8,5tr có tủ bếp
- Tk2 62m2 căn góc 2N2wc full đồ 12tr 1/11 vào
- 2N+1 Full đồ SA1 11,5tr - 5/11 vào
- S203 full gỗ 2N+1 giá 11tr - ngày 15/11 vào
- S101 2N full 9,5tr ngày 1/12 vào view bể bơi
- 2n2wc 71m2 toà A1 ĐCB cdt có rèm, giàn phơi, giá 12,5tr vào luôn, miễn phí dịch vụ"

3N
"- 3N full đồ 12,5tr vào luôn SA5, ko tivi
- Shop chân đế G2 -63m2 giá 65tr/1 tháng 3 cọc 1
- 3N full đồ 15tr TK2 vào luôn 83m2 "
0938936894

E tìm 1n/1n+ full đồ SA1/GS5/GS6 cho khách thuê. AC trống căn báo e ạ
khách e chiều 2h đi xem tìm 1pn+ GS với SA tài chính 9tr đổ xuống, trừ hướng đông nam, tầng tầm dưới 20 đổ xuống càng tốt.

Cho thuê 2N1wc full đồ vào được ngay
chủ nhà dễ tính hỗ trợ đóng 1 hoặc 2 cọc 1
S3 gần nha xe khu ăn uống, công viên lh 0938936894

🍀 S402 Bán 2N+ 64m2 - Đông nam - Full đồ - Tầng trung - Lh: 0867291623

Cho thuê nhanh studio 6,5tr vào luôn full đồ sáng

Tòa: GS6/ 2N2wc 63m
Tầng/view: Tầng thấp/ ban công Đông Nam - Tây Nam / view bể bơi tuyệt đẹp
Nội thất: full đồ
Thanh toán : đóng 3 cọc 1 hoặc 2 cọc 1 
Ngày vào: vào luôn
Giá thuê: 10,5tr
Lh 0938936894`;

  const pass6 = await runTestCase(
    "Test 6 - Đợt tin nhắn Zalo của Aoran: Bóc tách đầy đủ cả 4 căn (GS6 63m² 10.5tr, I2 9tr, I3 9.5tr, S106 8.5tr)",
    aoranBatchText,
    (props) => {
      const gs6_105 = props.find(p => /GS6/i.test(p.address_text || "") && (p.price_amount === 10500000 || /10[,.]5/i.test(p.price_text || "")));
      const i2 = props.find(p => /I2/i.test(p.address_text || "") && (p.price_amount === 9000000 || /9/i.test(p.price_text || "")));
      const i3 = props.find(p => /i3/i.test(p.address_text || "") && (p.price_amount === 9500000 || /9[,.]5/i.test(p.price_text || "")));
      const s106 = props.find(p => /S106/i.test(p.address_text || "") && (p.price_amount === 8500000 || /8[,.]5/i.test(p.price_text || "")));

      const missing = [];
      if (!gs6_105) missing.push("GS6 63m² giá 10,5tr");
      if (!i2) missing.push("Toà I2 giá 9tr");
      if (!i3) missing.push("Tòa i3 giá 9,5tr");
      if (!s106) missing.push("S106 giá 8,5tr");

      if (missing.length === 0) {
        return {
          pass: true,
          message: `Tìm thấy đủ cả 4 căn! Tổng số căn bóc tách được trong batch: ${props.length} căn độc lập.`,
        };
      }
      return {
        pass: false,
        message: `Bị thiếu căn: ${missing.join(", ")}. Tổng số căn trích xuất được: ${props.length}.`,
      };
    },
    3
  );
  if (!pass6) allPassed = false;

  console.log("\n================================================================================");
  if (allPassed) {
    console.log(" KẾT QUẢ: 100% TẤT CẢ CÁC TEST CASES ĐÃ PASS QUA MỌI LẦN CHẠY!");
  } else {
    console.log(" KẾT QUẢ: CÓ TEST CASE BỊ LỖI, CẦN RÀ SOÁT TIẾP.");
  }
  console.log("================================================================================\n");
}

main().catch(console.error);
