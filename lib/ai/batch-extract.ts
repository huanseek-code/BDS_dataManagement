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
  extractSuitableFor,
  extractSpecialStructureNotes,
  enrichKeyDetailsWithStructureAndSuitability,
} from "./golden-samples";

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
   - Trích xuất NGUYÊN MẪU cụm từ chỉ loại hình BĐS có trong tin nhắn dưới dạng tiếng Việt (ví dụ: ["Nhà liền kề"], ["Nhà mặt phố"], ["Căn hộ chung cư"], ["Biệt thự"], ["Kho xưởng"], ["Văn phòng"], ["Mặt bằng kinh doanh"]...).
   - TUYỆT ĐỐI KHÔNG DỊCH sang tiếng Anh (không dùng "townhouse", "apartment", "villa"...).

4. DIỆN TÍCH MỖI TẦNG (floor_area_m2) & TỔNG DIỆN TÍCH (total_lease_area_m2):
   - CÁC DẠNG CÔNG THỨC NHIỀU TẦNG PHỔ BIẾN:
     * Dạng 'A m2 x B tầng' (hoặc 'A m² x B t', 'A mét x B tầng', 'A m x B tầng'):
       - Con số A đứng trước dấu nhân luôn là DIỆN TÍCH 1 SÀN / DIỆN TÍCH MỖI TẦNG -> BẮT BUỘC ĐIỀN floor_area_m2: "A" (ví dụ: '50m² × 5 tầng' -> floor_area_m2: "50"; '120m² × 5 tầng' -> floor_area_m2: "120"; '70m2 x 8 tầng' -> floor_area_m2: "70"; '60m2 x 8 tầng' -> floor_area_m2: "60"; '40m² × 7 tầng' -> floor_area_m2: "40").
       - Tổng diện tích cho thuê total_lease_area_m2 = A * B (ví dụ: 50 * 5 = 250; 120 * 5 = 600; 70 * 8 = 560; 60 * 8 = 480).
     * Dạng có diện tích xây dựng riêng (ví dụ '190m² x 4 tầng (XD: 100m)'):
       - floor_area_m2: "100" (diện tích xây dựng 1 sàn).
       - total_lease_area_m2: 100 * 4 = 400.
     * Dạng diện tích đất biệt thự có sân vườn (ví dụ 'Diện tích đất: 250m² x 5 Tầng'):
       - floor_area_m2: "250".
       - total_lease_area_m2: 250 (ghi nhận diện tích khuôn viên, TUYỆT ĐỐI KHÔNG nhân máy móc 250 x 5 = 1250).
     * Dạng các tầng có diện tích khác nhau (ví dụ 'Tầng 1: 50m, Tầng 2: 70m, Tầng 3: 80m'):
       - floor_area_m2: "50, 70, 80".
       - total_lease_area_m2: 50 + 70 + 80 = 200.
     * Dạng nhà 1 tầng, căn hộ chung cư, kho bãi, mặt bằng đơn (ví dụ 'kho xưởng 800m2', 'căn hộ 65m2', 'mặt bằng 80m'):
       - total_lease_area_m2: số diện tích chung.
       - floor_area_m2: để null vì là mặt phẳng đơn không chia tầng.

5. NỘI THẤT & DANH SÁCH MÓN ĐỒ (VERBATIM SPAN EXTRACTION - TRÍCH NGUYÊN GỐC TỪNG CHỮ):
   - "furniture_status": CẮT ĐÚNG TỪ/CỤM TỪ NGUYÊN GỐC trong tin nhắn thể hiện hiện trạng nội thất (ví dụ: "đủ đồ", "full đồ", "đồ cơ bản", "full gỗ", "nhà trống", "bàn giao thô", "nguyên bản cđt"...).
     * TUYỆT ĐỐI KHÔNG TỰ QUY ĐỔI (ví dụ: tin ghi "đủ đồ" thì trích đúng "đủ đồ", CẤM đổi thành "đầy đủ nội thất").
     * NẾU TIN KHÔNG CÓ CỤM TỪ NÀO CHỈ HIỆN TRẠNG (ví dụ: chỉ liệt kê món đồ "Dh, nl, giường, bếp" hoặc không nhắc gì): BẮT BUỘC ĐỂ NULL, TUYỆT ĐỐI KHÔNG TỰ ĐẶT TỪ "chưa rõ" VÀO ĐÂY!
   - "furniture_list": Trích xuất NGUYÊN MẪU danh sách các món đồ được liệt kê trong tin nhắn (ví dụ: "Dh, nl, giường, bếp", "Dh âm trần, nl, THANG MÁY", "có bếp rèm", "6 điều hoà, 6 nóng lạnh, tủ bếp").
     * Nguồn nói rõ không có món nào thì ghi rõ đúng câu chữ đó (ví dụ: "riêng tủ lạnh chưa có", "chưa có giường").
     * Nếu tin nhắn không liệt kê món đồ nào thì để null hoặc "".

6. GIÁ TIỀN & ĐƠN VỊ & CƠ SỞ TÍNH GIÁ (GIỮ NGUYÊN BẢN TIẾNG VIỆT):
   - "price_amount": Con số quy đổi đầy đủ (ví dụ: "60 triệu/tháng" -> 60000000, "12 tr" -> 12000000, "150K / m2" -> 150000, "85k/m2" -> 85000; "55 củ/tháng" -> 55000000; "2000$" -> 2000). Luôn tính đúng đơn vị triệu, tuyệt đối không để số 12 hay 85.
   - TIẾNG LÓNG & TỪ VIẾT TẮT THÔNG DỤNG:
     * "củ" = triệu đồng (ví dụ: "55 củ/tháng" -> price_amount: 55000000, price_period: "Theo tháng").
     * "tm" = thang máy, "ac" = điều hòa, "mp" = mặt phố, "chdv" = căn hộ dịch vụ.
   - SANG NHƯỢNG CỬA HÀNG / MẶT BẰNG:
     * price_amount LUÔN LUÔN LÀ TIỀN THUÊ NHÀ ĐỊNH KỲ (ví dụ: "tiền nhà 25 triệu/tháng, sang nhượng đồ đạc 70 triệu" -> price_amount: 25000000, price_period: "Theo tháng").
     * Phí sang nhượng đồ đạc / cơ sở vật chất ghi chú vào "key_details", TUYỆT ĐỐI KHÔNG lấy tiền sang nhượng gán vào price_amount.
   - NHIỀU PHƯƠNG ÁN THUÊ TRONG 1 CĂN (Thuê lẻ sàn vs Thuê cả nhà):
     * Lấy phương án toàn bộ cả nhà làm giá chính price_amount (ví dụ: "thuê cả toà 80tr/tháng, thuê tầng 1-2 là 35tr" -> price_amount: 80000000, total_lease_area_m2 của cả toà).
     * Ghi chú chi tiết phương án thuê lẻ từng tầng vào "key_details".
   - TIN NHẮN ĐÍNH CHÍNH / ĐIỀU CHỈNH TRONG DÒNG THỜI GIAN:
     * Nếu chuỗi tin nhắn có tin gửi tiếp sau đính chính hoặc giảm giá (ví dụ: "chủ nhà vừa báo giảm còn 16.5tr/tháng"): BẮT BUỘC lấy giá và thông số mới nhất sau đính chính.
   - "price_currency": "VND" hoặc "USD".
   - "price_basis" (CƠ SỞ TÍNH GIÁ - PHÂN BIỆT RÕ):
     * KHI GIÁ TÍNH THEO MÉT VUÔNG (ví dụ: "150K / m2", "150k/m2", "85000đ/m2", "100k/m2/tháng", "12$/m2", "giá theo m2", "đơn giá /m2"): BẮT BUỘC ĐIỀN price_basis: "Theo m²".
     * KHI GIÁ TÍNH TRỌN CĂN / TỔNG DIỆN TÍCH (ví dụ: "50 triệu/tháng", "16tr", "200 tr/ tháng", "18tr"): BẮT BUỘC ĐIỀN price_basis: "Tổng căn".
     * Kho bãi, nhà xưởng, đất, văn phòng cho thuê báo giá theo m2: BẮT BUỘC điền price_basis: "Theo m²".
   - "price_period": KỲ HẠN GIÁ (QUY TẮC BẢO TOÀN NGUYÊN BẢN - ZERO EXTRAPOLATION):
     * "Theo tháng": CHỈ ĐIỀN khi tin nhắn có chữ rõ ràng chỉ kỳ hạn theo tháng (ví dụ: "/tháng", "triệu/tháng", "tr/tháng", "tr/th", "/th", "theo tháng", "1 tháng", "hàng tháng").
     * "Theo năm": CHỈ ĐIỀN khi tin nhắn có chữ rõ ràng chỉ kỳ hạn theo năm (ví dụ: "/năm", "triệu/năm", "theo năm", "1 năm").
     * "Một lần": CHỈ ĐIỀN khi tin nhắn thể hiện giao dịch bán, mua đứt, chuyển nhượng 1 lần.
     * NẾU TIN NHẮN KHÔNG NÊU RÕ KỲ HẠN (ví dụ: chỉ ghi "GIÁ thuê:150K / m2", "Giá thuê : 55tr", "giá 8,5tr", "12 triệu", "50tr", "39 triệu"): BẮT BUỘC ĐỂ NULL, TUYỆT ĐỐI KHÔNG TỰ SUY DIỄN HAY TỰ DỊCH NGHĨA THÀNH "Theo tháng"!
   - "price_text": Sao chép NGUYÊN VĂN câu giá từ tin nhắn (ví dụ: "150K / m2", "60 triệu/tháng (có TL)", "14 tr mpdv", "85 triệu/tháng", "55tr").

7. HOA HỒNG & ĐIỀU KIỆN HỢP ĐỒNG (GIỮ NGUYÊN VĂN):
   - "landlord_commission_text": Sao chép NGUYÊN VĂN câu chữ hoa hồng của chủ nhà (ví dụ: "1 tháng bên mình 50%", "hh full", "1 tháng tiền nhà").
   - "our_share_percent": Tỷ lệ % bên mình nhận nếu có nhắc (ví dụ: 50).
   - "our_share_text": Sao chép NGUYÊN VĂN (ví dụ: "bên mình 50%").
   - "lease_term_text": Sao chép NGUYÊN VĂN điều kiện cọc, đóng tiền, thời hạn hợp đồng từ tin nhắn (ví dụ: "thanh toán 3 cọc 1, hợp đồng 1 năm", "ký từ 3 năm trở lên", "6 cọc 1 hoặc 3 cọc 1, hợp đồng 3 năm trở lên").

8. BẢO TOÀN ĐIỀU KIỆN CẤM & NGÀNH NGHỀ HẠN CHẾ (NEGATIVE CONSTRAINTS):
   - Nếu tin nhắn có ghi chú hạn chế / ngành cấm của chủ nhà như:
     "không làm hàng ăn", "không ăn uống", "không nấu nướng", "không làm spa", "không ở lại", "cấm kinh doanh ăn uống"...
   - BẮT BUỘC PHẢI GIỮ NGUYÊN ĐIỀU KIỆN NÀY trong tóm tắt "key_details" ở cả 3 thứ tiếng:
     * vi: "... (chủ nhà không cho làm hàng ăn / kinh doanh ăn uống)"
     * en: "... (no food & beverage / restaurant businesses allowed)"
     * zh: "... (房东禁止餐饮业)"

9. BẢO TOÀN KẾT CẤU ĐẶC BIỆT (TẦNG HẦM, TẦNG LỬNG, TẦNG TUM) & NGUYÊN TẮC ZERO EXTRAPOLATION:
   - Nếu tin nhắn KHÔNG nêu rõ diện tích tổng có bao gồm tầng hầm hay không -> TUYỆT ĐỐI KHÔNG TỰ SUY ĐOÁN hay cộng gộp diện tích hầm vào "total_lease_area_m2".
     * Ví dụ: "Nhà 8 tầng + 1 hầm, DT 90m2" -> total_lease_area_m2 = 8 * 90 = 720m2 (chỉ tính 8 tầng nổi), TUYỆT ĐỐI KHÔNG tự nhân 9 * 90 = 810m2.
     * BẮT BUỘC giữ nguyên kết cấu trong tóm tắt "key_details.vi": "... gồm 8 tầng nổi + 1 tầng hầm".
   - Tầng lửng và tầng tum: BẮT BUỘC ghi rõ trong tóm tắt "key_details.vi" (ví dụ: "... có tầng lửng", "... tầng tum sân phơi").

10. CÔNG NĂNG & MỤC ĐÍCH SỬ DỤNG PHÙ HỢP (SUITABLE USES):
   - Nếu tin nhắn có nhắc đến mục đích phù hợp (ví dụ: "phù hợp: văn phòng cty, spa, TT dạy học, phòng khám, kd online...", "kho phù hợp làm kho chứa hàng, sản xuất và logistics"):
   - BẮT BUỘC PHẢI GIỮ LẠI trong tóm tắt "key_details.vi" (ví dụ: "... phù hợp văn phòng cty, spa, TT dạy học, phòng khám, kd online.") và điền vào "key_details.suitable_for".

11. TÓM TẮT 3 NGÔN NGỮ (key_details: vi, en, zh):
   - vi: Tóm tắt đầy đủ, súc tích, trung thực 100% dựa vào các thông số có thật của căn đó (kết cấu, hầm/lửng/tum, đồ đạc, công năng phù hợp, giá).
   - en & zh: Bản dịch tương ứng sát nghĩa và đầy đủ.

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
                  },
                  required: [
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
 * Trích xuất hiện trạng và danh sách nội thất tất định bằng biểu thức chính quy (Deterministic Furniture Extractor)
 */
export function extractFurnitureFallback(text: string): {
  status: string | null;
  list: string | null;
} {
  const lower = text.toLowerCase();
  let status: string | null = null;
  let list: string | null = null;

  // 1. Nhận diện hiện trạng nội thất
  if (
    /full\s*(?:đồ|nội\s*thất|toàn\s*bộ)|đầy\s*đủ\s*nội\s*thất|nội\s*thất\s*:\s*full|\bfull\b|đủ\s*đồ/i.test(
      lower
    )
  ) {
    status = "full đồ";
  } else if (/nội\s*thất\s*cơ\s*bản|đồ\s*cơ\s*bản|\bcơ\s*bản\b/i.test(lower)) {
    status = "cơ bản";
  } else if (/không\s*(?:có\s*)?đồ|nhà\s*trống|trống\s*đồ/i.test(lower)) {
    status = "không nội thất";
  } else if (/bàn\s*giao\s*thô|\bthô\b/i.test(lower)) {
    status = "bàn giao thô";
  }

  // 2. Nhận diện danh sách món đồ
  const listMatch = text.match(
    /(?:nội\s*thất(?:\s*cơ\s*bản)?\s*[:\s-]|k\s*thiếu\s*gì\s*|gồm\s*[:\s-]|full\s*đồ\s*[:\s-]?\s*)([^\n]+)/i
  );
  if (listMatch) {
    const rawList = listMatch[1].trim().replace(/^[;,\s:-]+|[;,\s.-]+$/g, "");
    if (rawList && !/^(?:full|cơ bản|đủ đồ|vào luôn)$/i.test(rawList)) {
      list = rawList;
    }
  }

  if (!list) {
    const itemsFound: string[] = [];
    const itemPatterns = [
      /(?:điều\s*hòa|điều\s*hoà|\bdh\b)/i,
      /(?:nóng\s*lạnh|\bnl\b)/i,
      /(?:máy\s*giặt|may\s*giặt)/i,
      /(?:tủ\s*lạnh)/i,
      /(?:thang\s*máy)/i,
      /(?:giường)/i,
      /(?:tủ\s*bếp|bếp)/i,
      /(?:sofa|bàn\s*ghế)/i,
    ];
    for (const pat of itemPatterns) {
      const m = text.match(pat);
      if (m && !itemsFound.includes(m[0])) {
        itemsFound.push(m[0]);
      }
    }
    if (itemsFound.length > 0) {
      list = itemsFound.join(", ");
    }
  }

  return { status, list };
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

  const text = `${prop.source_text_snippet || ""} ${snippetText || ""} ${prop.key_details?.vi || ""}`.trim();

  // 1. Phục hồi và đồng bộ diện tích sàn đa tầng
  const multiFloorAreas = extractMultiFloorAreas(text);
  if (multiFloorAreas) {
    if (!prop.floor_area_m2 || (multiFloorAreas.floorAreaStr.includes(",") && !String(prop.floor_area_m2).includes(","))) {
      prop.floor_area_m2 = multiFloorAreas.floorAreaStr;
    }
    if (!prop.total_lease_area_m2 || prop.total_lease_area_m2 <= 0 || multiFloorAreas.floorAreaStr.includes(",")) {
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

  // 2b. Trích xuất nội thất tất định nếu AI chưa bóc tách đủ
  if (!prop.furniture_status || String(prop.furniture_status).trim().toLowerCase() === "null") {
    const furn = extractFurnitureFallback(text);
    if (furn.status) {
      prop.furniture_status = furn.status;
      prop.handover_condition = furn.status;
    }
    if (!prop.furniture_list && furn.list) {
      prop.furniture_list = furn.list;
    }
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
