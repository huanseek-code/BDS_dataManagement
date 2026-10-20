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

3. QUY ĐỔI GIÁ TIỀN & ĐƠN VỊ:
   - "80 ạ", "80 tr", "80 triệu" -> price_amount: 80000000, price_currency: "VND", price_basis: "total", price_period: "month"
   - "16,5 triệu", "16.5tr" -> price_amount: 16500000, price_currency: "VND", price_basis: "total", price_period: "month"
   - "12 triệu" -> price_amount: 12000000, price_currency: "VND", price_basis: "total", price_period: "month"
   - "2000$", "2000 usd" -> price_amount: 2000, price_currency: "USD", price_basis: "total", price_period: "month"
   - "12 tỷ 5", "12.5 tỷ" -> price_amount: 12500000000, price_currency: "VND", price_basis: "total", price_period: "one_time"
   - "85000đ/m2", "85k/m2" -> price_amount: 85000, price_currency: "VND", price_basis: "per_m2", price_period: "month"
   - "4.5 USD/m2", "5$/m2" -> price_amount: 4.5, price_currency: "USD", price_basis: "per_m2", price_period: "month"
   - Luôn sao chép NGUYÊN VĂN chuỗi giá vào "price_text" (ví dụ: "85k/m2", "16,5 triệu", "2000$").
   - PHÂN BIỆT CƠ SỞ TÍNH GIÁ (price_basis):
     * Nhà ở, căn hộ, biệt thự, nhà phố: điền price_basis: "total".
     * Kho bãi, nhà xưởng, đất, văn phòng cho thuê theo mét vuông: BẮT BUỘC điền price_basis: "per_m2".

4. LOẠI HÌNH (property_types): Chọn từ danh sách: ["factory", "warehouse", "office", "retail", "townhouse", "villa", "apartment", "land", "hotel", "other"].
   - Nhà mặt phố / nhà nguyên căn -> ["townhouse"]
   - Chung cư / căn hộ / duplex / penthouse -> ["apartment"]
   - Kho / xưởng -> ["warehouse", "factory"]
   - Mặt bằng kinh doanh / văn phòng -> ["retail", "office"]

5. NGUYÊN TẮC BẢO TOÀN DỮ LIỆU GỐC & CẤM PHỎNG ĐOÁN BỪA (STRICT FIDELITY):
   - ĐIỀU KHOẢN HỢP ĐỒNG (lease_term_text):
     * Nếu tin nhắn ghi "hợp đồng 1 năm" hay "hđ 1 năm", ghi CHÍNH XÁC là "Hợp đồng 1 năm" (Contract: 1 year / 租期: 1年).
     * TUYỆT ĐỐI CẤM tự ý thêm chữ "tối thiểu", "ít nhất", "từ 1 năm trở lên" nếu tin nhắn gốc không có chữ "tối thiểu".
   - ĐỊA CHỈ & VỊ TRÍ (address_text):
     * Giữ nguyên văn các cụm từ địa danh trong tin nhắn gốc (ví dụ: "Ciputra L7, Tây Hồ", "ngõ 12 Vĩnh Hưng").
     * KHÔNG tự ý suy đoán thêm số nhà, tên ngõ hoặc phường xã nếu không được nhắc đến.
   - DIỆN TÍCH (floor_area_m2, total_lease_area_m2):
     * Giữ chính xác từng mét vuông số lẻ (ví dụ: 213m2 là 213, không được làm tròn thành 210 hay 215).

6. CHI TIẾT CHÍNH (key_details):
   - Tóm tắt trung thực kết cấu (số tầng, số phòng ngủ, thang máy, công năng...) có thật từ tin nhắn.
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

    return {
      decision: (parsed.decision === "CONTINUATION" || parsed.decision === "NEW_PROPERTY") ? parsed.decision : (hasContext ? "CONTINUATION" : "NEW_PROPERTY"),
      properties: parsed.properties || [],
      needs_reply: Boolean(parsed.needs_reply),
      reply_suggestion: parsed.reply_suggestion,
    };
  } catch (error: any) {
    console.error("AI extraction error:", error);
    throw error;
  }
}

