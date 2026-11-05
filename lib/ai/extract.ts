import "server-only";
import { Type } from "@google/genai";
import { executeWithKeyRotation } from "./key-manager";
import {
  getGoldenSamplesForPrompt,
  verifyVerbatimSpan,
  detectPricePeriod,
  extractMultiFloorAreas,
  auditAndVerifyExtractedProperty,
} from "./golden-samples";

export interface ExtractedProperty {
  source_text_snippet: string | null;
  address_text: string;
  house_number: string | null;
  street_name: string | null;
  ward: string | null;
  district_legacy: string | null;
  province: string | null;
  property_types: string[]; // factory, warehouse, office, retail, townhouse, villa, apartment, land, hotel, other
  floor_area_m2: string | number | null;
  total_lease_area_m2: number | null;
  price_amount: number | null;
  price_currency: string;
  price_period: string | null;
  price_basis: string;
  price_text: string | null;
  lease_term_text?: string | null;
  key_details: {
    vi: string;
    en: string;
    zh: string;
  };
  landlord_commission_text: string | null;
  our_share_percent: number | null;
  our_share_text: string | null;
  handover_condition?: string | null;
  furniture_status?: string | null;
  furniture_list?: string | null;
  rental_options?: {
    name: string;
    rentable_area_m2?: number | null;
    price_amount?: number | null;
    price_currency?: string;
    price_basis?: string;
    price_period?: string;
    management_fee_text?: string | null;
    electricity_text?: string | null;
    water_text?: string | null;
    note?: string | null;
  }[];
}

export interface ExtractionResult {
  decision?: "CONTINUATION" | "NEW_PROPERTY";
  properties: ExtractedProperty[];
  needs_reply: boolean;
  reply_suggestion?: string;
}

export async function extractPropertiesFromChat(
  rawText: string,
  imageUrls: string[] = [],
  existingContext?: string | null
): Promise<ExtractionResult> {
  const hasContext = Boolean(existingContext && existingContext.trim().length > 0);

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

3. QUY ĐỔI GIÁ TIỀN & ĐƠN VỊ (QUÉT XUYÊN SUỐT HỘI THOẠI):
   - "80 ạ", "80 tr", "80 triệu" -> price_amount: 80000000, price_currency: "VND", price_basis: "Tổng căn", price_period: null (không có chữ /tháng)
   - "50 triệu/tháng" -> price_amount: 50000000, price_currency: "VND", price_basis: "Tổng căn", price_period: "Theo tháng" (vì có rõ chữ /tháng)
   - "50tr", "chủ chốt 50tr", "thuê 50 củ" -> price_amount: 50000000, price_currency: "VND", price_basis: "Tổng căn", price_period: null (không có chữ /tháng)
   - "16,5 triệu", "16.5tr" -> price_amount: 16500000, price_currency: "VND", price_basis: "Tổng căn", price_period: null
   - "18 triệu/tháng" -> price_amount: 18000000, price_currency: "VND", price_basis: "Tổng căn", price_period: "Theo tháng" (vì có rõ chữ /tháng)
   - "200 tr/ tháng" -> price_amount: 200000000, price_currency: "VND", price_basis: "Tổng căn", price_period: "Theo tháng" (vì có rõ chữ / tháng)
   - "39 triệu", "55tr" -> price_amount: 55000000, price_currency: "VND", price_basis: "Tổng căn", price_period: null (không có chữ /tháng)
   - "2000$", "2000 usd" -> price_amount: 2000, price_currency: "USD", price_basis: "Tổng căn", price_period: null
   - "12 tỷ 5", "12.5 tỷ" -> price_amount: 12500000000, price_currency: "VND", price_basis: "Tổng căn", price_period: "Một lần"
   - "85000đ/m2/tháng" -> price_amount: 85000, price_currency: "VND", price_basis: "Theo m²", price_period: "Theo tháng"
   - "85000đ/m2", "85k/m2" -> price_amount: 85000, price_currency: "VND", price_basis: "Theo m²", price_period: null
   - KỲ HẠN GIÁ (price_period): CHỈ ĐIỀN "Theo tháng" hoặc "Theo năm" KHI TIN NHẮN CÓ CHỮ RÕ RÀNG (như "/tháng", "tr/tháng", "triệu/tháng", "theo tháng", "1 tháng", "/năm", "theo năm"). NẾU KHÔNG CÓ THÌ BẮT BUỘC ĐỂ NULL, TUYỆT ĐỐI KHÔNG TỰ DỊCH NGHĨA SANG "Theo tháng"!
   - Luôn sao chép NGUYÊN VĂN chuỗi giá vào "price_text" (ví dụ: "85k/m2", "50 triệu/tháng", "2000$", "200 tr/ tháng", "55tr").
   - QUÉT TOÀN BỘ CHUỖI TIN NHẮN: Quét kỹ các tin nhắn trao đổi tiếp nối để tìm giá tiền, TUYỆT ĐỐI KHÔNG để price_amount: null nếu trong văn bản có bất kỳ mức giá nào được nhắc đến.
   - PHÂN BIỆT CƠ SỞ TÍNH GIÁ (price_basis):
     * KHI GIÁ TÍNH THEO MÉT VUÔNG (ví dụ: "150K / m2", "150k/m2", "85000đ/m2", "100k/m2/tháng", "12$/m2", "giá theo m2", "đơn giá /m2"): BẮT BUỘC ĐIỀN price_basis: "Theo m²".
     * KHI GIÁ TÍNH TRỌN CĂN / TỔNG DIỆN TÍCH (ví dụ: "50 triệu/tháng", "16tr", "200 tr/ tháng", "18tr"): BẮT BUỘC ĐIỀN price_basis: "Tổng căn".
     * Kho bãi, nhà xưởng, đất, văn phòng cho thuê báo giá theo m2: BẮT BUỘC điền price_basis: "Theo m²".

4. LOẠI HÌNH BĐS (property_types) - GIỮ NGUYÊN BẢN TIẾNG VIỆT:
   - Trích xuất NGUYÊN MẪU cụm từ chỉ loại hình BĐS có trong tin nhắn dưới dạng tiếng Việt (ví dụ: ["Nhà liền kề"], ["Nhà mặt phố"], ["Căn hộ chung cư"], ["Biệt thự"], ["Kho xưởng"], ["Văn phòng"], ["Mặt bằng kinh doanh"]...).
   - TUYỆT ĐỐI KHÔNG DỊCH sang tiếng Anh (không dùng "townhouse", "apartment", "villa"...).
   - BẮT BUỘC phải gán ít nhất 1 loại hình phù hợp, TUYỆT ĐỐI KHÔNG để mảng rỗng [].

5. NGUYÊN TẮC BẢO TOÀN DỮ LIỆU GỐC, KHÔNG GIAN HÌNH HỌC & TỪ ĐIỂN CHUẨN (STRICT FIDELITY & GLOSSARY):
   - TỔNG DIỆN TÍCH (total_lease_area_m2) & DIỆN TÍCH MỖI TẦNG (floor_area_m2):
     * CÁC DẠNG CÔNG THỨC NHIỀU TẦNG PHỔ BIẾN:
       - Dạng 'A m2 x B tầng' (hoặc 'A m² x B t', 'A mét x B tầng', 'A m x B tầng'):
         * Con số A đứng trước dấu nhân luôn là DIỆN TÍCH 1 SÀN / DIỆN TÍCH MỖI TẦNG -> BẮT BUỘC ĐIỀN floor_area_m2: "A" (ví dụ: '50m² × 5 tầng' -> floor_area_m2: "50"; '120m² × 5 tầng' -> floor_area_m2: "120"; '70m2 x 8 tầng' -> floor_area_m2: "70"; '60m2 x 8 tầng' -> floor_area_m2: "60"; '40m² × 7 tầng' -> floor_area_m2: "40").
         * Tổng diện tích cho thuê total_lease_area_m2 = A * B (ví dụ: 50 * 5 = 250; 120 * 5 = 600; 70 * 8 = 560; 60 * 8 = 480).
       - Dạng có diện tích xây dựng riêng (ví dụ '190m² x 4 tầng (XD: 100m)'):
         * floor_area_m2: "100" (diện tích xây dựng 1 sàn).
         * total_lease_area_m2: 100 * 4 = 400.
       - Dạng diện tích đất biệt thự có sân vườn (ví dụ 'Diện tích đất: 250m² x 5 Tầng'):
         * floor_area_m2: "250".
         * total_lease_area_m2: 250 (ghi nhận diện tích khuôn viên, TUYỆT ĐỐI KHÔNG nhân máy móc 250 x 5 = 1250).
       - Dạng các tầng có diện tích khác nhau (ví dụ 'Tầng 1: 50m, Tầng 2: 70m, Tầng 3: 80m'):
         * floor_area_m2: "50, 70, 80".
         * total_lease_area_m2: 50 + 70 + 80 = 200.
       - Dạng nhà 1 tầng, căn hộ chung cư, kho bãi, mặt bằng đơn (ví dụ 'kho xưởng 800m2', 'căn hộ 65m2', 'mặt bằng 80m'):
         * total_lease_area_m2: số diện tích chung.
         * floor_area_m2: để null vì là mặt phẳng đơn không chia tầng.
     * Giữ chính xác từng mét vuông số lẻ (ví dụ: 213m2 là 213, không được làm tròn thành 210 hay 215).

   - NỘI THẤT & DANH SÁCH MÓN ĐỒ (VERBATIM SPAN EXTRACTION - TRÍCH NGUYÊN GỐC TỪNG CHỮ):
     * "furniture_status": CẮT ĐÚNG TỪ/CỤM TỪ NGUYÊN GỐC trong tin nhắn thể hiện hiện trạng nội thất (ví dụ: "đủ đồ", "full đồ", "đồ cơ bản", "full gỗ", "nhà trống", "bàn giao thô", "nguyên bản cđt"...).
       - TUYỆT ĐỐI KHÔNG TỰ QUY ĐỔI (ví dụ: tin ghi "đủ đồ" thì trích đúng "đủ đồ", CẤM đổi thành "đầy đủ nội thất").
       - NẾU TIN KHÔNG CÓ CỤM TỪ NÀO CHỈ HIỆN TRẠNG (ví dụ: chỉ liệt kê món đồ "Dh, nl, giường, bếp" hoặc không nhắc gì): BẮT BUỘC ĐỂ NULL, TUYỆT ĐỐI KHÔNG TỰ ĐẶT TỪ "chưa rõ" VÀO ĐÂY!
     * "furniture_list": Trích xuất NGUYÊN MẪU danh sách các món đồ được liệt kê trong tin nhắn (ví dụ: "Dh, nl, giường, bếp", "Dh âm trần, nl, THANG MÁY", "có bếp rèm", "6 điều hoà, 6 nóng lạnh, tủ bếp").
       - Nguồn nói rõ không có món nào thì ghi rõ đúng câu chữ đó (ví dụ: "riêng tủ lạnh chưa có", "chưa có giường").
       - Nếu tin nhắn không liệt kê món đồ nào thì để null hoặc "".

   - QUY TẮC BẢO LƯU ĐIỀU KIỆN CẤM & NGÀNH NGHỀ HẠN CHẾ (NEGATIVE CONSTRAINTS):
     * Nếu tin nhắn có ghi chú hạn chế / ngành cấm của chủ nhà như:
       'không làm hàng ăn', 'không ăn uống', 'không nấu nướng', 'không làm spa', 'không ở lại', 'không làm căn hộ dịch vụ', 'không cho thuê hàng ăn', 'cấm kinh doanh ăn uống'...
     * BẮT BUỘC PHẢI GIỮ NGUYÊN ĐIỀU KIỆN NÀY trong tóm tắt 'key_details' ở cả 3 thứ tiếng:
       - vi: '... (chủ nhà không cho làm hàng ăn / kinh doanh ăn uống)'
       - en: '... (no food & beverage / restaurant businesses allowed)'
       - zh: '... (房东禁止餐饮业)'
     * TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ Ý LƯỢC BỎ CÁC RÀNG BUỘC PHÁP LÝ NÀY!

   - BỘ TỪ ĐIỂN HIỆN TRẠNG BÀN GIAO & RÀNG BUỘC DỊCH THUẬT:
     * "không đồ", "nhà trống", "chưa đồ", "chưa có nội thất":
       - vi: "Hoàn thiện cơ bản, không đồ (chưa có nội thất rời)"
       - zh: "简装空房 (无家具)"
       - en: "Basic finish, unfurnished (no loose furniture)"
       - CẤM TUYỆT ĐỐI DỊCH THÀNH "bàn giao thô" HOẶC "毛坯" HOẶC "bare shell" (vì nhà đã xong sàn trần đèn vệ sinh).
     * "bàn giao thô":
       - vi: "Bàn giao thô" | zh: "毛坯交付" | en: "Bare shell"
     * "đầy đủ đồ", "full đồ", "full nội thất":
       - vi: "Đầy đủ nội thất" | zh: "全配精装" | en: "Fully furnished"
     * "hợp đồng 1 năm", "hđ 1 năm":
       - vi: "Hợp đồng 1 năm" | zh: "租期 1 年" | en: "1-year contract"
       - TUYỆT ĐỐI CẤM tự ý thêm chữ "tối thiểu", "ít nhất", "至少", "minimum".

   - ĐỊA CHỈ & VỊ TRÍ (address_text):
     * Giữ nguyên văn các cụm từ địa danh trong tin nhắn gốc (ví dụ: "Ciputra L7, Tây Hồ", "ngõ 12 Vĩnh Hưng").
     * KHÔNG tự ý suy đoán thêm số nhà, tên ngõ hoặc phường xã nếu không được nhắc đến.

6. CHI TIẾT CHÍNH (key_details):
   - Tóm tắt trung thực kết cấu (số tầng, số phòng ngủ, thang máy, công năng...) có thật từ tin nhắn.
   - BẢO TOÀN ĐẦY ĐỦ các ngành nghề phù hợp và các điều kiện cấm (ví dụ: không làm hàng ăn).
   - TUYỆT ĐỐI KHÔNG tự ý thêm các điều khoản mặc định (như cọc 1 thanh toán 3 hay hợp đồng tối thiểu) nếu tin nhắn không nói tới.
   - Tự động viết bằng 3 ngôn ngữ chuẩn chỉnh: vi (Tiếng Việt), en (English), zh (中文).

7. CHU KỲ GIÁ (price_period): Chỉ chọn "month", "year", hoặc "one_time".

${
  hasContext
    ? `
8. PHÁN ĐOÁN NGỮ NGHĨA KHI CÓ HỒ SƠ ĐANG CHỜ DUYỆT TRƯỚC ĐÓ:
   - Trường "decision":
     + Điền "CONTINUATION" KHI VÀ CHỈ KHI: Tin nhắn mới là câu nói tiếp / bổ sung / đính chính thông tin (giá tiền, diện tích, hoa hồng, ảnh chụp, liên hệ, hoặc giảm giá: "chủ bớt còn 11tr") cho CĂN BĐS ĐANG ĐƯỢC NÓI TỚI ở tin trước. HỢP NHẤT TOÀN BỘ thông tin cũ và mới lại thành 1 căn DUY NHẤT hoàn chỉnh.
     + Điền "NEW_PROPERTY" KHI:
       * Tin nhắn mới có các từ khóa chuyển tiếp mở căn mới: "hoặc", "mình có thêm", "căn nữa", "căn khác", "ngoài ra bên em còn...", "căn 2..."
       * Hoặc nhắc đến một địa chỉ / tên tòa nhà / vị trí hoàn toàn khác biệt với căn đang chờ duyệt trước đó.
`
    : `
8. Trường "decision": Mặc định điền "NEW_PROPERTY".
`
}
`;

  try {
    const goldenSamplesText = await getGoldenSamplesForPrompt();
    const fullSystemPrompt = `${systemPrompt}\n\n${goldenSamplesText}`;

    const promptUserText = hasContext
      ? `${fullSystemPrompt}

--- HỒ SƠ BĐS ĐANG CHỜ DUYỆT TRƯỚC ĐÓ CỦA ĐỐI TÁC NÀY ---
${existingContext}

--- TIN NHẮN MỚI VỪA GỬI ---
${rawText}`
      : `${fullSystemPrompt}

--- NỘI DUNG TIN NHẮN TỪ ĐỐI TÁC ---
${rawText}`;

    const contents: any[] = [
      {
        role: "user",
        parts: [
          {
            text: promptUserText,
          },
        ],
      },
    ];

    const parsed = await executeWithKeyRotation(async (ai, apiKey, modelId) => {
      const response = await ai.models.generateContent({
        model: modelId,
        contents,
        config: {
          temperature: 0.0,
          topP: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              decision: {
                type: Type.STRING,
                description: "CONTINUATION (bổ sung cho căn trước) hoặc NEW_PROPERTY (căn BĐS mới)",
              },
              properties: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    source_text_snippet: {
                      type: Type.STRING,
                      description: "Đoạn tin nhắn gốc nguyên văn của riêng căn BĐS này",
                    },
                    reasoning: {
                      type: Type.STRING,
                      nullable: true,
                      description: "Giải thích ngắn gọn trước khi bóc tách: căn này có nói diện tích từng tầng không, giá tính trọn căn hay theo m2, các trường nào thiếu để null.",
                    },
                    price_evidence: {
                      type: Type.STRING,
                      nullable: true,
                      description: "Chuỗi ký tự nguyên bản thể hiện giá tiền trong tin nhắn (ví dụ: '150K / m2', '60tr/ tháng')",
                    },
                    floor_area_evidence: {
                      type: Type.STRING,
                      nullable: true,
                      description: "Chuỗi ký tự nguyên bản thể hiện số tầng / diện tích từng tầng (ví dụ: '60m x 4 tầng', 'mỗi sàn 100m'). Nếu không có nhắc đến tầng thì bắt buộc null.",
                    },
                    furniture_evidence: {
                      type: Type.STRING,
                      nullable: true,
                      description: "Chuỗi ký tự nguyên bản thể hiện đồ đạc/hiện trạng nội thất",
                    },
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
                    floor_area_m2: {
                      type: Type.STRING,
                      nullable: true,
                      description: "Diện tích mỗi tầng. CHỈ ĐIỀN KHI TIN NHẮN CÓ NÓI RÕ DIỆN TÍCH TỪNG TẦNG. Nếu tin nhắn chỉ nói tổng diện tích chung: BẮT BUỘC ĐỂ NULL.",
                    },
                    total_lease_area_m2: { type: Type.NUMBER, nullable: true },
                    price_amount: { type: Type.NUMBER, nullable: true },
                    price_currency: {
                      type: Type.STRING,
                      enum: ["VND", "USD"],
                    },
                    price_period: {
                      type: Type.STRING,
                      nullable: true,
                      description: "Chỉ ghi 'Theo tháng', 'Theo năm', hoặc 'Một lần' nếu tin nhắn có từ ngữ nêu rõ kỳ hạn. Nếu không có chữ theo tháng/năm thì bắt buộc để null.",
                    },
                    price_basis: {
                      type: Type.STRING,
                      enum: ["total", "per_m2"],
                    },
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
                    handover_condition: {
                      type: Type.STRING,
                      nullable: true,
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
                    rental_options: {
                      type: Type.ARRAY,
                      nullable: true,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          rentable_area_m2: { type: Type.NUMBER, nullable: true },
                          price_amount: { type: Type.NUMBER, nullable: true },
                          price_currency: { type: Type.STRING, nullable: true },
                          price_basis: { type: Type.STRING, nullable: true },
                          price_period: { type: Type.STRING, nullable: true },
                          management_fee_text: { type: Type.STRING, nullable: true },
                          electricity_text: { type: Type.STRING, nullable: true },
                          water_text: { type: Type.STRING, nullable: true },
                          note: { type: Type.STRING, nullable: true },
                        },
                        required: ["name"],
                      },
                    },
                  },
                  required: [
                    "address_text",
                    "property_types",
                    "price_currency",
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

      if (!response || !response.text) {
        throw new Error("Phản hồi từ Gemini API rỗng.");
      }

      return JSON.parse(response.text);
    });

    const rawProps = parsed.properties || [];
    const postProcessed = rawProps.map((p: ExtractedProperty) => postProcessListing(p, rawText));

    return {
      decision: (parsed.decision === "CONTINUATION" || parsed.decision === "NEW_PROPERTY") ? parsed.decision : (hasContext ? "CONTINUATION" : "NEW_PROPERTY"),
      properties: postProcessed,
      needs_reply: Boolean(parsed.needs_reply),
      reply_suggestion: parsed.reply_suggestion,
    };
  } catch (error: any) {
    console.error("AI extraction error:", error);
    throw error;
  }
}

/**
 * Lớp bảo vệ hậu xử lý tất định (Deterministic Fallback)
 * Ngăn chặn tuyệt đối tình trạng Gemini bỏ sót giá, bỏ sót diện tích hoặc quên điều kiện cấm.
 */
function postProcessListing(prop: ExtractedProperty, fullText: string): ExtractedProperty {
  const text = `${prop.source_text_snippet || ""} ${fullText || ""}`;

  // 1. Kiểm toán logic độc lập & xác minh bằng chứng (Grounding Auditor)
  const { prop: auditedProp, audit } = auditAndVerifyExtractedProperty(prop, text);
  prop = auditedProp;

  if (prop.key_details) {
    (prop.key_details as any).grounding_audit = audit;
  }

  // 2. Fallback giá tiền nếu price_amount bị null/0 mà trong văn bản có giá
  if (!prop.price_amount || prop.price_amount <= 0) {
    const priceMatch = text.match(/(?:giá(?: thuê)?|chào)?\s*[:\s]*(\d+(?:[.,]\d+)?)\s*(tr(?:iệu)?|củ|tỷ|k|usd|\$)/i);
    if (priceMatch) {
      const num = parseFloat(priceMatch[1].replace(",", "."));
      const unit = priceMatch[2].toLowerCase();
      if (unit.startsWith("tr") || unit === "củ") {
        prop.price_amount = Math.round(num * 1000000);
        prop.price_currency = "VND";
        prop.price_basis = prop.price_basis || "total";
        if (!prop.price_text) prop.price_text = `${priceMatch[1]} triệu`;
      } else if (unit === "tỷ") {
        prop.price_amount = Math.round(num * 1000000000);
        prop.price_currency = "VND";
        if (!prop.price_text) prop.price_text = `${priceMatch[1]} tỷ`;
      } else if (unit === "usd" || unit === "$") {
        prop.price_amount = num;
        prop.price_currency = "USD";
        if (!prop.price_text) prop.price_text = `${priceMatch[1]} USD`;
      }
    }
  } else if (prop.price_amount > 0 && prop.price_amount < 1000 && prop.price_currency !== "USD") {
    prop.price_amount = Math.round(prop.price_amount * 1000000);
  }

  // 3. Fallback diện tích đa tầng & diện tích từng tầng
  const multiFloorAreas = extractMultiFloorAreas(text);
  if (multiFloorAreas) {
    prop.floor_area_m2 = multiFloorAreas.floorAreaStr;
    if (!prop.total_lease_area_m2 || prop.total_lease_area_m2 <= 0) {
      prop.total_lease_area_m2 = multiFloorAreas.totalArea;
    }
  }

  // 4. Kỳ hạn giá chuẩn xác
  const detectedPeriod = detectPricePeriod(prop.price_text, prop.source_text_snippet || text);
  if (detectedPeriod) {
    prop.price_period = detectedPeriod;
  } else {
    prop.price_period = null;
  }

  // 5. Chuẩn hóa tiếng Việt cho Loại hình BĐS
  const TYPE_MAP: Record<string, string> = {
    townhouse: "Nhà phố",
    apartment: "Chung cư",
    villa: "Biệt thự",
    warehouse: "Kho bãi",
    factory: "Nhà xưởng",
    office: "Văn phòng",
    retail: "Mặt bằng",
    land: "Đất",
    hotel: "Khách sạn",
  };
  if (Array.isArray(prop.property_types)) {
    prop.property_types = prop.property_types.map((t: string) => TYPE_MAP[t] || t);
  } else if (typeof prop.property_types === "string") {
    prop.property_types = [TYPE_MAP[prop.property_types] || prop.property_types];
  }

  return prop;
}
