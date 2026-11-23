import assert from "node:assert/strict";
import {
  extractMultiFloorAreas,
  extractPriceFallback,
  extractFurnitureFallback,
  extractLeaseTermFallback,
  extractCommissionFallback,
  auditAndVerifyExtractedProperty,
  enrichKeyDetailsWithStructureAndSuitability,
  normalizeVietnamesePropertyTypes,
  detectPricePeriod,
  expandMultiOptionPropertyListings,
  analyzePriceRangeAndConflicts,
} from "../lib/ai/golden-samples";

interface TestCase {
  id: string;
  group: string;
  title: string;
  rawText: string;
  initialProp?: Record<string, any>;
  verify: (result: any) => void;
}

function runPipeline(rawText: string, initialProp: Record<string, any> = {}) {
  const prop: any = {
    source_text_snippet: rawText,
    address_text: initialProp.address_text || "Địa chỉ test",
    property_types: initialProp.property_types || [],
    floor_area_m2: initialProp.floor_area_m2 ?? null,
    total_lease_area_m2: initialProp.total_lease_area_m2 ?? null,
    price_amount: initialProp.price_amount ?? null,
    price_currency: initialProp.price_currency || "VND",
    price_basis: initialProp.price_basis || "total",
    price_period: initialProp.price_period ?? null,
    price_text: initialProp.price_text ?? null,
    furniture_status: initialProp.furniture_status ?? null,
    furniture_list: initialProp.furniture_list ?? null,
    lease_term_text: initialProp.lease_term_text ?? null,
    landlord_commission_text: initialProp.landlord_commission_text ?? null,
    key_details: initialProp.key_details || { vi: initialProp.vi || "", en: "", zh: "" },
  };

  // 1. Multi-floor area extraction
  const multiFloorAreas = extractMultiFloorAreas(rawText);
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

  // 1b. Single area fallback
  if (!prop.total_lease_area_m2 || prop.total_lease_area_m2 <= 0) {
    const singleAreaMatch = rawText.match(/(?:diện\s*tích|dt|mb|mbkd)?\s*[:\s]*(\d+(?:[.,]\d+)?)\s*m(?:2|²)?/i);
    if (singleAreaMatch) {
      const areaVal = parseFloat(singleAreaMatch[1].replace(",", "."));
      if (areaVal > 5 && areaVal < 50000) {
        prop.total_lease_area_m2 = areaVal;
      }
    }
  }

  // 2. Price fallback
  if (!prop.price_amount || prop.price_amount <= 0) {
    const priceFallback = extractPriceFallback(rawText, prop.key_details?.vi);
    if (priceFallback && priceFallback.amount && priceFallback.amount > 0) {
      prop.price_amount = priceFallback.amount;
      prop.price_currency = priceFallback.currency || "VND";
      prop.price_basis = priceFallback.basis || "total";
      if (priceFallback.period) prop.price_period = priceFallback.period;
      if (!prop.price_text && priceFallback.textSnippet) prop.price_text = priceFallback.textSnippet;
    }
  }

  // 3. Lease term & commission fallback (NOTE: Furniture is AI-first + Validator only; no Regex overwrite!)
  if (!prop.lease_term_text) {
    prop.lease_term_text = extractLeaseTermFallback(rawText);
  }
  if (!prop.landlord_commission_text) {
    prop.landlord_commission_text = extractCommissionFallback(rawText);
  }

  // 4. Audit & Verify (Validator gatekeeper)
  const { prop: audited, audit } = auditAndVerifyExtractedProperty(prop, rawText);
  audited.key_details.grounding_audit = audit;
  audited.key_details = enrichKeyDetailsWithStructureAndSuitability(audited.key_details, rawText);

  // 5. Price period zero-extrapolation
  const detectedPeriod = detectPricePeriod(audited.price_text, rawText);
  audited.price_period = detectedPeriod || null;

  // 6. Property types normalization
  audited.property_types = normalizeVietnamesePropertyTypes(audited.property_types, rawText);

  return audited;
}

const TEST_CASES: TestCase[] = [
  // ================= NHÓM 1: DIỆN TÍCH ĐA TẦNG & ĐỐI CHIẾU MÂU THUẪN =================
  {
    id: "TC01",
    group: "Diện tích & Kết cấu",
    title: "Nhà nguyên căn nhiều tầng đồng nhất + Giá_Thuê có gạch dưới + Tránh bẫy '1 khách' (Kim Mã)",
    rawText: `Cho thuê nhà nguyên căn 5 tầng,ô tô
Địa chỉ: Phố Kim Mã-Ba Đình-Hà Nội
-Diện tích: 55m2 x 5 Tầng
-Gồm: 9 Phòng Ngủ x 5 WC.
1 khách, bếp, sân phơi,
🛋️Nội thất cơ bản : Điều hòa,nóng lạnh,tủ bếp....
-phù hợp hộ gia đình,kd online,văn phòng cty,kho.TT dạy học.....
🚕Giá_Thuê: 22 triệu/tháng (có TL)`,
    initialProp: { furniture_status: "Nội thất cơ bản", furniture_list: "Điều hòa, nóng lạnh, tủ bếp" },
    verify: (res) => {
      assert.equal(res.floor_area_m2, "55");
      assert.equal(res.total_lease_area_m2, 275);
      assert.equal(res.price_amount, 22000000);
      assert.equal(res.price_period, "Theo tháng");
      assert.equal(res.price_basis, "total");
      assert.match(res.furniture_list || "", /Điều hòa/i);
      assert.match(res.key_details.suitable_for || "", /hộ gia đình/i);
    },
  },
  {
    id: "TC02",
    group: "Diện tích & Kết cấu",
    title: "Các tầng trống có diện tích khác nhau, nhiều tầng cùng diện tích (Hoàng Cầu: 70 + 90 + 101x3 = 463m²)",
    rawText: `Cho thuê MB kinh doanh,Văn Phòng
Địa chỉ: Hoàng Cầu-Đống Đa-Hà Nội
-Diện tích các tầng còn trống:
• Tầng 1: 70m²
• Tầng 2: 90m²
• Tầng 3, 4, 7: 101m²/sàn
🛋️Nội thất cơ bản: điều hoà,nóng lạnh,thang máy,🌟PCCC...
💰Giá_thuê: 23,5 triệu/sàn/tháng.`,
    // Giả lập AI trả về chuỗi rút gọn thiếu tầng "70, 90, 101" và tổng sai 261
    initialProp: { floor_area_m2: "70, 90, 101", total_lease_area_m2: 261, price_text: "23,5 triệu/sàn/tháng." },
    verify: (res) => {
      assert.equal(res.floor_area_m2, "70, 90, 101, 101, 101");
      assert.equal(res.total_lease_area_m2, 463);
      assert.equal(res.price_amount, 23500000);
      assert.equal(res.price_basis, "per_floor");
      assert.equal(res.price_period, "Theo tháng");
    },
  },
  {
    id: "TC03",
    group: "Diện tích & Kết cấu",
    title: "Đối chiếu mâu thuẫn dòng DT chung (80m² x 5 tầng = 400m²) và chi tiết từng tầng (T1: 80, T2-5: 60 = 320m² - Trần Duy Hưng)",
    rawText: `Cho Thuê Nhà Mặt Phố Kinh Doanh
Dc: Trần Duy Hưng-Trung Hoà-Cầu Giấy
-Diện tích: 80m² x 5 tầng 
-MT: 5 mét
-Tầng 1 : mbkd + 1 phòng + WC.
-Tầng 2,3,4,5 (60m2): chia 2 phòng + WC
🛋️nội thất cơ bản: điều hoà ,nóng lạnh,
✅phù hợp: lm văn phòng cty,kd online.phòng khám,spa.nhà Hàng, TT dạy học.cửa hàng các loại...
💵Giá_thuê: 60 triệu/tháng`,
    initialProp: { floor_area_m2: "80, 60", total_lease_area_m2: 140 },
    verify: (res) => {
      assert.equal(res.floor_area_m2, "80, 60, 60, 60, 60");
      assert.equal(res.total_lease_area_m2, 320);
      assert.match(res.key_details.vi, /Cần xác nhận diện tích.*400m².*320m²/);
    },
  },
  {
    id: "TC04",
    group: "Diện tích & Kết cấu",
    title: "Đối chiếu mâu thuẫn dòng DT chung (90m² x 4 tầng = 360m²) và chi tiết từng tầng đặt cuối câu (T1-2: 90, T3-4: 60 = 300m² - Khuất Duy Tiến)",
    rawText: `Cho Thuê Nhà Nguyên căn 4 Tầng
Địa Chỉ: Khuất Duy Tiến-Thanh Xuân-HN
-Diện Tích: 90m2 x 4 tầng
-MT: 5 mét
-Tầng 1,2 : chia 2 phòng (90m2)  + WC.
-Tầng 3,4: chia 2 phòng (60m2) + WC
🛋️Nội thất cơ bản: điều hoà,nóng lạnh..
💰Giá_thuê : 50 triệu/Tháng (có TL)`,
    initialProp: { floor_area_m2: "90, 60", total_lease_area_m2: 150 },
    verify: (res) => {
      assert.equal(res.floor_area_m2, "90, 90, 60, 60");
      assert.equal(res.total_lease_area_m2, 300);
      assert.match(res.key_details.vi, /Cần xác nhận diện tích.*360m².*300m²/);
    },
  },
  {
    id: "TC05",
    group: "Diện tích & Kết cấu",
    title: "Diện tích đất vs Diện tích xây dựng riêng (Diện tích: 34m, xd 24m x 3 tầng)",
    rawText: `Cho thuê nhà riêng ngõ thông
- Diện tích: 34m, xd 24m x 3 tầng
- Giá thuê: 12tr/tháng`,
    verify: (res) => {
      assert.equal(res.floor_area_m2, "24");
      assert.equal(res.total_lease_area_m2, 72);
    },
  },

  // ================= NHÓM 2: CÁCH TÍNH GIÁ (TỔNG CĂN / THEO SÀN / THEO M²) & KỲ HẠN =================
  {
    id: "TC06",
    group: "Giá & Cơ sở tính giá",
    title: "Giá theo tầng/sàn không có chữ tháng (Chùa Láng 40 Triệu/Tầng, Thiên Hiền 20triệu/sàn, Nguyễn Chí Thanh 40 triệu/sàn)",
    rawText: `Chính Chủ Cho Thuê Sàn Văn Phòng
📍 Vị trí: Thiên Hiền,Mỹ Đình,Hà Nội
- Diện tích : 100 m2/sàn x 6 tầng + hầm
- Còn Trống Các Tầng: 1,2,5,6
Nội thất cơ bản:
💰Giá_Thuê: 20triệu/sàn`,
    verify: (res) => {
      assert.equal(res.price_amount, 20000000);
      assert.equal(res.price_basis, "per_floor");
      assert.equal(res.price_period, null);
      assert.equal(res.floor_area_m2, "100");
      assert.equal(res.furniture_list, null);
    },
  },
  {
    id: "TC07",
    group: "Giá & Cơ sở tính giá",
    title: "Kho xưởng tính giá theo m² (60k/1m) & Mặt phẳng đơn floor_area_m2 = null",
    rawText: `📢📢📢 Cho Thuê Kho Xưởng diện tích 2000m .Ninh Sở -Thường Tín- Hà Nội.Giá 60k/1m .
- Có văn phòng, hệ bơm công nghiệp pccc
- phù hợp sản xuất những mặt hàng đa dạng`,
    verify: (res) => {
      assert.equal(res.total_lease_area_m2, 2000);
      assert.equal(res.floor_area_m2, null);
      assert.equal(res.price_amount, 60000);
      assert.equal(res.price_basis, "per_m2");
      assert.equal(res.price_period, null);
    },
  },
  {
    id: "TC08",
    group: "Giá & Cơ sở tính giá",
    title: "Giá lẻ viết tắt 13tr500 + Không lấy nhầm phí dịch vụ DV 2.4k/m² + Phân biệt 'k mpdv'",
    rawText: `Cho thuê căn hộ CHCC tòa i3 2n2w+ DT 68m2
✨ Phí dịch vụ rẻ nhất khu vực: DV 2.4k/m², xe máy 45k
giá thuê 13tr500 k mpdv
(Đóng 3) (cọc 1) (hợp đồng 6 tháng) hoặc 1 năm
hh 5 tr`,
    verify: (res) => {
      assert.equal(res.price_amount, 13500000);
      assert.equal(res.price_basis, "total");
      assert.equal(res.price_period, null);
      assert.match(res.key_details.vi, /không miễn phí dịch vụ/i);
      assert.match(res.lease_term_text || "", /Đóng 3/i);
      assert.equal(res.landlord_commission_text, "hh 5 tr");
      assert.ok(res.property_types.includes("Căn hộ chung cư"));
    },
  },

  // ================= NHÓM 3: NỘI THẤT & TÁCH BIỆT BỐ TRÍ PHÒNG =================
  {
    id: "TC09",
    group: "Nội thất & Bố trí phòng",
    title: "Chỉ ghi 'Nội thất cơ bản:' trống phía sau -> Tuyệt đối không sinh 'cơ bản:' trong furniture_list (Trung Kính 60x6)",
    rawText: `🏡 CHO THUÊ NHÀ 6 TẦNG KD
📍Trung Kính,Yên Hòa,Cầu Giấy Hà Nội
-Diện tích: 60m² × 6 tầng
• Tầng 1, 2, 6: Thông sàn + wc
• Tầng 3, 4, 5: Mỗi tầng 2 phòng + wc
-Nội thất cơ bản:
🚗 Đường rộng 11m, ô tô đi lại và đỗ trước cửa thuận tiện
💼 Phù hợp: Văn phòng cty, spa, phòng khám, trung tâm đào tạo
💰Giá_Thuê: 33 Tr/tháng`,
    initialProp: { furniture_status: "Nội thất cơ bản", furniture_list: "cơ bản:" },
    verify: (res) => {
      assert.match(res.furniture_status || "", /cơ bản/i);
      assert.equal(res.furniture_list, null);
    },
  },
  {
    id: "TC10",
    group: "Nội thất & Bố trí phòng",
    title: "Tách biệt bố trí phòng 'Gồm: 4 phòng ngủ x 3 WC, bếp' khỏi nội thất khi 'Không nội thất' (Trần Quốc Hoàn)",
    rawText: `Cho Thuê Nhà Nguyên Căn Mặt Phố
Đc: Trần Quốc Hoàn – Cầu Giấy-Hà Nội
Diện tích: 35m² × 4 tầng, mặt_tiền: 4,2m
Gồm: 4 phòng ngủ x 3 WC, bếp
* Không nội thất
✅ Phù hợp: Văn phòng, kinh doanh online, spa, showroom
💰Giá_thuê: 32 triệu/tháng ( có TL)`,
    initialProp: { furniture_status: "Không nội thất", furniture_list: "4 phòng ngủ, 3 WC, bếp" },
    verify: (res) => {
      assert.match(res.furniture_status || "", /Không nội thất/i);
      assert.equal(res.furniture_list, null);
    },
  },
  {
    id: "TC11",
    group: "Nội thất & Bố trí phòng",
    title: "Bảo tồn ngoại lệ 'full thiếu tv và đệm' và viết tắt '6 cọc 1 hoặc 3 cọc 2'",
    rawText: `Cho thuê căn hộ 2PN 60m2
- Nội thất : full thiếu tv và đệm
- Giá: 11tr5 - nhận nhà ngay
- Hình thức: 6 cọc 1 hoặc 3 cọc 2`,
    initialProp: { furniture_status: "full thiếu tv và đệm" },
    verify: (res) => {
      assert.equal(res.price_amount, 11500000);
      assert.equal(res.furniture_status, "full thiếu tv và đệm");
      assert.match(res.lease_term_text || "", /6 cọc 1 hoặc 3 cọc 2/);
    },
  },
  {
    id: "TC12",
    group: "Nội thất & Bố trí phòng",
    title: "Nhận diện viết tắt thiết bị ghép chữ 'ĐH NL TLẠNH BTỪ MGIẶT GTỦ' và 'đóng 3 cọc 10tr'",
    rawText: `NHÀ RIÊNG MỚI CỨNG NGÕ 32x NGUYỄN TRÃI, DT 45m2 x 4 tầng
♻️ Thiết bị ĐH NL TLẠNH BTỪ MGIẶT GTỦ
💰Giá thuê : 8tr/tháng ( đóng 3 cọc 10tr )`,
    initialProp: { furniture_list: "ĐH, NL, TLẠNH, BTỪ, MGIẶT, GTỦ" },
    verify: (res) => {
      assert.equal(res.price_amount, 8000000);
      assert.match(res.furniture_list || "", /TLẠNH/i);
      assert.match(res.lease_term_text || "", /đóng 3 cọc 10tr/i);
    },
  },
  {
    id: "TC13",
    group: "Nội thất & Bố trí phòng",
    title: "Tin hoàn toàn không nhắc tới nội thất -> furniture_status = null, furniture_list = null",
    rawText: `Cho thuê căn hộ ngõ 104 Đào Tấn, dt 60m, giá 12tr`,
    verify: (res) => {
      assert.equal(res.furniture_status, null);
      assert.equal(res.furniture_list, null);
      assert.equal(res.price_amount, 12000000);
      assert.equal(res.price_period, null);
    },
  },

  // ================= NHÓM 4: KẾT CẤU ĐẶC BIỆT, CÔNG NĂNG & HẠN CHẾ THUÊ =================
  {
    id: "TC14",
    group: "Kết cấu & Hạn chế",
    title: "Zero-Extrapolation tầng hầm (8 tầng + 1 hầm x 90m² = 720m²) + Giữ lại tầng hầm & tầng tum trong tóm tắt",
    rawText: `Cho Thuê Toà Nhà Mới Xây 9 Tầng
Địa chỉ: Mỹ Đình-Nam Từ Liêm -Hà Nội
- Diện tích: 90m2 x 8 Tầng + 1 Hầm
🔻Tầng Hầm: để xe rộng rãi.
🔸Tầng 1,2,3,4,5,6,7,8: Thông Sàn + wc
🔹Tầng Tum: sân phơi
-Phù hợp: văn phòng cty, spa, trung tâm ngoại ngữ
💸Giá_thuê: 125 triệu/tháng`,
    verify: (res) => {
      assert.equal(res.floor_area_m2, "90");
      assert.equal(res.total_lease_area_m2, 720);
      assert.match(res.key_details.vi, /hầm/i);
      assert.match(res.key_details.vi, /tum/i);
      assert.match(res.key_details.vi, /phù hợp/i);
    },
  },
  {
    id: "TC15",
    group: "Kết cấu & Hạn chế",
    title: "Bảo tồn gác xép, sân thượng, chủ giữ lại phòng, KO chdv, ko cho tq và hoa hồng theo kỳ hạn",
    rawText: `Cần cho thuê nhà Phân Lô Trung Kính, Cầu Giấy, DT 50m2 x 4 tầng ( KO chdv)
- Thiết kế: 4PN, 1 gác xép, sân thượng, chủ giữ lại 1 phòng để dạy học
- Cho thuê vp cty kdon ( ko cho tq)
- Phí Môi giới : 1 tháng nếu hđ 2 năm, phí mg 1/2 tháng nếu hđ 1 năm
- Giá thuê: 25tr/tháng`,
    verify: (res) => {
      assert.match(res.key_details.vi, /gác xép/i);
      assert.match(res.key_details.vi, /sân thượng/i);
      assert.match(res.key_details.vi, /chủ giữ lại 1 phòng/i);
      assert.match(res.key_details.vi, /CHDV/i);
      assert.match(res.key_details.vi, /ko cho tq/i);
      assert.match(res.landlord_commission_text || "", /1 tháng nếu hđ 2 năm/i);
    },
  },
  {
    id: "TC16",
    group: "Nội thất & Bố trí phòng (Validator Gatekeeper)",
    title: "Tuyệt đối không bắt nhầm 'thô' trong 'thông sàn' thành 'bàn giao thô' (56 – 58 Hà Trung)",
    rawText: `56 – 58 HÀ TRUNG – HOÀN KIẾM
- Diện tích: 90m2 x 8 tầng + hầm
- Mặt tiền : 8m
- Giá thuê : 200tr/tháng
- HH : 50%
- Thông tin khác : riêng biệt, t1,2 thông sàn, kd mọi mô hình, tt3t, cọc 1, thang máy, vào luôn`,
    initialProp: { furniture_status: "bàn giao thô" },
    verify: (res) => {
      assert.equal(res.furniture_status, null);
      assert.equal(res.furniture_list, null);
      assert.equal(res.total_lease_area_m2, 720);
    },
  },
  {
    id: "TC17",
    group: "Nội thất & Bố trí phòng (Validator Gatekeeper)",
    title: "Bảo tồn nguyên cụm 'Full đồ' và bác bỏ giá + ngày vào ở ('13tr. 1/12 vào') khỏi furniture_list (HD Mon Hàm Nghi)",
    rawText: `Dự án : HD Mon Hàm Nghi
61m2 2PN 2VS.Full đồ 13tr. 1/12 vào
🌹 Phí 50%`,
    initialProp: { furniture_status: "Full", furniture_list: "13tr. 1/12 vào" },
    verify: (res) => {
      assert.equal(res.furniture_status, "Full đồ");
      assert.equal(res.furniture_list, null);
      assert.equal(res.price_amount, 13000000);
    },
  },
  {
    id: "TC18",
    group: "Nội thất & Bố trí phòng (Validator Gatekeeper)",
    title: "Bảo tồn 'full đồ' và bác bỏ '19tr, vào luôn' / '22tr. Vào luôn' khỏi furniture_list (Dcapitale & Sky Lake)",
    rawText: `Dcapitale Trần Duy Hưng C1
70m2 2 ngủ 2wc full đồ 19tr, vào luôn
🌹Phí 1th`,
    initialProp: { furniture_status: "full", furniture_list: "19tr, vào luôn" },
    verify: (res) => {
      assert.equal(res.furniture_status, "full đồ");
      assert.equal(res.furniture_list, null);
      assert.equal(res.price_amount, 19000000);
      assert.equal(res.landlord_commission_text, "Phí 1th");
      assert.equal(res.our_share_text, null);
    },
  },
  {
    id: "TC19",
    group: "Diện tích & Kết cấu (Mỹ Đình 140m2 x 4 tầng)",
    title: "Biệt thự Mỹ Đình 140m² × 4 tầng = 560m²; không tính số thứ tự tầng ('T2-3-4 mỗi tầng 2 phòng') thành diện tích",
    rawText: `CHO THUÊ BIỆT THỰ 4 TẦNG MỚI - MỸ ĐÌNH, NAM TỪ LIÊM
- Giá: 38tr/tháng - Có thương lượng
- 140m2 x 4 tầng, MT 8m.
- T1 thông sàn + WC. 
- T2-3-4 mỗi tầng 2 phòng + WC. 
- Nội thất cơ bản: điều hòa, nóng lạnh.`,
    initialProp: { floor_area_m2: "140, 4, 4", total_lease_area_m2: 148, furniture_status: "Nội thất cơ bản", furniture_list: "điều hòa, nóng lạnh" },
    verify: (res) => {
      assert.equal(res.floor_area_m2, "140");
      assert.equal(res.total_lease_area_m2, 560);
      assert.equal(res.price_amount, 38000000);
      assert.equal(res.furniture_status, "Nội thất cơ bản");
      assert.equal(res.furniture_list, "điều hòa, nóng lạnh");
    },
  },
  {
    id: "TC20",
    group: "Đa phương án thuê (Tây Hồ 4 tầng 240m²/35tr vs 6 tầng+hầm 360m²/45tr)",
    title: "Tách riêng 2 phương án thuê trong cùng 1 tin, không ghép 240m² với 45 triệu",
    rawText: `✅ 60M*6T+ HẦM, THANG MÁY, 35 TRIỆU, RẺ ĐẸP NHẤT TÂY HỒ, CHO THUÊ VP MẶT PHỐ ĐƯỜNG 50M, OTO DỪNG TRÁNH ĐỖ THOẢI MÁI, VỈA HÈ 10M, 0986220001 
- Mặt phố to rộng đẹp nhất Tây Hồ, trục xương sống chính Vành đai 2, chạy thẳng đường Sân bay Nội Bài.
- Tầng 1,2,3,4: 60m : 35 Triệu , Thông sàn
- 60*6 Tầng + Hầm : 45 Triệu
- Điều hòa , Rèm , nóng lạnh các tầng đầy đủ`,
    verify: () => {
      const options = expandMultiOptionPropertyListings(
        { address_text: "Mặt phố Tây Hồ", property_types: ["Nhà mặt phố"], furniture_list: "Điều hòa, Rèm, nóng lạnh" },
        `✅ 60M*6T+ HẦM, THANG MÁY, 35 TRIỆU, RẺ ĐẸP NHẤT TÂY HỒ, CHO THUÊ VP MẶT PHỐ ĐƯỜNG 50M, OTO DỪNG TRÁNH ĐỖ THOẢI MÁI, VỈA HÈ 10M, 0986220001 
- Mặt phố to rộng đẹp nhất Tây Hồ, trục xương sống chính Vành đai 2, chạy thẳng đường Sân bay Nội Bài.
- Tầng 1,2,3,4: 60m : 35 Triệu , Thông sàn
- 60*6 Tầng + Hầm : 45 Triệu
- Điều hòa , Rèm , nóng lạnh các tầng đầy đủ`
      );
      assert.equal(options.length, 2);
      assert.equal(options[0].total_lease_area_m2, 240);
      assert.equal(options[0].price_amount, 35000000);
      assert.equal(options[1].total_lease_area_m2, 360);
      assert.equal(options[1].price_amount, 45000000);
    },
  },
  {
    id: "TC21",
    group: "Khoảng giá & Mâu thuẫn giá Tiêu đề vs Nội dung",
    title: "Mặt phố View Hồ Tây: Tiêu đề 37-40TRIỆU vs Nội dung 35-40 Triệu -> Trung điểm tham khảo 37.5tr + Cảnh báo cần xác nhận",
    rawText: `✅ 100M *3T, MT 6M, 37-40TRIỆU, RẺ NHẤT ,2 MẶT TIỀN, CHO THUÊ MẶT PHỐ VIEW HỒ TÂY
- Cho thuê Mặt phố View Tây Hồ gần Lotte Mall .
- 100m *3 Tầng : 35-40 Triệu`,
    verify: (res) => {
      assert.equal(res.total_lease_area_m2, 300);
      assert.equal(res.floor_area_m2, "100");
      assert.equal(res.price_amount, 37500000);
      assert.equal(res.price_min, 35000000);
      assert.equal(res.price_max, 40000000);
      assert.match(res.price_text || "", /37-40TRIỆU/);
      assert.match(res.price_text || "", /35-40 Triệu/);
      assert.equal(res.key_details.grounding_audit.needs_confirmation, true);
    },
  },
  {
    id: "TC22",
    group: "Quy tắc Hoa hồng mới (Không nhân bản 2 ô, để trống phần chia Huanseek khi chưa rõ bên nhận)",
    title: "56-58 Hà Trung: 'HH : 50%' -> Giữ câu gốc ở ô 1, để trống our_share_text và bật needs_confirmation",
    rawText: `56 – 58 HÀ TRUNG – HOÀN KIẾM
- Diện tích: 90m2 x 8 tầng + hầm
- Mặt tiền : 8m 
- Giá thuê : 200tr/tháng
- HH : 50%
- Thông tin khác : riêng biệt, t1,2 thông sàn, kd mọi mô hình, tt3t, cọc 1, thang máy, vào luôn`,
    initialProp: { landlord_commission_text: "HH : 50%", our_share_text: "HH : 50%" },
    verify: (res) => {
      assert.equal(res.landlord_commission_text, "HH : 50%");
      assert.equal(res.our_share_text, null);
      assert.equal(res.furniture_status, null);
      assert.equal(res.key_details.grounding_audit.needs_confirmation, true);
    },
  },
  {
    id: "TC23",
    group: "Giá kép (Hàng 1 Tổng giá + Hàng 2 Giá theo phòng) & Giữ điều kiện phí 'khi giao dịch thành công'",
    title: "Khu VIP Tây Hồ: '4tr1/p (49,2tr)' -> Hàng 1: 49,2 triệu (Tổng căn) + Hàng 2: 4,1 triệu (Theo phòng) & Giữ nguyên 'Phí khách: 15tr. khi giao dịch thành công'",
    rawText: `NHƯỢNG NHÀ NGHỈ Ở KHU VÍP TÂY HỒ
- Diện tích: 79m2 x 5 tầng
- Tổng: 12pkk
- Nội thất: đầy đủ nhà nghỉ
- Giá thuê: 4tr1/p (49,2tr)
- HĐ: 6 năm cọc 1 thanh toán 6
- Giá Nhượng: 150tr
- Phí khách: 15tr. khi giao dịch thành công`,
    // Giả lập AI cắt cụt mất đuôi ". khi giao dịch thành công"
    initialProp: { landlord_commission_text: "Phí khách: 15tr", furniture_status: "đầy đủ nhà nghỉ" },
    verify: (res) => {
      assert.equal(res.price_amount, 49200000);
      assert.equal(res.price_basis, "total");
      assert.equal(res.secondary_price_amount, 4100000);
      assert.equal(res.secondary_price_basis_text, "Theo phòng");
      assert.equal(res.landlord_commission_text, "Phí khách: 15tr. khi giao dịch thành công");
      assert.equal(res.our_share_text, null);
    },
  },
];

let passed = 0;
let failed = 0;

console.log("==================================================================");
console.log("🚀 CHẠY BỘ KIỂM THỬ TOÀN DIỆN (15 TEST CASES TỔNG HỢP)");
console.log("==================================================================\n");

for (const tc of TEST_CASES) {
  try {
    const result = runPipeline(tc.rawText, tc.initialProp);
    tc.verify(result);
    passed++;
    console.log(`✅ [${tc.id}] (${tc.group}) ${tc.title}`);
  } catch (err: any) {
    failed++;
    console.error(`❌ [${tc.id}] THẤT BẠI: ${tc.title}`);
    console.error("   Lỗi:", err.message);
  }
}

console.log("\n==================================================================");
console.log(`🎯 KẾT QUẢ: ${passed}/${TEST_CASES.length} PASS | ${failed} FAIL`);
console.log("==================================================================");

if (failed > 0) {
  process.exit(1);
}
