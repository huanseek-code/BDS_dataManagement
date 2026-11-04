import { normalizeVietnameseKey, formatPrice } from "@/lib/utils";

export interface PropertyMatchTarget {
  id?: string;
  code?: string;
  address_text?: string | null;
  total_lease_area_m2?: number | string | null;
  price_amount?: number | string | null;
  partner_name?: string | null;
}

export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  confidence: number; // 0 -> 100
  type: "approved" | "pending";
  matchedItem: PropertyMatchTarget;
  message: string;
  reason: string;
  detail: string;
}

// Danh sách các từ thông dụng (Stopwords) trong địa chỉ BĐS Việt Nam
// Không dùng các từ này để so sánh trùng lặp vì tin nào cũng có
const REAL_ESTATE_STOPWORDS = new Set([
  "nha", "mat", "pho", "duong", "ngo", "ngach", "hem", "ngay", "sat",
  "gan", "canh", "truc", "chinh", "can", "ho", "chung", "cu", "biet",
  "thu", "lien", "ke", "kho", "xuong", "van", "phong", "bang", "toa",
  "tang", "lau", "o", "to", "tranh", "do", "cua", "via", "he", "cho",
  "thue", "ban", "chuyen", "nhuong", "khu", "vuc", "du", "an", "do",
  "thi", "dep", "re", "kinh", "doanh", "sieu", "vip", "gia", "thong",
  "san", "thang", "may", "noi", "that", "dong", "tien", "khach", "san",
  "phu", "hop", "moi", "chinh", "chu", "goc", "2", "3", "4", "5",
  "dat", "dich", "vu", "mbkd", "mb", "dt", "mt"
]);

// Danh sách các từ chỉ cấp Quận / Tỉnh (vùng địa lý rộng)
// Việc chỉ trùng mỗi tên quận (như cùng ở 'Hà Đông' hay 'Cầu Giấy') KHÔNG ĐỦ để kết luận trùng BĐS
const BROAD_GEO_TOKENS = new Set([
  "ha", "noi", "hcm", "sai", "gon", "cau", "giay", "dong", "da", "hoang",
  "mai", "thanh", "xuan", "hai", "ba", "trung", "ba", "dinh", "nam", "tu",
  "liem", "bac", "ha", "dong", "long", "bien", "tay", "ho", "hoan", "kiem"
]);

/**
 * Trích xuất các thực thể định danh cốt lõi từ địa chỉ:
 * 1. Mã tòa nhà / Mã căn (ví dụ: GS6, S106, S203, R3, CT1, A3...)
 * 2. Số nhà (ví dụ: 151, 104, 167, 88...)
 * 3. Tập hợp các từ khóa tên riêng cốt lõi (sau khi lọc bỏ stopwords)
 */
export function extractAddressEntities(rawAddress: string | null | undefined): {
  houseNumber: string | null;
  buildingCode: string | null;
  coreTokens: string[];
  normalizedClean: string;
} {
  if (!rawAddress) {
    return { houseNumber: null, buildingCode: null, coreTokens: [], normalizedClean: "" };
  }

  const rawLower = rawAddress.toLowerCase().trim();

  // 1. Tìm mã tòa nhà / phân khu (vd: GS6, S106, S403, R3, R1.02, HH02, CT1, A3...)
  let buildingCode: string | null = null;
  const buildingMatch = rawAddress.match(/\b([a-zA-Z]{1,3}\s*[-.]?\s*\d{1,4}[a-zA-Z]?)\b/);
  if (buildingMatch) {
    const code = buildingMatch[1].replace(/[\s.-]/g, "").toUpperCase();
    // Loại trừ các từ viết tắt phổ biến không phải mã tòa (như MT, DT, WC, LB, PK, F1)
    if (!["MT", "DT", "WC", "LB", "PK", "F1", "F2", "F3", "MB", "QD", "TT"].includes(code)) {
      buildingCode = code;
    }
  }

  // 2. Tìm số nhà (vd: số 151, số 104, ngõ 104, 151 Định Công...)
  let houseNumber: string | null = null;
  const houseMatch = rawLower.match(/(?:số|ngõ|ngách|nhà)?\s*(\d+[a-zA-Z]?)\s*(?:phố|đường|ngõ|[\s,-]|$)/);
  if (houseMatch && !buildingCode) {
    const num = houseMatch[1].toUpperCase();
    // Bỏ qua các số diện tích hoặc số tầng (ví dụ 100m, 4 tầng)
    if (!rawLower.includes(`${num}m`) && !rawLower.includes(`${num} tầng`)) {
      houseNumber = num;
    }
  }

  // 3. Chuẩn hóa bỏ dấu và lọc stopwords
  const unaccented = normalizeVietnameseKey(rawAddress);
  const words = unaccented.split(/\s+/).filter(Boolean);
  const coreTokens = words.filter((w) => w.length >= 2 && !REAL_ESTATE_STOPWORDS.has(w));

  return {
    houseNumber,
    buildingCode,
    coreTokens,
    normalizedClean: coreTokens.join(" "),
  };
}

/**
 * Tính toán độ tương đồng giữa 2 địa chỉ BĐS
 * Trả về 0 -> 100
 */
export function computeAddressSimilarity(addrA: string, addrB: string): {
  similarity: number;
  isHardMismatch: boolean;
  mismatchReason?: string;
} {
  const entA = extractAddressEntities(addrA);
  const entB = extractAddressEntities(addrB);

  // Nếu cả 2 đều có mã tòa nhà (ví dụ GS6 vs S203) mà KHÁC NHAU -> KHÔNG BAO GIỜ TRÙNG
  if (entA.buildingCode && entB.buildingCode && entA.buildingCode !== entB.buildingCode) {
    return { similarity: 0, isHardMismatch: true, mismatchReason: `Khác mã tòa nhà (${entA.buildingCode} vs ${entB.buildingCode})` };
  }

  // Nếu cả 2 đều có số nhà (ví dụ 151 vs 180) mà KHÁC NHAU -> KHÔNG BAO GIỜ TRÙNG
  if (entA.houseNumber && entB.houseNumber && entA.houseNumber !== entB.houseNumber) {
    return { similarity: 0, isHardMismatch: true, mismatchReason: `Khác số nhà (${entA.houseNumber} vs ${entB.houseNumber})` };
  }

  if (entA.coreTokens.length === 0 || entB.coreTokens.length === 0) {
    return { similarity: 0, isHardMismatch: false };
  }

  const setA = new Set(entA.coreTokens);
  const setB = new Set(entB.coreTokens);

  // Tính danh sách từ khóa trùng nhau
  const intersectionTokens: string[] = [];
  for (const token of setA) {
    if (setB.has(token)) {
      intersectionTokens.push(token);
    }
  }

  // Nếu có mã tòa nhà hoặc số nhà khớp chính xác tuyệt đối
  const hasExactBuildingMatch = Boolean(
    entA.buildingCode && entB.buildingCode && entA.buildingCode === entB.buildingCode
  );
  const hasExactHouseMatch = Boolean(
    entA.houseNumber && entB.houseNumber && entA.houseNumber === entB.houseNumber
  );

  // Kiểm tra quan trọng: Các từ khớp nhau có phải CHỈ TOÀN là từ chỉ quận/tỉnh diện rộng không?
  // Ví dụ: chỉ cùng ở quận "ha dong" hay "cau giay" mà tên phố/khu vực (Mậu Lương vs Văn Phú) khác biệt -> KHÔNG TRÙNG!
  const hasSpecificStreetMatch = intersectionTokens.some((t) => !BROAD_GEO_TOKENS.has(t));
  if (!hasSpecificStreetMatch && !hasExactBuildingMatch && !hasExactHouseMatch) {
    return {
      similarity: 0,
      isHardMismatch: true,
      mismatchReason: "Chỉ trùng tên quận/huyện diện rộng, khác tên phố/khu vực cụ thể",
    };
  }

  const unionCount = new Set([...entA.coreTokens, ...entB.coreTokens]).size;
  const jaccard = unionCount > 0 ? intersectionTokens.length / unionCount : 0;

  // Tính tỷ lệ bao phủ theo chuỗi con ngắn hơn (Containment Ratio)
  const minLen = Math.min(setA.size, setB.size);
  const containment = minLen > 0 ? intersectionTokens.length / minLen : 0;

  // Phải có ít nhất 2 từ khóa tên riêng khớp nhau (ví dụ: "nguyen" và "khang", hoặc "dai" và "tu")
  // Ngoại lệ: Nếu chuỗi ngắn chỉ có 1 từ riêng cốt lõi (như "Huế") hoặc có mã tòa/số nhà
  if (intersectionTokens.length < 2 && minLen >= 2 && !hasExactBuildingMatch && !hasExactHouseMatch) {
    return { similarity: 0, isHardMismatch: true, mismatchReason: "Không trùng cụm tên đường/địa danh cốt lõi" };
  }

  // Điểm cộng lớn nếu mã tòa hoặc số nhà khớp chính xác
  const exactEntityBonus = hasExactBuildingMatch || hasExactHouseMatch ? 30 : 0;

  let baseScore = 0;
  if (containment >= 0.99) {
    // 100% từ khóa cốt lõi của bên ngắn hơn nằm trọn trong bên kia (vd: 'Huế' trong 'phố Huế Hai Bà Trưng')
    baseScore = 75 + Math.round(jaccard * 20);
  } else {
    baseScore = Math.round(containment * 60 + jaccard * 30);
  }

  const score = Math.min(100, baseScore + exactEntityBonus);
  return { similarity: score, isHardMismatch: false };
}

/**
 * Kiểm tra xem 2 BĐS có khả năng là trùng lặp (Duplicate) không
 */
export function isPotentialDuplicate(
  target: PropertyMatchTarget,
  candidate: PropertyMatchTarget
): { isDuplicate: boolean; confidence: number; reason: string } {
  const addrA = target.address_text || "";
  const addrB = candidate.address_text || "";

  if (!addrA.trim() || !addrB.trim()) {
    return { isDuplicate: false, confidence: 0, reason: "Thiếu địa chỉ để đối soát" };
  }

  // 1. Kiểm tra tương đồng địa chỉ
  const { similarity: addrSim, isHardMismatch, mismatchReason } = computeAddressSimilarity(addrA, addrB);
  if (isHardMismatch || addrSim < 65) {
    return {
      isDuplicate: false,
      confidence: 0,
      reason: mismatchReason || `Độ tương đồng địa chỉ quá thấp (${addrSim}%)`,
    };
  }

  // 2. Kiểm toán Diện tích (nếu cả 2 đều có diện tích)
  const areaA = target.total_lease_area_m2 ? Number(target.total_lease_area_m2) : null;
  const areaB = candidate.total_lease_area_m2 ? Number(candidate.total_lease_area_m2) : null;

  if (areaA && areaB && areaA > 0 && areaB > 0) {
    const areaDiff = Math.abs(areaA - areaB);
    const maxArea = Math.max(areaA, areaB);
    const areaDiffPercent = areaDiff / maxArea;

    // Nếu diện tích chênh lệch trên 15% (ví dụ 400m² vs 260m²) -> BẮT BUỘC KHÔNG TRÙNG
    if (areaDiffPercent > 0.15) {
      return {
        isDuplicate: false,
        confidence: 0,
        reason: `Diện tích khác biệt quá lớn (${areaA}m² vs ${areaB}m², chênh ${(areaDiffPercent * 100).toFixed(0)}%)`,
      };
    }
  }

  // 3. Kiểm toán Giá tiền (nếu cả 2 đều có giá tiền)
  const priceA = target.price_amount ? Number(target.price_amount) : null;
  const priceB = candidate.price_amount ? Number(candidate.price_amount) : null;

  if (priceA && priceB && priceA > 0 && priceB > 0) {
    const priceDiff = Math.abs(priceA - priceB);
    const maxPrice = Math.max(priceA, priceB);
    const priceDiffPercent = priceDiff / maxPrice;

    // Nếu giá chênh lệch trên 20% (ví dụ 32 triệu vs 55 triệu) -> BẮT BUỘC KHÔNG TRÙNG
    if (priceDiffPercent > 0.20) {
      return {
        isDuplicate: false,
        confidence: 0,
        reason: `Mức giá khác biệt quá lớn (chênh ${(priceDiffPercent * 100).toFixed(0)}%)`,
      };
    }
  }

  // 4. Nếu địa chỉ khớp rất cao (>= 75%) và các thông số diện tích/giá (nếu có) không bị mâu thuẫn
  const finalConfidence = Math.min(99, Math.max(70, addrSim));
  return {
    isDuplicate: true,
    confidence: finalConfidence,
    reason: `Trùng khớp tên địa danh/đường phố cốt lõi (${addrSim}%)`,
  };
}

/**
 * Tìm BĐS trùng lặp tiềm năng nhất từ danh sách ứng viên (Kho BĐS hoặc tin Inbox khác)
 */
export function findDuplicateCandidate(
  current: PropertyMatchTarget,
  approvedProperties: PropertyMatchTarget[],
  pendingListings: PropertyMatchTarget[],
  locale: string = "vi"
): DuplicateDetectionResult | null {
  if (!current.address_text || current.address_text.trim().length < 3) {
    return null;
  }

  // 1. Kiểm tra đối chiếu với Kho BĐS chính thức (ưu tiên cao hơn)
  for (const p of approvedProperties) {
    if (p.id && current.id && p.id === current.id) continue;
    const res = isPotentialDuplicate(current, p);
    if (res.isDuplicate && res.confidence >= 70) {
      const code = p.code || `#${p.id?.slice(0, 6) || "BĐS"}`;
      const areaText = p.total_lease_area_m2 ? ` • DT: ${p.total_lease_area_m2}m²` : "";
      const priceText = p.price_amount ? ` • Giá: ${formatPrice(Number(p.price_amount), "VND", locale)}` : "";

      return {
        isDuplicate: true,
        confidence: res.confidence,
        type: "approved",
        matchedItem: p,
        message: `Căn này có thể trùng với BĐS [${code}] đã có trong Kho BĐS`,
        reason: `Căn này có thể trùng với BĐS [${code}] đã có trong Kho BĐS`,
        detail: `${p.address_text}${areaText}${priceText}`,
      };
    }
  }

  // 2. Kiểm tra đối chiếu với các tin khác đang chờ duyệt trong Inbox
  for (const other of pendingListings) {
    if (other.id && current.id && other.id === current.id) continue;
    const res = isPotentialDuplicate(current, other);
    if (res.isDuplicate && res.confidence >= 70) {
      const partnerName = other.partner_name || "đối tác";
      const areaText = other.total_lease_area_m2 ? ` • DT: ${other.total_lease_area_m2}m²` : "";
      const priceText = other.price_amount ? ` • Giá: ${formatPrice(Number(other.price_amount), "VND", locale)}` : "";

      return {
        isDuplicate: true,
        confidence: res.confidence,
        type: "pending",
        matchedItem: other,
        message: `Trùng lặp với một tin chờ duyệt khác từ ${partnerName}`,
        reason: `Trùng lặp với một tin chờ duyệt khác từ ${partnerName}`,
        detail: `${other.address_text}${areaText}${priceText}`,
      };
    }
  }

  return null;
}
