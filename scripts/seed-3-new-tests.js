const { GoogleGenAI, Type } = require("@google/genai");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// 1. Đọc cấu hình từ .env.local
const envContent = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#")) {
    const [key, ...vals] = trimmed.split("=");
    env[key] = vals.join("=");
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const rawKeys = (env.GEMINI_API_KEYS || "").split(/[,\n;]/).map((k) => k.trim()).filter((k) => k.length > 5);
if (env.GEMINI_API_KEY && !rawKeys.includes(env.GEMINI_API_KEY.trim())) {
  rawKeys.push(env.GEMINI_API_KEY.trim());
}
const apiKeys = rawKeys.length > 0 ? rawKeys : [env.GEMINI_API_KEY || ""];
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
          "furniture_status",
        ],
      },
    },
  },
  required: ["properties"],
};

const systemPrompt = `
Bạn là chuyên gia trích xuất dữ liệu Bất động sản (BĐS) hàng đầu cho Huanseek.
Nhiệm vụ của bạn là bóc tách thông tin BĐS từ tin nhắn theo nguyên tắc NGUYÊN MẪU VĂN BẢN THUẦN TEXT:

1. CHỈ TRÍCH XUẤT CÁC THÔNG SỐ CÓ THỰC TRONG TIN NHẮN (STRICT FIDELITY - NO HALLUCINATION):
   - Thiếu trường dữ liệu cũng không sao, tuyệt đối để null hoặc để trống.
   - Không suy đoán thêm những gì không có trong tin nhắn.

2. NỘI THẤT & DANH SÁCH MÓN ĐỒ (Trích xuất nguyên mẫu câu chữ tiếng Việt):
   - "furniture_status": Điền trực tiếp chữ tiếng Việt (Chỉ chọn 1 trong 5 giá trị):
     * "đầy đủ nội thất": Khi nguồn ghi "full nội thất", "full đồ", "đầy đủ nội thất".
     * "cơ bản": Khi nguồn ghi "nội thất cơ bản", "đồ cơ bản", "không full". TUYỆT ĐỐI KHÔNG DỰA VÀO SỐ LƯỢNG ĐỒ ĐỂ TỰ ĐỔI THÀNH FULL! Có chữ "cơ bản" là bắt buộc ghi "cơ bản".
     * "không nội thất": Khi nguồn ghi "không nội thất", "không đồ", "nhà trống".
     * "bàn giao thô": Khi nguồn ghi "bàn giao thô", "nhà thô".
     * "chưa rõ": Khi tin nhắn hoàn toàn không nhắc gì đến nội thất.
   - "furniture_list": Trích xuất NGUYÊN MẪU danh sách các món đồ được liệt kê trong tin nhắn.
     * Nguồn nói rõ thiếu hoặc không có món nào thì ghi rõ nguyên văn (ví dụ: "riêng tủ lạnh chưa có").
     * Nếu không có liệt kê thì để null hoặc "".

3. BẢO TOÀN ĐIỀU KIỆN CẤM (NEGATIVE CONSTRAINTS):
   - Nếu có cấm kinh doanh ăn uống / không làm hàng ăn, bảo toàn điều kiện này trong key_details ở cả 3 thứ tiếng.
`;

const testScenarios = [
  {
    partner_name: "Aoran",
    partner_id: "e37d3778-59c9-414a-9154-140ff10a54e9",
    zalo_user_id: "4051545883135786995",
    text: `Cho thuê nhà liền kề 6 tầng mới xây tại Louis Đại Mỗ, Nam Từ Liêm, Hà Nội.
- Diện tích: 120m2 x 6 tầng, thang máy. Mặt tiền 6m.
- Tầng 1: Thông sàn + WC.
- Tầng 2,3,4,5,6: Thông sàn + WC.
- Nội thất cơ bản: 6 điều hoà, 6 nóng lạnh, thang máy tốc độ cao, tủ bếp.
- Phù hợp: làm văn phòng công ty, kinh doanh online, spa, trung tâm dạy học. Không làm hàng ăn.
- Giá thuê: 60 triệu/tháng (có thương lượng).
- Hoa hồng: 1 tháng bên mình 50%.
- Liên hệ xem nhà: 0984482761.`
  },
  {
    partner_name: "Hung Doan Xuan",
    partner_id: "dc2f2cb9-be84-4553-92ae-9a39a9ca9364",
    zalo_user_id: "132377638832335132",
    text: `Cho thuê căn hộ Iris Garden, 30 Trần Hữu Dực, Mỹ Đình, Nam Từ Liêm, Hà Nội.
- Căn hộ toà CT3 tầng trung, DT 61m2 thiết kế 2 phòng ngủ 2 vệ sinh.
- Đầy đủ nội thất: 3 điều hòa Daikin, 2 bình nóng lạnh Ariston, sofa da, bàn ăn 4 ghế, giường đệm cao su, tủ quần áo, máy giặt; riêng tủ lạnh chưa có khách thuê tự sắm.
- Giá chào: 12 triệu/tháng, thanh toán 3 cọc 1.
- Hoa hồng: 1 tháng bên mình 50%.
- Nhận nhà ngay.`
  },
  {
    partner_name: "Linh",
    partner_id: "25120e53-a4d6-48ab-a502-7b2ea425ed34",
    zalo_user_id: "699126342447727737",
    text: `Chính chủ cho thuê nhà mặt phố Xã Đàn, phường Nam Đồng, quận Đống Đa, Hà Nội.
- Diện tích: 80m2 x 5 tầng, mặt tiền 5.5m vỉa hè rộng 4m ô tô đỗ thoải mái.
- Hiện trạng: Nhà trống, không nội thất, bàn giao ngay, đã có trần thạch cao và hệ thống đèn LED âm trần.
- Phù hợp: Showroom thời trang, phòng khám, ngân hàng, thẩm mỹ viện. Không cho làm quán ăn nhậu.
- Giá thuê: 85 triệu/tháng (có thương lượng nếu ký hợp đồng 5 năm).
- Hoa hồng: 1 tháng tiền nhà.`
  }
];

function postProcess(prop, rawText) {
  const combined = `${rawText} ${prop.key_details?.vi || ""}`;
  if (/nội\s*thất\s*cơ\s*bản|đồ\s*cơ\s*bản|không\s*full/i.test(combined)) {
    prop.furniture_status = "cơ bản";
  } else if (/full\s*(?:nội\s*thất|đồ|option)|đầy\s*đủ\s*(?:nội\s*thất|đồ)/i.test(combined)) {
    prop.furniture_status = "đầy đủ nội thất";
  } else if (/không\s*nội\s*thất|không\s*đồ|nhà\s*trống/i.test(combined)) {
    prop.furniture_status = "không nội thất";
  } else if (/bàn\s*giao\s*thô|nhà\s*thô/i.test(combined)) {
    prop.furniture_status = "bàn giao thô";
  } else if (!prop.furniture_status) {
    prop.furniture_status = "chưa rõ";
  }

  if (prop.price_amount && prop.price_amount > 0 && prop.price_amount < 1000) {
    prop.price_amount = prop.price_amount * 1000000;
  }

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

  return prop;
}

async function runSeed() {
  console.log("=== BẮT ĐẦU TẠO 3 BẢN GHI TEST MỚI CHO HỘP THƯ CHỜ DUYỆT (INBOX) ===");
  
  // Xác thực API Key
  const ai = new GoogleGenAI({ apiKey: apiKeys[0] });

  for (let i = 0; i < testScenarios.length; i++) {
    const sc = testScenarios[i];
    console.log(`\n--- XỬ LÝ TEST CASE ${i + 1}: ${sc.partner_name} ---`);
    console.log(`Tin nhắn: \n${sc.text}\n`);

    // 1. Gọi Gemini bóc tách thuần text
    const prompt = `${systemPrompt}\n\nĐOẠN TIN NHẮN TỪ ĐỐI TÁC:\n${sc.text}`;
    const res = await ai.models.generateContent({
      model: modelId,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    const parsed = JSON.parse(res.text);
    const prop = postProcess(parsed.properties[0], sc.text);

    console.log(`[Kết quả AI trích xuất]`);
    console.log(`  Địa chỉ: ${prop.address_text}`);
    console.log(`  Diện tích sàn: ${prop.floor_area_m2} m2 | Tổng DT: ${prop.total_lease_area_m2 || prop.floor_area_m2} m2`);
    console.log(`  Giá tiền: ${prop.price_amount} VND (${prop.price_text})`);
    console.log(`  Nội thất (furniture_status): "${prop.furniture_status}"`);
    console.log(`  Danh sách đồ (furniture_list): "${prop.furniture_list}"`);
    console.log(`  Hoa hồng: ${prop.landlord_commission_text} (Bên mình: ${prop.our_share_percent}%)`);

    // 2. Tạo bản ghi Submission trong database
    const { data: sub, error: subErr } = await supabase
      .from("submissions")
      .insert({
        partner_id: sc.partner_id,
        raw_text: sc.text,
        msg_count: 1,
        attachment_count: 0,
        status: "done",
        ai_status: "done",
        close_reason: "idle_timeout",
        close_at: new Date().toISOString()
      })
      .select()
      .single();

    if (subErr) {
      console.error("Lỗi tạo submission:", subErr);
      continue;
    }

    // 3. Tạo bản ghi Tin nhắn Zalo trong zalo_incoming_chats
    await supabase.from("zalo_incoming_chats").insert({
      partner_id: sc.partner_id,
      submission_id: sub.id,
      zalo_msg_id: `test_msg_${Date.now()}_${i + 1}`,
      zalo_user_id: sc.zalo_user_id,
      event_name: "user_send_text",
      msg_type: "text",
      direction: "in",
      text_content: sc.text,
      zalo_image_urls: [],
      storage_paths: [],
      raw_payload: { text: sc.text },
      created_at: new Date().toISOString()
    });

    // 4. Tạo bản ghi property_listings sạch (thuần text, 0 ảnh)
    const { data: listing, error: listErr } = await supabase
      .from("property_listings")
      .insert({
        submission_id: sub.id,
        partner_id: sc.partner_id,
        review_status: "pending",
        address_text: prop.address_text,
        house_number: prop.house_number || null,
        street_name: prop.street_name || null,
        ward: prop.ward || null,
        district_legacy: prop.district_legacy || null,
        province: prop.province || null,
        property_types: prop.property_types || ["Nhà phố"],
        floor_area_m2: prop.floor_area_m2 || null,
        total_lease_area_m2: prop.total_lease_area_m2 || null,
        price_amount: prop.price_amount || null,
        price_currency: prop.price_currency || "VND",
        price_period: prop.price_period || "month",
        price_basis: prop.price_basis || "total",
        price_text: prop.price_text || null,
        key_details: {
          vi: prop.key_details?.vi || "",
          en: prop.key_details?.en || "",
          zh: prop.key_details?.zh || "",
          lease_term_text: prop.lease_term_text || null,
          furniture_status: prop.furniture_status || "chưa rõ",
          furniture_list: prop.furniture_list || null,
          handover_condition: prop.furniture_status || "chưa rõ"
        },
        landlord_commission_text: prop.landlord_commission_text || null,
        our_share_percent: prop.our_share_percent || null,
        our_share_text: prop.our_share_text || null,
        location_note: sc.text,
        attachments: [], // THUẦN TEXT - KHÔNG ẢNH
        ai_extracted: prop,
        change_history: [{ created_at: new Date().toISOString(), text: "Tạo dữ liệu test thuần text mới" }]
      })
      .select()
      .single();

    if (listErr) {
      console.error("Lỗi tạo property_listings:", listErr);
    } else {
      console.log(`=> Đã thêm thành công vào Inbox! Listing ID: ${listing.id}`);
    }
  }

  // Cập nhật lại total_submissions cho 3 partner
  for (const sc of testScenarios) {
    await supabase.from("partners").update({ total_submissions: 1, last_seen_at: new Date().toISOString() }).eq("id", sc.partner_id);
  }

  console.log("\n=== HOÀN TẤT SEED 3 TEST CASE MỚI VÀO HỘP THƯ CHỜ DUYỆT! ===");
}

runSeed().catch(console.error);
