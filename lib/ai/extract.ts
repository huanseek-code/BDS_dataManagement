import "server-only";
import { Type } from "@google/genai";
import { executeWithKeyRotation } from "./key-manager";

export interface ExtractedProperty {
  source_text_snippet: string | null;
  address_text: string;
  house_number: string | null;
  street_name: string | null;
  ward: string | null;
  district_legacy: string | null;
  province: string | null;
  property_types: string[]; // factory, warehouse, office, retail, townhouse, villa, apartment, land, hotel, other
  floor_area_m2: number | null;
  total_lease_area_m2: number | null;
  price_amount: number | null;
  price_currency: string;
  price_period: string;
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
   - "80 ạ", "80 tr", "80 triệu" -> price_amount: 80000000, price_currency: "VND", price_basis: "total", price_period: "month"
   - "50 triệu/tháng", "50tr", "chủ chốt 50tr", "thuê 50 củ" -> price_amount: 50000000, price_currency: "VND", price_basis: "total", price_period: "month"
   - "16,5 triệu", "16.5tr" -> price_amount: 16500000, price_currency: "VND", price_basis: "total", price_period: "month"
   - "18 triệu/tháng", "18tr" -> price_amount: 18000000, price_currency: "VND", price_basis: "total", price_period: "month"
   - "200 tr/ tháng", "200 triệu" -> price_amount: 200000000, price_currency: "VND", price_basis: "total", price_period: "month"
   - "39 triệu" -> price_amount: 39000000, price_currency: "VND", price_basis: "total", price_period: "month"
   - "2000$", "2000 usd" -> price_amount: 2000, price_currency: "USD", price_basis: "total", price_period: "month"
   - "12 tỷ 5", "12.5 tỷ" -> price_amount: 12500000000, price_currency: "VND", price_basis: "total", price_period: "one_time"
   - "85000đ/m2", "85k/m2" -> price_amount: 85000, price_currency: "VND", price_basis: "per_m2", price_period: "month"
   - "4.5 USD/m2", "5$/m2" -> price_amount: 4.5, price_currency: "USD", price_basis: "per_m2", price_period: "month"
   - Luôn sao chép NGUYÊN VĂN chuỗi giá vào "price_text" (ví dụ: "85k/m2", "50 triệu/tháng", "2000$", "200 tr/ tháng", "18 triệu/tháng").
   - QUÉT TOÀN BỘ CHUỖI TIN NHẮN: Quét kỹ các tin nhắn trao đổi tiếp nối để tìm giá tiền, TUYỆT ĐỐI KHÔNG để price_amount: null nếu trong văn bản có bất kỳ mức giá nào được nhắc đến.
   - PHÂN BIỆT CƠ SỞ TÍNH GIÁ (price_basis):
     * Nhà ở, căn hộ, biệt thự, nhà phố: điền price_basis: "total".
     * Kho bãi, nhà xưởng, đất, văn phòng cho thuê theo mét vuông: BẮT BUỘC điền price_basis: "per_m2".

4. LOẠI HÌNH (property_types): Chọn từ danh sách: ["factory", "warehouse", "office", "retail", "townhouse", "villa", "apartment", "land", "hotel", "other"].
   - Nhà mặt phố / nhà nguyên căn -> ["townhouse"]
   - Chung cư / căn hộ / duplex / penthouse -> ["apartment"]
   - Kho / xưởng -> ["warehouse", "factory"]
   - Mặt bằng kinh doanh / văn phòng -> ["retail", "office"]
   - BẮT BUỘC phải gán ít nhất 1 loại hình phù hợp, TUYỆT ĐỐI KHÔNG để mảng rỗng [].

5. NGUYÊN TẮC BẢO TOÀN DỮ LIỆU GỐC, KHÔNG GIAN HÌNH HỌC & TỪ ĐIỂN CHUẨN (STRICT FIDELITY & GLOSSARY):
   - DIỆN TÍCH ĐA TẦNG (floor_area_m2 vs total_lease_area_m2):
     * KHI GẶP: "tổng diện tích", "tổng DT", "diện tích sử dụng", "tổng sàn" hoặc tòa nhà nhiều tầng (ví dụ: 180m2 x 8 tầng, Tổng diện tích 150m², Tầng 1: 26m², Tầng 2-4: 40m²/sàn):
       -> BẮT BUỘC ghi tổng diện tích vào "total_lease_area_m2" (ví dụ: 180 * 8 = 1440, hoặc 150).
       -> "floor_area_m2" BẮT BUỘC LẤY diện tích 1 sàn (ví dụ: 180m2 x 8 tầng -> floor_area_m2: 180, total_lease_area_m2: 1440).
       -> TUYỆT ĐỐI CẤM để trống floor_area_m2 nếu đã có thông số diện tích 1 tầng!
       -> RÀNG BUỘC HÌNH HỌC: Với nhà nhiều tầng, floor_area_m2 không bao giờ được lớn hơn total_lease_area_m2.
     * Giữ chính xác từng mét vuông số lẻ (ví dụ: 213m2 là 213, không được làm tròn thành 210 hay 215).

   - BỘ HIỆN TRẠNG BÀN GIAO (handover_condition - BẮT BUỘC CHỌN 1 TRONG 4 MÃ ENUM):
     * "fully_furnished": Đầy đủ nội thất, full đồ, full nội thất, full option
     * "partially_furnished": Nội thất cơ bản, đồ liền tường, đã có bếp/điều hòa
     * "basic_unfurnished": Hoàn thiện cơ bản, không đồ, nhà trống, chưa có nội thất
     * "bare_shell": Bàn giao thô, nhà thô, chưa hoàn thiện trần sàn đèn
     TUYỆT ĐỐI KHÔNG trả về chuỗi tiếng Việt như "Full nội thất" vào trường handover_condition, BẮT BUỘC dùng đúng 4 mã enum trên!

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
    const promptUserText = hasContext
      ? `${systemPrompt}

--- HỒ SƠ BĐS ĐANG CHỜ DUYỆT TRƯỚC ĐÓ CỦA ĐỐI TÁC NÀY ---
${existingContext}

--- TIN NHẮN MỚI VỪA GỬI ---
${rawText}`
      : `${systemPrompt}

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
                    handover_condition: {
                      type: Type.STRING,
                      nullable: true,
                      enum: ["bare_shell", "basic_unfurnished", "partially_furnished", "fully_furnished"],
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
  const text = `${prop.source_text_snippet || ""} ${fullText} ${prop.key_details?.vi || ""}`;

  // 1. Chuẩn hóa handover_condition
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
    // Tự động suy luận từ văn bản nếu AI bỏ trống
    if (/full\s*(?:nội\s*thất|đồ)/i.test(text)) {
      prop.handover_condition = "fully_furnished";
    } else if (/bàn\s*giao\s*thô|nhà\s*thô/i.test(text)) {
      prop.handover_condition = "bare_shell";
    } else if (/không\s*đồ|nhà\s*trống|chưa\s*có\s*nội\s*thất/i.test(text)) {
      prop.handover_condition = "basic_unfurnished";
    }
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
        prop.price_period = prop.price_period || "month";
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
  }

  // 3. Fallback diện tích đa tầng: "180m2 x 8 tầng", "180 m2 * 8 tầng", "180m x 8 tầng"
  if (!prop.floor_area_m2) {
    const multiFloorMatch = text.match(/(\d+(?:[.,]\d+)?)\s*m2?\s*[x*]\s*(\d+)\s*tầng/i);
    if (multiFloorMatch) {
      const perFloor = parseFloat(multiFloorMatch[1].replace(",", "."));
      const floors = parseInt(multiFloorMatch[2], 10);
      prop.floor_area_m2 = perFloor;
      if (!prop.total_lease_area_m2) {
        prop.total_lease_area_m2 = Math.round(perFloor * floors);
      }
    }
  }

  // 4. Bảo tồn điều kiện cấm "không làm hàng ăn"
  const foodBanMatch = text.match(/không\s*(?:làm\s*)?(?:hàng\s*ăn|ăn\s*uống|kinh\s*doanh\s*ăn\s*uống|quán\s*ăn)/i);
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
