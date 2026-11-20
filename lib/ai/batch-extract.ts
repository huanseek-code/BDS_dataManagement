import "server-only";
import { Type } from "@google/genai";
import { executeWithKeyRotation } from "./key-manager";
import { ExtractedProperty } from "./extract";
import {
  getGoldenSamplesForPrompt,
  verifyVerbatimSpan,
  detectPricePeriod,
  extractMultiFloorAreas,
  auditAndVerifyExtractedProperty,
  extractPriceFallback,
  extractFurnitureFallback,
  extractLeaseTermFallback,
  extractCommissionFallback,
  extractSuitableFor,
  extractSpecialStructureNotes,
  enrichKeyDetailsWithStructureAndSuitability,
  normalizeVietnamesePropertyTypes,
} from "./golden-samples";

export { extractFurnitureFallback };

export interface BatchTimelineItem {
  msg_id: string;
  time: number;
  sent_time: string;
  type: "text" | "photo";
  text?: string;
  photo_url?: string;
}

export interface BatchExtractionResult {
  properties: ExtractedProperty[];
  summary_note?: string;
}

/**
 * Bóc tách Đa căn BĐS thuần Văn bản theo Dòng thời gian hội thoại
 * Ưu tiên độ chính xác tuyệt đối: Chỉ lấy thông số có trong tin nhắn, thiếu trường để null.
 */
export async function extractBatchPropertiesFromTimeline(
  timeline: BatchTimelineItem[]
): Promise<BatchExtractionResult> {
  // Chỉ lấy các tin nhắn dạng text có nội dung thực tế
  const textItems = (timeline || []).filter(
    (t) => t.type === "text" && t.text && t.text.trim().length > 0
  );

  if (textItems.length === 0) {
    return { properties: [] };
  }

  // Khử trùng lặp các tin nhắn text giống hệt nhau gửi liền kề
  const seenTexts = new Set<string>();
  const uniqueTextItems: BatchTimelineItem[] = [];
  for (const item of textItems) {
    const normalized = (item.text || "").trim().toLowerCase();
    if (!seenTexts.has(normalized)) {
      seenTexts.add(normalized);
      uniqueTextItems.push(item);
    }
  }

  // Xây dựng transcript văn bản dòng thời gian sạch cho Gemini
  let transcript = "--- DÒNG THỜI GIAN TIN NHẮN TỪ ĐỐI TÁC (TỪ CŨ ĐẾN MỚI) ---\n";
  uniqueTextItems.forEach((item, index) => {
    transcript += `[Tin nhắn ${index + 1} | ${item.sent_time || "Vừa gửi"}] (ID: ${item.msg_id}):\n${(item.text || "").trim()}\n\n`;
  });

  const goldenSamplesText = await getGoldenSamplesForPrompt();

  const systemPrompt = `
Bạn là chuyên gia thẩm định và bóc tách dữ liệu Bất động sản (BĐS) hàng đầu cho Huanseek.
Nhiệm vụ của bạn là đọc DÒNG THỜI GIAN CÁC TIN NHẮN VĂN BẢN từ đối tác môi giới, nhận diện chính xác có MỘT hay NHIỀU căn BĐS độc lập và trích xuất thành danh sách chuẩn hóa thuần text.

NGUYÊN TẮC CỐT LÕI - BÓC TÁCH NGUYÊN GỐC CHỮ TRONG TIN NHẮN (STRICT VERBATIM FIDELITY):

1. BÓC TÁCH TOÀN BỘ CÁC THÔNG SỐ CÓ THỰC TRONG TIN NHẮN:
   - Trích xuất đầy đủ và triệt để mọi thông tin có trong văn bản: địa chỉ, loại hình, diện tích sàn, tổng diện tích, số tầng, mặt tiền, kết cấu phòng/vệ sinh, đồ đạc nội thất, giá thuê/bán, điều kiện thanh toán/cọc, thời hạn hợp đồng, hoa hồng chủ nhà trả, hoa hồng bên mình nhận, công năng phù hợp, ngành nghề cấm/hạn chế, số điện thoại liên hệ...
   - CHỈ TRÍCH XUẤT THÔNG TIN THỰC SỰ CÓ TRONG TIN NHẮN. NẾU THIẾU TRƯỜNG DỮ LIỆU CŨNG KHÔNG SAO: Nếu tin nhắn không nói rõ quận, phường, số nhà, thời hạn thuê, hoa hồng... -> BẮT BUỘC ĐỂ NULL HOẶC ĐỂ TRỐNG.
   - TUYỆT ĐỐI KHÔNG TỰ BỊA RA, KHÔNG SUY ĐOÁN những thông tin không có trong văn bản!

2. PHÂN TÁCH ĐA CĂN BĐS (MULTI-PROPERTY SEPARATION) & DANH SÁCH GẠCH ĐẦU DÒNG:
   - Khi đối tác gửi danh sách gồm nhiều dòng gạch đầu dòng '-' hoặc bullet point (ví dụ danh sách các căn Studio, 1N, 2N, 3N): BẮT BUỘC BÓC TÁCH TỪNG DÒNG THÀNH TỪNG CĂN ĐỘC LẬP trong mảng "properties", TUYỆT ĐỐI KHÔNG ĐƯỢC BỎ SÓT BẤT KỲ CĂN NÀO!
   - LOẠI TRỪ TIN TÌM CĂN / NHU CẦU CỦA KHÁCH: Nếu tin nhắn thể hiện nhu cầu tìm thuê (ví dụ: "E tìm 1n/1n+ cho khách thuê", "khách e chiều 2h đi xem tìm 1pn+..."), đây là tin tìm căn của khách, KHÔNG PHẢI NGUỒN CĂN CHO THUÊ -> BỎ QUA, không đưa vào danh sách properties.
   - "source_text_snippet": BẮT BUỘC trích nguyên văn đoạn văn bản mô tả riêng của chính căn đó để người duyệt đối chiếu.

3. LOẠI HÌNH BĐS (property_types) - GIỮ NGUYÊN BẢN TIẾNG VIỆT:
   - Trích xuất NGUYÊN MẪU cụm từ chỉ loại hình BĐS có trong tin nhắn dưới dạng tiếng Việt (ví dụ: ["Nhà liền kề"], ["Nhà mặt phố"], ["Căn hộ chung cư"], ["Biệt thự"], ["Kho xưởng"], ["Văn phòng"], ["Mặt bằng kinh doanh"], ["Căn hộ dịch vụ"], ["Căn hộ Studio"], ["Căn hộ Duplex"], ["Nhà phân lô"], ["Nhà tập thể"]...).
   - Bảng quy đổi viết tắt loại hình Tiếng Việt: "CHCC" -> "Căn hộ chung cư"; "CHDV" -> "Căn hộ dịch vụ"; "MBKD" -> "Mặt bằng kinh doanh"; "LK" -> "Nhà liền kề"; "VP" -> "Văn phòng"; "stu" -> "Căn hộ Studio"; "duplex" -> "Căn hộ Duplex" (không đồng nhất với Penthouse).
   - TUYỆT ĐỐI KHÔNG DỊCH sang tiếng Anh (không dùng "townhouse", "apartment", "villa"...).

4. DIỆN TÍCH MỖI TẦNG (floor_area_m2) & TỔNG DIỆN TÍCH (total_lease_area_m2):
   - CÁC DẠNG CÔNG THỨC NHIỀU TẦNG PHỔ BIẾN:
     * Dạng 'A m2 x B tầng' (hoặc 'A m² x B t', 'A mét x B tầng', 'A m x B tầng'):
       - Con số A đứng trước dấu nhân luôn là DIỆN TÍCH 1 SÀN / DIỆN TÍCH MỖI TẦNG -> BẮT BUỘC ĐIỀN floor_area_m2: "A" (ví dụ: '50m² × 5 tầng' -> floor_area_m2: "50"; '120m² × 5 tầng' -> floor_area_m2: "120"; '70m2 x 8 tầng' -> floor_area_m2: "70"; '60m2 x 8 tầng' -> floor_area_m2: "60"; '40m² × 7 tầng' -> floor_area_m2: "40").
       - Tổng diện tích cho thuê total_lease_area_m2 = A * B (ví dụ: 50 * 5 = 250; 120 * 5 = 600; 70 * 8 = 560; 60 * 8 = 480).
     * Dạng có diện tích xây dựng riêng (ví dụ '190m² x 4 tầng (XD: 100m)' hoặc 'Diện tích: 34m, xd 24m x 3 tầng'):
       - floor_area_m2: diện tích xây dựng 1 sàn ("100" hoặc "24").
       - total_lease_area_m2: diện tích xây dựng * số tầng (400 hoặc 72). Ghi rõ cả DT đất và DT xây dựng vào key_details.vi.
     * Dạng diện tích đất biệt thự có sân vườn (ví dụ 'Diện tích đất: 250m² x 5 Tầng'):
       - floor_area_m2: "250".
       - total_lease_area_m2: 250 (ghi nhận diện tích khuôn viên, TUYỆT ĐỐI KHÔNG nhân máy móc 250 x 5 = 1250).
     * Dạng các tầng có diện tích khác nhau (ví dụ 'Tầng 1: 70m, Tầng 2: 90m, Tầng 3, 4, 7: 101m/sàn' hoặc 'T1: 80m, T2-5: 60m'):
       - BẮT BUỘC liệt kê diện tích cho TỪNG TẦNG theo đúng số lượng tầng (ví dụ: floor_area_m2: "70, 90, 101, 101, 101" hoặc "80, 60, 60, 60, 60") và total_lease_area_m2 phải NHÂN ĐỦ SỐ TẦNG (70 + 90 + 101*3 = 463; 80 + 60*4 = 320), TUYỆT ĐỐI KHÔNG chỉ cộng mỗi loại diện tích một lần!
       - Nếu dòng diện tích chung ở trên (ví dụ '80m² x 5 tầng' = 400m²) không khớp với tổng chi tiết từng tầng ở dưới (320m²): BẮT BUỘC ghi chú cảnh báo đối chiếu vào key_details.vi để nhân viên xác nhận, không tự ý chốt ngầm một cách hiểu.
     * Dạng nhà 1 tầng, căn hộ chung cư, kho bãi, mặt bằng đơn (ví dụ 'kho xưởng 800m2', 'căn hộ 65m2', 'mặt bằng 80m'):
       - total_lease_area_m2: số diện tích chung.
       - floor_area_m2: để null vì là mặt phẳng đơn không chia tầng.

5. NỘI THẤT & DANH SÁCH MÓN ĐỒ (VERBATIM SPAN EXTRACTION - TÁCH BIỆT KHỎI BỐ TRÍ PHÒNG):
   - "furniture_status": CẮT ĐÚNG TỪ/CỤM TỪ NGUYÊN GỐC trong tin nhắn thể hiện hiện trạng nội thất (ví dụ: "đủ đồ", "full đồ", "đồ cơ bản", "đcb", "cb", "nb", "nguyên bản", "cơ bản CĐT", "cơ bản CDT", "full gỗ", "nhà trống", "Không nội thất", "bàn giao thô"...).
     * QUY TẮC NGOẠI LỆ "FULL THIẾU ...": Nếu tin ghi "full thiếu tv và đệm" -> BẮT BUỘC giữ nguyên cả cụm "full thiếu tv và đệm", KHÔNG được chỉ cắt mỗi chữ "full" rồi bỏ rơi phần thiếu!
     * NẾU TIN KHÔNG CÓ CỤM TỪ NÀO CHỈ HIỆN TRẠNG (ví dụ: chỉ liệt kê món đồ "Dh, nl, giường, bếp" hoặc không nhắc gì): BẮT BUỘC ĐỂ NULL, TUYỆT ĐỐI KHÔNG TỰ ĐẶT TỪ "chưa rõ" VÀO ĐÂY!
   - "furniture_list": Trích xuất NGUYÊN MẪU danh sách các món đồ nội thất/thiết bị được liệt kê trong tin nhắn (ví dụ: "Dh, nl, giường, tủ bếp", "ĐH NL TLẠNH BTỪ MGIẶT GTỦ", "có bếp rèm", "nb có thêm rèm, giàn phơi", "đh, nl (chưa có bếp)").
     * TÁCH BIỆT BỐ TRÍ PHÒNG KHỎI NỘI THẤT: Các thông tin chia phòng như "Gồm: 4 phòng ngủ x 3 WC, bếp", "1 phòng khách", "sân phơi" là KẾT CẤU PHÒNG, TUYỆT ĐỐI KHÔNG đưa vào "furniture_list"!
     * NẾU TIN CHỈ GHI "Nội thất cơ bản:" mà không liệt kê tên món đồ cụ thể nào phía sau -> BẮT BUỘC ĐỂ "furniture_list": null (TUYỆT ĐỐI KHÔNG điền chữ "cơ bản:" vào furniture_list!).
     * Khi căn nhà ghi "Không nội thất" hoặc "trống" -> "furniture_list" BẮT BUỘC ĐỂ NULL.

6. GIÁ TIỀN & ĐƠN VỊ & CƠ SỞ TÍNH GIÁ (GIỮ NGUYÊN BẢN TIẾNG VIỆT):
   - "price_amount": Con số quy đổi đầy đủ (ví dụ: "60 triệu/tháng" -> 60000000, "13tr500" -> 13500000, "11tr5" -> 11500000, "8tr2" -> 8200000, "12 tr" -> 12000000, "150K / m2" -> 150000, "85k/m2" -> 85000; "55 củ/tháng" -> 55000000; "2000$" -> 2000).
   - KHÔNG LẤY NHẦM PHÍ DỊCH VỤ HOẶC TIỀN CỌC LÀM GIÁ THUÊ:
     * "Pdv 8,8k", "DV 2.4k/m²", "xe máy 45k" là phí dịch vụ, KHÔNG PHẢI giá thuê chính.
     * "đóng 3 cọc 10tr" -> 10tr là tiền đặt cọc, KHÔNG PHẢI giá thuê.
     * "hh 5tr", "phí 24tr" là hoa hồng môi giới, KHÔNG PHẢI giá thuê.
   - PHÂN BIỆT RÕ "MPDV" VÀ "HẾT MPDV / K MPDV":
     * "mpdv" = miễn phí dịch vụ; "mpdv tới t2/2027" = miễn phí dịch vụ tới tháng 2/2027.
     * "hết mpdv", "k mpdv" = HẾT miễn phí dịch vụ / KHÔNG miễn phí dịch vụ (tuyệt đối không ghi nhầm là được miễn phí!).
   - SANG NHƯỢNG CỬA HÀNG / MẶT BẰNG:
     * price_amount LUÔN LUÔN LÀ TIỀN THUÊ NHÀ ĐỊNH KỲ (ví dụ: "tiền nhà 25 triệu/tháng, sang nhượng đồ đạc 70 triệu" -> price_amount: 25000000).
   - NHIỀU PHƯƠNG ÁN THUÊ TRONG 1 CĂN (Thuê lẻ sàn vs Thuê cả nhà):
     * Lấy phương án toàn bộ cả nhà làm giá chính price_amount, ghi chú phương án thuê lẻ vào "key_details.vi".
   - TIN NHẮN ĐÍNH CHÍNH / ĐIỀU CHỈNH TRONG DÒNG THỜI GIAN:
     * Lấy giá và thông số mới nhất sau đính chính.
   - "price_currency": "VND" hoặc "USD".
   - "price_basis" (PHÂN BIỆT RÕ 3 LOẠI):
     * "per_m2": Khi giá tính theo mét vuông (ví dụ: "150K / m2", "60k/1m", "12$/m2").
     * "per_floor": Khi giá tính theo từng tầng / từng sàn (ví dụ: "23,5 triệu/sàn/tháng", "40 Triệu/Tầng", "40 triệu/sàn", "20triệu/sàn").
     * "total": Khi giá tính trọn cả căn / cả tòa (ví dụ: "60 triệu/tháng", "25tr/tháng").
   - "price_period": CHỈ ĐIỀN "Theo tháng", "Theo năm", hoặc "Một lần" khi tin nhắn có chữ rõ ràng chỉ kỳ hạn. Nếu không nêu rõ kỳ hạn -> BẮT BUỘC ĐỂ NULL!
   - "price_text": Sao chép NGUYÊN VĂN câu giá từ tin nhắn (bao gồm cả "có TL", "ctl", "có tl sâu", "có deal", "giá chốt", "mpdv", "hết mpdv"...).

7. HOA HỒNG & ĐIỀU KIỆN HỢP ĐỒNG (GIỮ NGUYÊN VĂN TIẾNG VIỆT):
   - "landlord_commission_text": Sao chép NGUYÊN VĂN câu chữ hoa hồng/phí môi giới (nhận diện các từ: "hh", "hh sale", "hoa hồng sale", "phí mg", "phí môi giới", "hh 1/2 tháng", "hh chủ nhà nửa tháng", "1 tháng nếu hđ 2 năm, phí mg 1/2 tháng nếu hđ 1 năm", "Trừ 30% cho bên kết hợp").
     * Lưu ý: "Trừ 30% cho bên kết hợp" là tỷ lệ chia hoa hồng môi giới, TUYỆT ĐỐI KHÔNG trừ vào giá thuê nhà.
   - "our_share_percent": Tỷ lệ % bên mình nhận nếu có nhắc (ví dụ: 50).
   - "our_share_text": Sao chép NGUYÊN VĂN (ví dụ: "bên mình 50%").
   - "lease_term_text": Sao chép NGUYÊN VĂN điều kiện cọc, đóng tiền, thời hạn hợp đồng (nhận diện cả viết tắt: "3c1" = đóng 3 cọc 1, "1c1" = đóng 1 cọc 1, "tt3c1", "tt3 cọc 2", "6 cọc 1 hoặc 3 cọc 2" - giữ nguyên 2 phương án không ghép chéo, "đóng 3 cọc 10tr" - đóng 3 kỳ cọc 10 triệu khác đơn vị, "hđ tối thiểu 1 năm", "ký từ 2 năm trở lên").

8. QUY TẮC PHÂN BIỆT TỪ VIẾT TẮT ĐA NGHĨA TIẾNG VIỆT:
   - "TT / tt": (1) Thanh toán ("tt3c1", "tt 3"), (2) Trung tâm ("TT dạy học", "TT đào tạo"), (3) Tập thể ("nhà TT", "căn hộ TT").
   - "TC / tc": (1) Mã tòa nhà ("Tòa TC1", "TC2", "TC3" -> đưa vào address_text), (2) Tài chính ngân sách khách tìm thuê ("tài chính 2 tỷ 7").
   - "Đc / dc": (1) Địa chỉ ("Đc: Tố Hữu"), (2) chữ "được" ("10,5tr bên mas dc ko?", "vào đc từ T12" -> không cắt nhầm làm địa chỉ).
   - "CC / cc": (1) Chung cư ("căn hộ CC Invest", "CC Licogi"), (2) Chính chủ ("CC gửi bán").
   - "NT / nt": (1) Nội thất ("full nt"), (2) trong cụm "k view NT" -> giữ nguyên văn "k view NT" trong tóm tắt, không tự suy đoán.
   - Ký hiệu phòng: "1N+" / "1PN+" (1 phòng ngủ + không gian phụ, KHÔNG tự cộng thành 2PN), "2n1" (2 ngủ 1 vệ sinh), "2n2" (2 ngủ 2 vệ sinh), "1n1k" (1 ngủ 1 khách), "PK" (phòng khách), "VS / WC / w" (vệ sinh), "3N sửa thành 2n+" (giữ rõ thông tin cải tạo).

9. BẢO TOÀN ĐIỀU KIỆN CẤM & HẠN CHẾ THUÊ TRONG TÓM TẮT TIẾNG VIỆT (key_details.vi):
   - BẮT BUỘC giữ nguyên mọi điều kiện hạn chế của chủ nhà trong "key_details.vi":
     * Cấm hàng ăn / ăn uống ("không làm hàng ăn", "cấm kinh doanh ăn uống").
     * Cấm căn hộ dịch vụ ("KO chdv", "không cho thuê làm căn hộ dịch vụ").
     * Ghi chú đối tượng / phương tiện / thú cưng ("ko cho tq", "nhận nước ngoài", "k xe điện", "k nuôi PET", "không chung chủ", "sẵn pass").
     * Chủ giữ lại phòng ("chủ giữ lại 1 phòng để dạy học" -> cảnh báo rõ chủ giữ lại không gian, không giao thuê toàn bộ).

10. BẢO TOÀN KẾT CẤU ĐẶC BIỆT (HẦM, LỬNG, TUM, GÁC XÉP, SÂN THƯỢNG) & NGUYÊN TẮC ZERO EXTRAPOLATION:
   - Nếu tin nhắn KHÔNG nêu rõ diện tích tổng có bao gồm tầng hầm hay không -> TUYỆT ĐỐI KHÔNG TỰ SUY ĐOÁN hay cộng gộp diện tích hầm vào "total_lease_area_m2".
   - BẮT BUỘC ghi rõ trong "key_details.vi" nếu căn có: tầng hầm, tầng lửng, tầng tum / tum sân phơi, gác xép / xép, sân thượng.

11. CÔNG NĂNG & MỤC ĐÍCH SỬ DỤNG PHÙ HỢP (SUITABLE USES):
   - Nếu tin nhắn có nhắc đến mục đích phù hợp / ưu tiên / thuận tiện (ví dụ: "phù hợp: văn phòng cty, spa, TT dạy học, kdon / k donl (kinh doanh online)..."):
   - BẮT BUỘC giữ lại trong tóm tắt "key_details.vi" và điền vào "key_details.suitable_for".

12. TÓM TẮT TIẾNG VIỆT CHUẨN XÁC (key_details.vi):
   - Tập trung tối đa cho "key_details.vi": Tóm tắt đầy đủ, súc tích, trung thực 100% bằng Tiếng Việt dựa vào các thông số có thật của căn đó. (Các trường en, zh chỉ điền ngắn gọn để đúng cấu trúc JSON).

${goldenSamplesText}
`;

  try {
    const contents: any[] = [
      {
        role: "user",
        parts: [
          {
            text: `${systemPrompt}\n\n${transcript}`,
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
              properties: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    self_check: {
                      type: Type.STRING,
                      description:
                        "Bắt buộc tự kiểm tra 4 điểm trước khi điền: (1) Nội thất: tin có nói hiện trạng ('Full đồ', 'full đồ', 'Nội thất cơ bản', 'Không nội thất') không? Có liệt kê TÊN ĐỒ VẬT cụ thể (điều hòa, nóng lạnh, tủ lạnh, giường, thang máy...) không? Nếu sau chữ 'full đồ' là giá tiền ('13tr', '19tr', '22tr') hoặc ngày vào ('1/12 vào', 'vào luôn') thì furniture_list BẮT BUỘC là null; nếu không nhắc nội thất (chú ý 'thông sàn' không phải 'bàn giao thô') thì furniture_status BẮT BUỘC là null. (2) Diện tích: có diện tích từng tầng không, tổng các tầng có khớp dòng chung không? (3) Giá: tính theo Tổng căn (total), Theo tầng/sàn (per_floor) hay Theo m2 (per_m2)? (4) Hoa hồng: có 'Phí 1th', 'HH: 50%', 'Phí 50%' không?",
                    },
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
                    floor_area_m2: {
                      type: Type.STRING,
                      nullable: true,
                      description: "Diện tích 1 sàn / diện tích mỗi tầng. Ví dụ '50m² x 5 tầng' thì điền '50'.",
                    },
                    total_lease_area_m2: {
                      type: Type.NUMBER,
                      nullable: true,
                      description: "Tổng diện tích sàn cho thuê. Ví dụ 50m2 x 5 tầng thì điền 250.",
                    },
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
                      enum: ["total", "per_m2", "per_floor"],
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
                      description:
                        "Cắt nguyên văn cụm từ chỉ hiện trạng nội thất trong tin nhắn (ví dụ: 'Full đồ', 'full đồ', 'đủ đồ', 'Nội thất cơ bản', 'đồ cơ bản', 'đcb', 'nguyên bản', 'nhà trống', 'Không nội thất', 'bàn giao thô'...). Giữ trọn cụm 'Full đồ' nếu tin ghi 'Full đồ'. Nếu tin không nhắc hiện trạng nội thất (lưu ý 'thông sàn' KHÔNG phải là 'bàn giao thô') thì BẮT BUỘC để null.",
                    },
                    furniture_list: {
                      type: Type.STRING,
                      nullable: true,
                      description:
                        "CHỈ điền danh sách TÊN ĐỒ VẬT / THIẾT BỊ vật lý được liệt kê trong tin nhắn (ví dụ: 'điều hòa, nóng lạnh, tủ bếp, thang máy, tủ lạnh, máy giặt, giường, sofa, rèm...'). TUYỆT ĐỐI KHÔNG điền giá tiền ('13tr', '19tr', '22tr'), ngày nhận nhà ('1/12 vào', 'vào luôn') hay số phòng ('4 phòng ngủ, 3 WC, bếp') vào đây. Nếu tin chỉ ghi 'Full đồ' hoặc 'Nội thất cơ bản:' mà không liệt kê tên món đồ cụ thể thì BẮT BUỘC để null.",
                    },
                  },
                  required: [
                    "self_check",
                    "source_text_snippet",
                    "address_text",
                    "property_types",
                    "price_amount",
                    "price_currency",
                    "price_basis",
                    "price_text",
                    "key_details",
                    "furniture_status",
                    "furniture_list",
                  ],
                },
              },
              summary_note: { type: Type.STRING, nullable: true },
            },
            required: ["properties"],
          },
        },
      });

      if (!response || !response.text) {
        throw new Error("Phản hồi từ Gemini API rỗng.");
      }

      return JSON.parse(response.text);
    });

    const rawProps: any[] = parsed.properties || [];
    const fullTimelineText = uniqueTextItems.map((t) => t.text).join("\n\n");
    const separatedSnippets = splitBatchTranscriptByProperties(fullTimelineText, rawProps);

    const sanitizedProps: ExtractedProperty[] = [];
    for (let i = 0; i < rawProps.length; i++) {
      const rawP = rawProps[i];
      if (!rawP.source_text_snippet || rawP.source_text_snippet.trim().length < 30) {
        rawP.source_text_snippet = separatedSnippets[i] || "";
      }
      const textContext = rawP.source_text_snippet || separatedSnippets[i] || "";
      const processed = postProcessBatchListing(rawP, textContext);
      sanitizedProps.push(processed);
    }

    return {
      properties: sanitizedProps,
      summary_note: parsed.summary_note,
    };
  } catch (err: any) {
    console.error("[Batch Extraction] Lỗi bóc tách hội thoại văn bản:", err);
    throw err;
  }
}

/**
 * Tách riêng phân đoạn văn bản gốc của từng căn nếu tin nhắn gửi gộp nhiều căn
 */
export function splitBatchTranscriptByProperties(
  fullText: string,
  properties: { address_text?: string; source_text_snippet?: string }[]
): string[] {
  if (!properties || properties.length <= 1) {
    return [fullText];
  }

  const GENERIC_GEO = new Set(["hà nội", "ha noi", "hồ chí minh", "ho chi minh", "hcm", "sài gòn", "đà nẵng", "hải phòng"]);
  const positions: { index: number; propIdx: number }[] = [];
  const lowerFull = fullText.toLowerCase();

  properties.forEach((p, propIdx) => {
    if (p.source_text_snippet && p.source_text_snippet.trim().length >= 40) {
      const idx = lowerFull.indexOf(p.source_text_snippet.trim().slice(0, 50).toLowerCase());
      if (idx !== -1) {
        positions.push({ index: idx, propIdx });
        return;
      }
    }

    const addr = p.address_text || "";
    const cleanAddr = addr.replace(/^(nhà|căn hộ|chung cư|biệt thự|kdt|kđt|ngõ|mặt phố)\s+/i, "").trim().toLowerCase();
    const parts = cleanAddr
      .split(/[,-]/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3 && !GENERIC_GEO.has(part));

    let bestIdx = -1;
    for (const part of parts) {
      const idx = lowerFull.indexOf(part);
      if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
        bestIdx = idx;
      }
    }

    if (bestIdx !== -1) {
      let startIdx = bestIdx;
      const preceding = fullText.slice(Math.max(0, bestIdx - 150), bestIdx);
      const lines = preceding.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/(?:cho thuê|cần cho thuê|chính chủ|bán|nhượng|biệt thự|toà nhà|tòa nhà)/i.test(line) || /^[🏡🏠🏢🎁🔹*•-]/.test(line)) {
          const linePos = preceding.indexOf(lines[i]);
          if (linePos !== -1) {
            startIdx = Math.max(0, bestIdx - (preceding.length - linePos));
            break;
          }
        }
      }
      positions.push({ index: startIdx, propIdx });
    }
  });

  if (positions.length < properties.length) {
    return properties.map((p) => p.source_text_snippet || fullText);
  }

  if (positions[0].index > 0 && positions[0].index < 120) {
    positions[0].index = 0;
  }

  positions.sort((a, b) => a.index - b.index);

  const snippetsByIndex = new Map<number, string>();
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].index;
    const end = i < positions.length - 1 ? positions[i + 1].index : fullText.length;
    const chunk = fullText.slice(start, end).trim();
    snippetsByIndex.set(positions[i].propIdx, chunk);
  }

  return properties.map((_, idx) => snippetsByIndex.get(idx) || fullText);
}

/**
 * Lớp bảo vệ hậu xử lý tất định cho từng căn trong Batch
 */
function postProcessBatchListing(prop: any, snippetText: string): ExtractedProperty {
  if (prop.source_text_snippet) {
    prop.source_text_snippet = String(prop.source_text_snippet)
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "");
  }

  const text = (prop.source_text_snippet || snippetText || "").trim();

  // 1. Phục hồi và đồng bộ diện tích sàn đa tầng
  const multiFloorAreas = extractMultiFloorAreas(text);
  if (multiFloorAreas) {
    if (
      multiFloorAreas.hasExplicitFloorBreakdown ||
      !prop.floor_area_m2 ||
      (multiFloorAreas.floorAreaStr.includes(",") && !String(prop.floor_area_m2).includes(","))
    ) {
      prop.floor_area_m2 = multiFloorAreas.floorAreaStr;
    }
    if (
      multiFloorAreas.hasExplicitFloorBreakdown ||
      !prop.total_lease_area_m2 ||
      prop.total_lease_area_m2 <= 0 ||
      multiFloorAreas.floorAreaStr.includes(",")
    ) {
      prop.total_lease_area_m2 = multiFloorAreas.totalArea;
    }
  }

  // 1b. Phục hồi diện tích đơn lẻ (căn hộ, mặt bằng tầng đơn, cửa hàng) nếu total_lease_area_m2 vẫn rỗng
  if (!prop.total_lease_area_m2 || prop.total_lease_area_m2 <= 0) {
    const singleAreaMatch = text.match(/(?:diện\s*tích|dt|mb|mbkd)?\s*[:\s]*(\d+(?:[.,]\d+)?)\s*m(?:2|²)?/i);
    if (singleAreaMatch) {
      const areaVal = parseFloat(singleAreaMatch[1].replace(",", "."));
      if (areaVal > 5 && areaVal < 50000) {
        prop.total_lease_area_m2 = areaVal;
      }
    }
  }

  // 2. Fallback giá tiền tất định nếu price_amount rỗng hoặc bằng 0
  if (!prop.price_amount || prop.price_amount <= 0) {
    const priceFallback = extractPriceFallback(text, prop.key_details?.vi);
    if (priceFallback && priceFallback.amount && priceFallback.amount > 0) {
      prop.price_amount = priceFallback.amount;
      prop.price_currency = priceFallback.currency || prop.price_currency || "VND";
      prop.price_basis = priceFallback.basis || prop.price_basis || "total";
      if (priceFallback.period) prop.price_period = priceFallback.period;
      if (!prop.price_text && priceFallback.textSnippet) prop.price_text = priceFallback.textSnippet;
    }
  } else if (prop.price_amount > 0 && prop.price_amount < 1000 && prop.price_currency !== "USD") {
    prop.price_amount = Math.round(prop.price_amount * 1000000);
  }

  // 2b. Tôn trọng 100% quyết định null của AI cho Nội thất (KHÔNG dùng Regex tự điền đè khi AI trả về null)
  // Bộ Validator auditAndVerifyExtractedProperty ở bước 3 sẽ làm nhiệm vụ gác cổng kiểm chứng chống bịa.

  // 2c. Phục hồi điều kiện thanh toán/cọc (3c1, 1c1, tt3c1...) và hoa hồng (hh, phí mg...) nếu thiếu
  if (!prop.lease_term_text) {
    const leaseTerm = extractLeaseTermFallback(text);
    if (leaseTerm) prop.lease_term_text = leaseTerm;
  }
  if (!prop.landlord_commission_text) {
    const comm = extractCommissionFallback(text);
    if (comm) prop.landlord_commission_text = comm;
  }

  // 3. Kiểm toán logic độc lập & xác minh bằng chứng (Grounding Auditor)
  const { prop: auditedProp, audit } = auditAndVerifyExtractedProperty(prop, text);
  prop = auditedProp;

  if (prop.key_details) {
    prop.key_details.grounding_audit = audit;
    prop.key_details = enrichKeyDetailsWithStructureAndSuitability(prop.key_details, text);
  }

  // 4. Kỳ hạn giá: Chỉ gán khi tin nhắn thực sự có từ ngữ chỉ kỳ hạn
  const detectedPeriod = detectPricePeriod(prop.price_text, prop.source_text_snippet || text);
  if (detectedPeriod) {
    prop.price_period = detectedPeriod;
  } else {
    prop.price_period = null;
  }

  // 5. Chuẩn hóa tiếng Việt cho Loại hình BĐS (bao gồm viết tắt CHCC, CHDV, MBKD, LK, VP, stu, duplex...)
  prop.property_types = normalizeVietnamesePropertyTypes(prop.property_types, text);

  return prop;
}
