import { normalizeVietnameseKey, formatPrice } from "@/lib/utils";

export interface PropertyMatchTarget {
  id?: string;
  code?: string;
  address_text?: string | null;
  total_lease_area_m2?: number | string | null;
  floor_area_m2?: number | string | null;
  price_amount?: number | string | null;
  house_number?: string | null;
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
  "thang", "may", "noi", "that", "dong", "tien", "khach", "san_nha",
  "phu", "hop", "moi", "chinh", "chu", "goc", "2", "3", "4", "5",
  "dat", "dich", "vu", "mbkd", "mb", "dt", "mt", "kdt", "so"
]);

// Danh sách ghép cặp cấp Quận / Huyện / Tỉnh để không nhầm lẫn với tên phố hoặc phân khu
const COMPOUND_GEO_RULES: [RegExp, string][] = [
  [/\bha noi\b/gi, "geo_hanoi"],
  [/\bho chi minh\b/gi, "geo_hcm"],
  [/\bsai gon\b/gi, "geo_saigon"],
  [/\bcau giay\b/gi, "geo_caugiay"],
  [/\bdong da\b/gi, "geo_dongda"],
  [/\bhoang mai\b/gi, "geo_hoangmai"],
  [/\bthanh xuan\b/gi, "geo_thanhxuan"],
  [/\bhai ba trung\b/gi, "geo_haibatrung"],
  [/\bba dinh\b/gi, "geo_badinh"],
  [/\bnam tu liem\b/gi, "geo_namtuliem"],
  [/\bbac tu liem\b/gi, "geo_bactuliem"],
  [/\bha dong\b/gi, "geo_hadong"],
  [/\blong bien\b/gi, "geo_longbien"],
  [/\btay ho\b/gi, "geo_tayho"],
  [/\bhoan kiem\b/gi, "geo_hoankiem"],
  [/\bhoai duc\b/gi, "geo_hoaiduc"],
  [/\bbac\s*32\b/gi, "route_bac32"],
  [/\bquoc lo\s*32\b/gi, "route_bac32"],
  [/\bql\s*32\b/gi, "route_bac32"],
  [/\bme linh\b/gi, "geo_melinh"],
  [/\bsoc son\b/gi, "geo_socson"],
  [/\bdong anh\b/gi, "geo_donganh"],
  [/\bgia lam\b/gi, "geo_gialam"],
  [/\bthanh tri\b/gi, "geo_thanhtri"],
];

const BROAD_GEO_TOKENS = new Set([
  "geo_hanoi", "geo_hcm", "geo_saigon", "geo_caugiay", "geo_dongda",
  "geo_hoangmai", "geo_thanhxuan", "geo_haibatrung", "geo_badinh",
  "geo_namtuliem", "geo_bactuliem", "geo_hadong", "geo_longbien",
  "geo_tayho", "geo_hoankiem", "geo_hoaiduc", "geo_melinh", "geo_socson",
  "geo_donganh", "geo_gialam", "geo_thanhtri"
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
  alleyNumber: string | null;
  coreTokens: string[];
  normalizedClean: string;
} {
  if (!rawAddress) {
    return { houseNumber: null, buildingCode: null, alleyNumber: null, coreTokens: [], normalizedClean: "" };
  }

  const rawLower = rawAddress.toLowerCase().trim();

  // Loại bỏ các con số diện tích (m2, m) và phép nhân số tầng trước khi trích xuất số nhà và mã tòa
  const cleanForEntities = rawLower
    .replace(/\b\d+\s*(?:m2|m²|m\b)/gi, "")
    .replace(/[xX×]\s*\d+\s*(?:tầng|tang|t\b)?/gi, "")
    .replace(/\b(?:quoc lo|ql|bac|bắc|nam|duong|đường|so|số|ngõ|ngách)\s*\d+/gi, "");

  // 1. Tìm mã tòa nhà / phân khu (vd: GS6, S106, S403, R3, R1.02, HH02, CT1, A3...)
  let buildingCode: string | null = null;
  const buildingMatch = cleanForEntities.match(
    /\b([a-zA-Z]{1,3}\s*[-.]?\s*\d{1,4}(?:[-.]\d{1,4})?[a-zA-Z]?)\b/
  );
  if (buildingMatch) {
    const code = buildingMatch[1].replace(/[\s.-]/g, "").toUpperCase();
    // Loại trừ các từ viết tắt phổ biến không phải mã tòa (như MT, DT, WC, LB, PK, F1, X5...)
    if (
      !["MT", "DT", "WC", "LB", "PK", "F1", "F2", "F3", "MB", "QD", "TT", "M2"].includes(code) &&
      !code.startsWith("X")
    ) {
      buildingCode = code;
    }
  }

  // 2. Tìm số ngõ / ngách / hẻm (vd: ngõ 12, ngách 12/4, hẻm 45...)
  let alleyNumber: string | null = null;
  const alleyMatch = rawLower.match(/(?:ngõ|ngách|hẻm)\s*(\d+(?:\/\d+)*[a-zA-Z]?)/i);
  if (alleyMatch) {
    alleyNumber = alleyMatch[1].toUpperCase();
  }

  // 3. Tìm số nhà (vd: số 151, số 104, 151 Định Công...)
  let houseNumber: string | null = null;
  const houseMatch = cleanForEntities.match(/(?:số|nhà)?\s*(\d+[a-zA-Z]?)\s*(?:phố|đường|[\s,-]|$)/);
  if (houseMatch && !buildingCode) {
    houseNumber = houseMatch[1].toUpperCase();
  }

  // 4. Chuẩn hóa bỏ dấu và lọc stopwords
  let unaccented = normalizeVietnameseKey(rawAddress);
  for (const [regex, replacement] of COMPOUND_GEO_RULES) {
    unaccented = unaccented.replace(regex, replacement);
  }
  const words = unaccented.split(/\s+/).filter(Boolean);
  const coreTokens = words.filter(
    (w) => w.length >= 2 && !REAL_ESTATE_STOPWORDS.has(w) && !/^\d+m[2²]?$/i.test(w)
  );

  return {
    houseNumber,
    buildingCode,
    alleyNumber,
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

  // Nếu cả 2 đều có số ngõ/ngách (ví dụ ngách 12/4 vs ngõ 12) mà KHÁC NHAU -> KHÔNG BAO GIỜ TRÙNG
  if (entA.alleyNumber && entB.alleyNumber && entA.alleyNumber !== entB.alleyNumber) {
    return { similarity: 0, isHardMismatch: true, mismatchReason: `Khác số ngõ/ngách (${entA.alleyNumber} vs ${entB.alleyNumber})` };
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

  // Kiểm tra quan trọng 1: Các từ khớp nhau có phải CHỈ TOÀN là từ chỉ quận/tỉnh diện rộng không?
  // Ví dụ: chỉ cùng ở 'Hà Đông' hay 'Cầu Giấy' mà tên phố/khu vực (Mậu Lương vs Văn Phú) khác biệt -> KHÔNG TRÙNG!
  const hasSpecificStreetMatch = intersectionTokens.some((t) => !BROAD_GEO_TOKENS.has(t));
  if (!hasSpecificStreetMatch && !hasExactBuildingMatch && !hasExactHouseMatch) {
    return {
      similarity: 0,
      isHardMismatch: true,
      mismatchReason: "Chỉ trùng tên quận/huyện diện rộng, khác tên phố/khu vực cụ thể",
    };
  }

  // Kiểm tra quan trọng 2: Bẫy tên đường (ví dụ 'Láng Hạ' vs 'Láng', 'Kim Mã Thượng' vs 'Kim Mã')
  // Các từ định hướng / phân đoạn tên đường (Hạ, Thượng, Mới, Cũ, Nam, Bắc, Đông, Tây)
  // Chỉ kiểm tra bẫy tên đường nếu KHÔNG cùng mã tòa nhà (tránh nhầm lẫn hướng ban công như Đông Nam, Tây Bắc trong cùng tòa)
  if (!hasExactBuildingMatch) {
    const STREET_QUALIFIERS = new Set(["ha", "thuong", "moi", "cu", "nam", "bac", "dong", "tay", "nho", "lon"]);
    for (const q of STREET_QUALIFIERS) {
      if ((setA.has(q) && !setB.has(q)) || (!setA.has(q) && setB.has(q))) {
        return { similarity: 0, isHardMismatch: true, mismatchReason: `Khác biệt định danh tuyến phố (${q.toUpperCase()})` };
      }
    }
  }

  // Kiểm tra quan trọng 3: Cùng Đại đô thị lớn nhưng KHÁC PHÂN KHU (vd: San Hô vs Sao Biển, Khu A vs Khu D)
  const MEGA_PROJECTS = ["vinhomes", "geleximco", "ecopark", "gamuda", "ciputra", "splendora", "starlake"];
  const isMegaA = entA.coreTokens.some(t => MEGA_PROJECTS.includes(t));
  const isMegaB = entB.coreTokens.some(t => MEGA_PROJECTS.includes(t));
  if (isMegaA && isMegaB) {
    const diffA = entA.coreTokens.filter(t => !setB.has(t) && !BROAD_GEO_TOKENS.has(t) && !MEGA_PROJECTS.includes(t));
    const diffB = entB.coreTokens.filter(t => !setA.has(t) && !BROAD_GEO_TOKENS.has(t) && !MEGA_PROJECTS.includes(t));
    if (diffA.length > 0 && diffB.length > 0) {
      return {
        similarity: 0,
        isHardMismatch: true,
        mismatchReason: `Cùng khu đô thị nhưng khác phân khu (${diffA.join(" ")} vs ${diffB.join(" ")})`,
      };
    }
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

  // 2. Kiểm toán Diện tích (nếu có diện tích sàn hoặc tổng diện tích)
  let areaA = target.total_lease_area_m2 ? Number(target.total_lease_area_m2) : null;
  let areaB = candidate.total_lease_area_m2 ? Number(candidate.total_lease_area_m2) : null;

  if (!areaA && target.floor_area_m2) areaA = Number(target.floor_area_m2) || null;
  if (!areaB && candidate.floor_area_m2) areaB = Number(candidate.floor_area_m2) || null;

  // Thử trích xuất diện tích từ chuỗi text nếu vẫn rỗng
  if (!areaA && target.address_text) {
    const mA = target.address_text.match(/(\d+(?:[.,]\d+)?)\s*m(?:2|²)?/i);
    if (mA) areaA = parseFloat(mA[1].replace(",", "."));
  }
  if (!areaB && candidate.address_text) {
    const mB = candidate.address_text.match(/(\d+(?:[.,]\d+)?)\s*m(?:2|²)?/i);
    if (mB) areaB = parseFloat(mB[1].replace(",", "."));
  }

  if (areaA && areaB && areaA > 0 && areaB > 0) {
    const areaDiff = Math.abs(areaA - areaB);
    const maxArea = Math.max(areaA, areaB);
    const areaDiffPercent = areaDiff / maxArea;

    // Nếu diện tích chênh lệch trên 15% (ví dụ 250m² vs 120m², hoặc 400m² vs 260m²) -> BẮT BUỘC KHÔNG TRÙNG
    if (areaDiffPercent > 0.15) {
      return {
        isDuplicate: false,
        confidence: 0,
        reason: `Diện tích khác biệt quá lớn (${areaA}m² vs ${areaB}m², chênh ${(areaDiffPercent * 100).toFixed(0)}%)`,
      };
    }
  }

  // 3. Kiểm toán Giá tiền (nếu cả 2 đều có giá tiền)
  let priceA = target.price_amount ? Number(target.price_amount) : null;
  let priceB = candidate.price_amount ? Number(candidate.price_amount) : null;

  if (priceA && priceB && priceA > 0 && priceB > 0) {
    const priceDiff = Math.abs(priceA - priceB);
    const maxPrice = Math.max(priceA, priceB);
    const priceDiffPercent = priceDiff / maxPrice;

    // Nếu giá chênh lệch trên 20% (ví dụ 38 triệu vs 45 triệu, 32 triệu vs 55 triệu) -> BẮT BUỘC KHÔNG TRÙNG
    if (priceDiffPercent > 0.20) {
      return {
        isDuplicate: false,
        confidence: 0,
        reason: `Mức giá khác biệt quá lớn (chênh ${(priceDiffPercent * 100).toFixed(0)}%)`,
      };
    }
  }

  // Nếu là tên khu đô thị / dự án lớn mà không có số nhà/mã căn và thiếu cả diện tích lẫn giá -> Không báo trùng bừa
  const isUrbanProjectOnly = /(?:kdt|kđt|khu\s*đô\s*thị|vinhomes|lideco|ciputra|starlake|smart\s*city|ocean\s*park)/i.test(target.address_text || "");
  const hasSpecificUnit = Boolean(target.house_number || candidate.house_number);
  if (isUrbanProjectOnly && !hasSpecificUnit && (!areaA || !areaB) && (!priceA || !priceB)) {
    return {
      isDuplicate: false,
      confidence: 0,
      reason: "Cùng khu đô thị nhưng thiếu thông số diện tích/giá cụ thể để xác nhận trùng lặp",
    };
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
