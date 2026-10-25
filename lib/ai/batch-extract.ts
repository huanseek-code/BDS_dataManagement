import "server-only";
import { Type } from "@google/genai";
import { executeWithKeyRotation } from "./key-manager";
import { ExtractedProperty } from "./extract";

export interface BatchTimelineItem {
  msg_id: string;
  time: number;
  sent_time: string;
  type: "text" | "photo";
  text?: string;
  photo_url?: string;
}

export interface BatchExtractedProperty extends ExtractedProperty {
  assigned_photo_urls: string[];
}

export interface BatchExtractionResult {
  properties: BatchExtractedProperty[];
  unassigned_photo_urls: string[];
  summary_note?: string;
}

/**
 * Bóc tách Đa căn BĐS và Ghép cụm Ảnh toàn cảnh theo Dòng thời gian chuẩn
 * Đảm bảo độ chính xác tối đa: không lẫn ảnh giữa các căn, tách biệt các trường hợp nghi vấn.
 */
export async function extractBatchPropertiesFromTimeline(
  timeline: BatchTimelineItem[]
): Promise<BatchExtractionResult> {
  if (!timeline || timeline.length === 0) {
    return { properties: [], unassigned_photo_urls: [] };
  }

  // Thu thập toàn bộ danh sách ảnh trong batch để kiểm tra chéo
  const allBatchPhotoUrls = timeline
    .filter((t) => t.type === "photo" && t.photo_url)
    .map((t) => t.photo_url as string);

  // Xây dựng bản tường thuật dòng thời gian chuẩn cho Gemini
  let transcript = "--- DÒNG THỜI GIAN HỘI THOẠI TỪ ĐỐI TÁC (TỪ CŨ ĐẾN MỚI) ---\n";
  timeline.forEach((item, index) => {
    if (item.type === "text" && item.text) {
      transcript += `[Tin ${index + 1} | ${item.sent_time || "Vừa gửi"}] <VĂN BẢN (ID: ${item.msg_id})>:\n${item.text.trim()}\n\n`;
    } else if (item.type === "photo" && item.photo_url) {
      transcript += `[Tin ${index + 1} | ${item.sent_time || "Vừa gửi"}] <HÌNH ẢNH (ID: ${item.msg_id})>: ${item.photo_url}\n\n`;
    }
  });

  const systemPrompt = `
Bạn là chuyên gia thẩm định và bóc tách dữ liệu Bất động sản (BĐS) hàng đầu cho Huanseek.
Nhiệm vụ của bạn là đọc một ĐỢT HỘI THOẠI TOÀN CẢNH (BATCH) bao gồm các tin nhắn văn bản và hình ảnh theo đúng dòng thời gian gửi từ đối tác môi giới, sau đó phân tách thành các căn BĐS chuẩn hóa và ghép đúng chùm ảnh tương ứng.

QUY TẮC CỐT LÕI (ƯU TIÊN ĐỘ CHÍNH XÁC TUYỆT ĐỐI):

1. MỘT ĐỢT GỬI CÓ THỂ CHỨA NHIỀU CĂN BĐS (MULTI-PROPERTY):
   - Đọc toàn bộ dòng thời gian và nhận diện chính xác có bao nhiêu căn BĐS độc lập.
   - Mỗi căn BĐS phải là một phần tử riêng trong mảng "properties".
   - "source_text_snippet": Trích nguyên văn đoạn văn bản mô tả riêng của căn đó, TUYỆT ĐỐI không copy gộp các căn vào nhau.

2. NGUYÊN TẮC GHÉP ẢNH ĐỘC QUYỀN (assigned_photo_urls):
   - Mỗi bức ảnh trong dòng thời gian chỉ được thuộc về TỐI ĐA 1 CĂN BĐS. TUYỆT ĐỐI CẤM gán cùng 1 ảnh vào nhiều căn khác nhau.
   - Căn cứ ghép ảnh:
     * Vị trí thời gian: Ảnh gửi liền trước hoặc liền sau đoạn văn bản mô tả của căn đó.
     * Ngữ cảnh mô tả: Lời dẫn như "ảnh bên dưới", "căn C01 ảnh như sau", "ảnh nhà phố 8 tầng".
   - NHẬN DIỆN ẢNH KHÔNG RÕ RÀNG (unassigned_photo_urls):
     * Nếu có những bức ảnh gửi ở vị trí nhập nhằng giữa 2 căn mà không có bằng chứng chắc chắn, CẤM ĐOÁN MÒ.
     * Hãy đưa các ảnh này vào mảng "unassigned_photo_urls" để nhân viên xác nhận sau.

3. HIỆN TRẠNG BÀN GIAO (handover_condition - BẮT BUỘC DÙNG 4 MÃ ENUM):
   - "fully_furnished": Đầy đủ nội thất, full đồ, full nội thất, full option
   - "partially_furnished": Nội thất cơ bản, đồ liền tường, đã có bếp/điều hòa
   - "basic_unfurnished": Hoàn thiện cơ bản, không đồ, nhà trống, chưa có nội thất rời
   - "bare_shell": Bàn giao thô, nhà thô, chưa hoàn thiện trần sàn đèn
   TUYỆT ĐỐI KHÔNG trả về chuỗi tiếng Việt như "Full nội thất", BẮT BUỘC dùng đúng 4 mã enum trên!

4. BẢO TOÀN ĐIỀU KIỆN CẤM & NGÀNH NGHỀ HẠN CHẾ (NEGATIVE CONSTRAINTS):
   - Nếu tin nhắn có ghi chú hạn chế / ngành cấm của chủ nhà như:
     "không làm hàng ăn", "không ăn uống", "không nấu nướng", "không làm spa", "không ở lại", "cấm kinh doanh ăn uống"...
   - BẮT BUỘC PHẢI GIỮ NGUYÊN ĐIỀU KIỆN NÀY trong tóm tắt "key_details" ở cả 3 thứ tiếng:
     * vi: "... (chủ nhà không cho làm hàng ăn / kinh doanh ăn uống)"
     * en: "... (no food & beverage / restaurant businesses allowed)"
     * zh: "... (房东禁止餐饮业)"

5. QUY ĐỔI GIÁ TIỀN & DIỆN TÍCH:
   - "18 triệu/tháng" -> price_amount: 18000000, price_currency: "VND", price_basis: "total", price_period: "month"
   - "200 tr/ tháng" -> price_amount: 200000000, price_currency: "VND", price_basis: "total", price_period: "month"
   - "39 triệu" -> price_amount: 39000000, price_currency: "VND", price_basis: "total", price_period: "month"
   - "180m2 x 8 tầng" -> floor_area_m2: 180, total_lease_area_m2: 1440
   - BẮT BUỘC điền đầy đủ price_amount và floor_area_m2 khi văn bản có dữ liệu.
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
                    assigned_photo_urls: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "Danh sách URL các ảnh thuộc về riêng căn BĐS này",
                    },
                  },
                  required: [
                    "address_text",
                    "property_types",
                    "price_currency",
                    "price_period",
                    "price_basis",
                    "key_details",
                    "assigned_photo_urls",
                  ],
                },
              },
              unassigned_photo_urls: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Các ảnh không chắc chắn thuộc căn nào hoặc cần xác nhận thủ công",
              },
              summary_note: { type: Type.STRING, nullable: true },
            },
            required: ["properties", "unassigned_photo_urls"],
          },
        },
      });

      if (!response || !response.text) {
        throw new Error("Phản hồi từ Gemini API rỗng.");
      }

      return JSON.parse(response.text);
    });

    const rawProps: any[] = parsed.properties || [];
    const assignedClaimed = new Set<string>();
    const sanitizedProps: BatchExtractedProperty[] = [];

    // Hậu kiểm soát chất lượng (Deterministic Sanity Check Gate)
    for (const rawP of rawProps) {
      // 1. Chạy lớp bảo vệ regex tất định về giá, diện tích và điều kiện cấm
      const textContext = `${rawP.source_text_snippet || ""} ${transcript}`;
      const processed = postProcessBatchListing(rawP, textContext);

      // 2. Chặn lỗi rò rỉ ảnh: Đảm bảo không bức ảnh nào bị gán trùng lặp vào 2 căn
      const uniqueAssignedUrls: string[] = [];
      for (const url of processed.assigned_photo_urls || []) {
        if (url && typeof url === "string" && !assignedClaimed.has(url)) {
          assignedClaimed.add(url);
          uniqueAssignedUrls.push(url);
        }
      }
      processed.assigned_photo_urls = uniqueAssignedUrls;
      sanitizedProps.push(processed);
    }

    // 3. Gom các ảnh còn sót trong batch chưa được căn nào nhận vào unassigned_photo_urls
    const unassignedSet = new Set<string>(parsed.unassigned_photo_urls || []);
    for (const photoUrl of allBatchPhotoUrls) {
      if (!assignedClaimed.has(photoUrl)) {
        unassignedSet.add(photoUrl);
      }
    }

    return {
      properties: sanitizedProps,
      unassigned_photo_urls: Array.from(unassignedSet),
      summary_note: parsed.summary_note,
    };
  } catch (err: any) {
    console.error("[Batch Extraction] Lỗi bóc tách hội thoại toàn cảnh:", err);
    throw err;
  }
}

/**
 * Lớp bảo vệ hậu xử lý tất định cho từng căn trong Batch
 */
function postProcessBatchListing(prop: any, text: string): BatchExtractedProperty {
  const combined = `${prop.source_text_snippet || ""} ${text} ${prop.key_details?.vi || ""}`;

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
    if (/full\s*(?:nội\s*thất|đồ)/i.test(combined)) {
      prop.handover_condition = "fully_furnished";
    } else if (/bàn\s*giao\s*thô|nhà\s*thô/i.test(combined)) {
      prop.handover_condition = "bare_shell";
    } else if (/không\s*đồ|nhà\s*trống|chưa\s*có\s*nội\s*thất/i.test(combined)) {
      prop.handover_condition = "basic_unfurnished";
    }
  }

  // 2. Fallback giá tiền nếu price_amount rỗng
  if (!prop.price_amount || prop.price_amount <= 0) {
    const priceMatch = combined.match(/(?:giá(?: thuê)?|chào)?\s*[:\s]*(\d+(?:[.,]\d+)?)\s*(tr(?:iệu)?|củ|tỷ|k|usd|\$)/i);
    if (priceMatch) {
      const num = parseFloat(priceMatch[1].replace(",", "."));
      const unit = priceMatch[2].toLowerCase();
      if (unit.startsWith("tr") || unit === "củ") {
        prop.price_amount = Math.round(num * 1000000);
        prop.price_currency = "VND";
        prop.price_period = prop.price_period || "month";
        prop.price_basis = prop.price_basis || "total";
        if (!prop.price_text) prop.price_text = `${priceMatch[1]} triệu/tháng`;
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

  // 3. Fallback diện tích đa tầng: "180m2 x 8 tầng"
  if (!prop.floor_area_m2) {
    const multiFloorMatch = combined.match(/(\d+(?:[.,]\d+)?)\s*m2?\s*[x*]\s*(\d+)\s*tầng/i);
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
  const foodBanMatch = combined.match(/không\s*(?:làm\s*)?(?:hàng\s*ăn|ăn\s*uống|kinh\s*doanh\s*ăn\s*uống|quán\s*ăn)/i);
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
