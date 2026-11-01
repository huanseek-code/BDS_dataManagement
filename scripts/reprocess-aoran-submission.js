const { createClient } = require("@supabase/supabase-js");
const { GoogleGenAI, Type } = require("@google/genai");
const fs = require("fs");
const path = require("path");

// Đọc .env.local
const envContent = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#")) {
    const [key, ...vals] = trimmed.split("=");
    env[key] = vals.join("=");
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const apiKey = env.GEMINI_API_KEY_1 || env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey });
const modelId = env.GEMINI_MODEL || "gemini-2.5-flash";

const subId = "9e564e19-ebe8-4568-90ac-de851711502e";

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
          price_currency: { type: Type.STRING, nullable: true },
          price_period: { type: Type.STRING, nullable: true },
          price_basis: { type: Type.STRING, nullable: true },
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
Nhiệm vụ: Đọc toàn bộ danh sách tin nhắn văn bản và bóc tách từng căn BĐS độc lập thành danh sách chuẩn hóa thuần text.

NGUYÊN TẮC CỐT LÕI - BÓC TÁCH ĐẦY ĐỦ & GIỮ NGUYÊN BẢN TIN NHẮN (STRICT VERBATIM FIDELITY):
1. PHÂN TÁCH ĐA CĂN: Mỗi dòng gạch đầu dòng là 1 căn độc lập trong mảng 'properties', không được bỏ sót bất kỳ căn nào.
2. LOẠI TRỪ TIN TÌM CĂN: Các tin tìm căn cho khách thuê ('E tìm 1n/1n+...', 'khách e chiều 2h...') là tin tìm căn của khách, BỎ QUA không trích xuất.
3. NỘI THẤT (furniture_status):
   - 'đầy đủ nội thất': KHI VÀ CHỈ KHI có chữ 'full nội thất', 'full đồ', 'full option', 'full gỗ', 'đầy đủ nội thất', 'đủ đồ'.
   - 'cơ bản': KHI VÀ CHỈ KHI có chữ 'nội thất cơ bản', 'đồ cơ bản', 'không full', 'bán hoàn thiện'.
   - 'chưa rõ': Khi không nhắc gì đến nội thất, HOẶC CHỈ LIỆT KÊ MÓN ĐỒ ('có bếp rèm', 'Dh, nl, giường, bếp') mà không có chữ 'full' hay 'cơ bản'.
4. furniture_list: Trích xuất nguyên văn danh sách món đồ hoặc để null nếu không có.
`;

function postProcess(prop) {
  const text = prop.source_text_snippet || "";
  if (/nội\s*thất\s*cơ\s*bản|đồ\s*cơ\s*bản|không\s*full/i.test(text)) {
    prop.furniture_status = "cơ bản";
  } else if (/full\s*(?:nội\s*thất|đồ|option|gỗ)|đầy\s*đủ\s*(?:nội\s*thất|đồ)|đủ\s*đồ/i.test(text)) {
    prop.furniture_status = "đầy đủ nội thất";
  } else if (/không\s*nội\s*thất|không\s*đồ|nhà\s*trống/i.test(text)) {
    prop.furniture_status = "không nội thất";
  } else if (/bàn\s*giao\s*thô|nhà\s*thô/i.test(text)) {
    prop.furniture_status = "bàn giao thô";
  } else {
    prop.furniture_status = "chưa rõ";
  }
  return prop;
}

async function run() {
  const { data: sub } = await supabase.from("submissions").select("*").eq("id", subId).single();
  if (!sub) return console.log("Sub not found");

  console.log("Bắt đầu bóc tách submission", subId, "...");
  const res = await ai.models.generateContent({
    model: modelId,
    contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nTin nhắn:\n${sub.raw_text}` }] }],
    config: {
      temperature: 0.0,
      topP: 0.1,
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  const parsed = JSON.parse(res.text);
  const props = (parsed.properties || []).map(postProcess);
  console.log("Số căn bóc tách được:", props.length);

  // Xóa các bản ghi cũ của submission nếu có
  await supabase.from("property_listings").delete().eq("submission_id", subId);

  // Chèn các căn sạch vào database
  let count = 0;
  for (const p of props) {
    await supabase.from("property_listings").insert({
      submission_id: subId,
      partner_id: sub.partner_id,
      review_status: "pending",
      address_text: p.address_text,
      floor_area_m2: p.floor_area_m2 || null,
      total_lease_area_m2: p.total_lease_area_m2 || null,
      price_amount: p.price_amount || null,
      price_currency: p.price_currency || "VND",
      price_period: p.price_period || "month",
      price_basis: p.price_basis || "total",
      price_text: p.price_text || null,
      location_note: p.source_text_snippet || null,
      attachments: [],
      key_details: {
        vi: p.key_details?.vi || "",
        en: p.key_details?.en || "",
        zh: p.key_details?.zh || "",
        furniture_status: p.furniture_status,
        furniture_list: p.furniture_list || null,
        handover_condition: p.furniture_status,
      },
      change_history: [{ created_at: new Date().toISOString(), text: p.source_text_snippet || "Trích xuất văn bản Zalo OA" }],
    });
    count++;
  }

  // Đánh dấu submission hoàn tất
  await supabase.from("submissions").update({
    status: "done",
    ai_status: "done",
    ai_mode: "batch_reconciled",
    ai_model: modelId,
    updated_at: new Date().toISOString(),
  }).eq("id", subId);

  console.log("✅ Hoàn tất! Đã tạo", count, "căn BĐS chuẩn hóa cho submission Aoran.");
}

run().catch(console.error);
