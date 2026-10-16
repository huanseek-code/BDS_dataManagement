const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI, Type } = require('@google/genai');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const modelId = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const systemPrompt = `
Bạn là chuyên gia bóc tách dữ liệu Bất động sản (BĐS) chuyên nghiệp hàng đầu cho Huanseek.
Nhiệm vụ: Đọc tin nhắn Zalo và trích xuất danh sách các căn BĐS chuẩn hóa.

QUY TẮC CỐT LÕI:
1. MỘT LẦN GỬI CÓ THỂ CHỨA NHIỀU CĂN (MULTI-PROPERTY): Tách riêng từng căn vào mảng 'properties'.
2. MỖI CĂN PHẢI CÓ 'source_text_snippet': Trích đúng đoạn văn bản gốc của riêng căn đó.
3. CHUẨN HÓA ĐỊA DANH & TỈNH/THÀNH PHỐ (province):
   - Hà Nội: Vĩnh Hưng, Nam Dư, Thanh Lân, Hoàng Mai, Ciputra, Sunshine City, Starlake, Tây Hồ, Cầu Giấy...
   - TP. Hồ Chí Minh: Quận 1, Quận 3, Thủ Đức, KCN Linh Trung...
   - Bình Dương: Dĩ An, Thuận An, Sóng Thần, VSIP...
   - Nếu không có địa danh nhận diện: trả về null. Tuyệt đối không tự ý gán bừa.
4. QUY ĐỔI GIÁ:
   - '80 ạ', '80tr' -> price_amount: 80000000, price_currency: 'VND'
   - '16,5 triệu' -> price_amount: 16500000, price_currency: 'VND'
   - '12 triệu' -> price_amount: 12000000, price_currency: 'VND'
   - '2000$' -> price_amount: 2000, price_currency: 'USD'
5. CHI TIẾT CHÍNH (key_details): Tóm tắt vi, en, zh.
`;

async function cleanAndRefresh() {
  const subId = 'b428fe4a-f473-48d3-b202-854fa4716b5d';

  // 1. Delete messy pending listings of this submission
  const { error: delErr } = await supabase
    .from('property_listings')
    .delete()
    .eq('submission_id', subId)
    .eq('review_status', 'pending');
  console.log('Deleted old duplicate listings:', delErr || 'OK');

  // 2. Fetch submission raw text & partner
  const { data: sub } = await supabase.from('submissions').select('*').eq('id', subId).single();
  if (!sub) return console.log('Sub not found');

  // 3. Extract with Gemini 2.5 Flash
  const response = await ai.models.generateContent({
    model: modelId,
    contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n--- TIN NHẮN TỪ ĐỐI TÁC ---\n' + sub.raw_text }] }],
    config: {
      responseMimeType: 'application/json',
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
                  required: ['vi', 'en', 'zh'],
                },
                landlord_commission_text: { type: Type.STRING, nullable: true },
                our_share_percent: { type: Type.NUMBER, nullable: true },
                our_share_text: { type: Type.STRING, nullable: true },
              },
              required: ['address_text', 'property_types', 'price_currency', 'price_period', 'price_basis', 'key_details'],
            },
          },
        },
        required: ['properties'],
      },
    },
  });

  const parsed = JSON.parse(response.text || '{}');
  const props = parsed.properties || [];
  console.log('Extracted', props.length, 'properties:');

  for (const p of props) {
    console.log(`- ${p.address_text} | ${p.province} | ${p.price_amount} ${p.price_currency}`);
    await supabase.from('property_listings').insert({
      submission_id: subId,
      partner_id: sub.partner_id,
      review_status: 'pending',
      address_text: p.address_text,
      house_number: p.house_number,
      street_name: p.street_name,
      ward: p.ward,
      district_legacy: p.district_legacy,
      province: p.province || 'Hà Nội',
      property_types: p.property_types || ['apartment'],
      floor_area_m2: p.floor_area_m2,
      total_lease_area_m2: p.total_lease_area_m2,
      price_amount: p.price_amount,
      price_currency: p.price_currency || 'VND',
      price_period: p.price_period || 'month',
      price_basis: p.price_basis || 'total',
      price_text: p.price_text,
      key_details: p.key_details,
      landlord_commission_text: p.landlord_commission_text,
      our_share_percent: p.our_share_percent,
      our_share_text: p.our_share_text,
      location_note: p.source_text_snippet || sub.raw_text,
      ai_extracted: p,
      needs_reply: false,
      change_history: [{ created_at: new Date().toISOString(), text: p.source_text_snippet || sub.raw_text }],
    });
  }

  // Also clean the dummy 'null' pending listing from previous test
  await supabase.from('property_listings').delete().eq('address_text', 'null').eq('review_status', 'pending');

  console.log('🎉 Done refreshing clean listings!');
}

cleanAndRefresh().catch(console.error);
