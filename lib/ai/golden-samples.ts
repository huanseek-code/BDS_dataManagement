import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface GoldenSample {
  pattern_type: string;
  raw_message: string;
  expected_extraction: any;
  description?: string;
}

// Bộ mẫu chuẩn dự phòng (Static In-Memory Fallback) đảm bảo luôn sẵn sàng
export const STATIC_GOLDEN_SAMPLES: GoldenSample[] = [
  {
    pattern_type: "appliances_only",
    description: "Tin chỉ liệt kê thiết bị/món đồ, không có từ hiện trạng -> furniture_status để null. Có / tháng rõ ràng -> price_period: 'Theo tháng'",
    raw_message: "Cần cho thuê nhà Shophouse Vinhomes Greenbay, Nam Từ Liêm Có Thang Máy\n- Diện tích: 120m2 x 4 tầng, mặt tiền 6m\n- Giá thuê: 60tr/ tháng\n- Nội thất: Dh, nl, giường, bếp\n- Phù hợp: Văn phòng, ở gia đình, cty",
    expected_extraction: {
      address_text: "Shophouse Vinhomes Greenbay, Nam Từ Liêm",
      price_amount: 60000000,
      price_text: "60tr/ tháng",
      price_period: "Theo tháng",
      furniture_status: null,
      furniture_list: "Dh, nl, giường, bếp",
      key_details: {
        vi: "Shophouse Vinhomes Greenbay, Nam Từ Liêm có thang máy, DT 120m2 x 4 tầng, mặt tiền 6m, giá 60tr/tháng. Đồ đạc: Dh, nl, giường, bếp.",
        en: "Shophouse Vinhomes Greenbay, Nam Tu Liem with elevator, 120m2 x 4 floors, 60m VND/month. Items: AC, water heater, bed, kitchen.",
        zh: "Shophouse Vinhomes Greenbay，120平米x4层，租金6000万/月。家电：空调、热水器、床、厨房。"
      }
    }
  },
  {
    pattern_type: "equipment_only",
    description: "Tin chỉ có điều hòa âm trần, nóng lạnh, thang máy -> furniture_status để null. Có / tháng -> price_period: 'Theo tháng'",
    raw_message: "Vinhome Gardenia Hàm Nghi, Nam Từ Liêm\n- DT: 100m2 x 4 tầng\n- Giá: 60tr/ tháng\n- Thiết bị: Dh âm trần, nl, THANG MÁY\n- Cọc 1 thanh toán 3",
    expected_extraction: {
      address_text: "Vinhome Gardenia Hàm Nghi, Nam Từ Liêm",
      price_amount: 60000000,
      price_text: "60tr/ tháng",
      price_period: "Theo tháng",
      furniture_status: null,
      furniture_list: "Dh âm trần, nl, THANG MÁY",
      key_details: {
        vi: "Vinhome Gardenia Hàm Nghi, Nam Từ Liêm, DT 100m2 x 4 tầng, giá 60tr/tháng. Thiết bị: Dh âm trần, nl, THANG MÁY.",
        en: "Vinhome Gardenia Ham Nghi, Nam Tu Liem, 100m2 x 4 floors, 60m VND/month. Equipment: ceiling AC, water heater, elevator.",
        zh: "Vinhome Gardenia 咸宜，100平米x4层，6000万/月。设备：中央空调、热水器、电梯。"
      }
    }
  },
  {
    pattern_type: "no_furniture_info",
    description: "Tin hoàn toàn không đề cập nội thất -> furniture_status để null. Có tr/ tháng -> price_period: 'Theo tháng'",
    raw_message: "Mặt phố Trần Vỹ - Hồ Tùng Mậu\nDiện tích 180m2 x 8 tầng - 1 hầm\nMặt tiền 9m\nGiá 200 tr/ tháng (có thương lượng)\nKý hợp đồng dài hạn",
    expected_extraction: {
      address_text: "Mặt phố Trần Vỹ - Hồ Tùng Mậu",
      price_amount: 200000000,
      price_text: "200 tr/ tháng (có thương lượng)",
      price_period: "Theo tháng",
      floor_area_m2: 180,
      total_lease_area_m2: 1440,
      furniture_status: null,
      furniture_list: null,
      key_details: {
        vi: "Mặt phố Trần Vỹ - Hồ Tùng Mậu, diện tích 180m2 x 8 tầng, 1 hầm, mặt tiền 9m, giá 200 tr/tháng.",
        en: "Frontage Tran Vy - Ho Tung Mau, 180m2 x 8 floors, 1 basement, 200m VND/month.",
        zh: "陈伟临街-胡松茂，180平米x8层，1地下室，租金2亿/月。"
      }
    }
  },
  {
    pattern_type: "price_no_period",
    description: "Tin chỉ ghi 'Giá thuê: 55tr' KHÔNG có chữ theo tháng hay /tháng -> price_period bắt buộc để null",
    raw_message: "Cho thuê nhà Liền Kề Hàm Nghi, Nam Từ Liêm Có Thang Máy\n\n- Diện tích: 90m2 x 5 tầng\n- Bàn giao: Trần, sàn, điều hòa, thiết bị vệ sinh rất mới, có sẵn nội thất để ở\n- Phù hợp: Để Ở Làm văn phòng, kinh doanh online, studio, trung tâm đào tạo, spa,\n- Giá thuê : 55tr\nLiên hệ:",
    expected_extraction: {
      address_text: "Liền Kề Hàm Nghi, Nam Từ Liêm",
      price_amount: 55000000,
      price_text: "55tr",
      price_period: null,
      price_basis: "Tổng căn",
      floor_area_m2: 90,
      total_lease_area_m2: 450,
      furniture_status: null,
      furniture_list: "Trần, sàn, điều hòa, thiết bị vệ sinh",
      key_details: {
        vi: "Nhà Liền Kề Hàm Nghi, Nam Từ Liêm có thang máy, DT 90m2 x 5 tầng, bàn giao trần sàn điều hòa thiết bị vệ sinh, giá 55tr.",
        en: "Townhouse Ham Nghi, Nam Tu Liem with elevator, 90m2 x 5 floors, AC and sanitary equipment, 55m VND.",
        zh: "咸宜联排别墅带电梯，90平米x5层，带吊顶地板空调卫浴，5500万。"
      }
    }
  },
  {
    pattern_type: "phrase_du_do",
    description: "Nguồn dùng chữ đủ đồ -> furniture_status giữ đúng chữ đủ đồ. Giá '8,5tr' không có chữ tháng -> price_period: null",
    raw_message: "Cho thuê nhanh căn 2N1wc đủ đồ vào luôn toà S3 giá 8,5tr",
    expected_extraction: {
      address_text: "toà S3",
      price_amount: 8500000,
      price_text: "8,5tr",
      price_period: null,
      furniture_status: "đủ đồ",
      furniture_list: null,
      key_details: {
        vi: "Căn 2N1wc toà S3 đủ đồ vào luôn giá 8,5tr.",
        en: "2BR 1WC building S3 fully furnished ready to move in 8.5m VND.",
        zh: "S3栋2房1卫家具齐全随时入住租金850万。"
      }
    }
  },
  {
    pattern_type: "phrase_do_co_ban",
    description: "Nguồn ghi đồ cơ bản: tủ bếp, giường -> furniture_status ghi đồ cơ bản. Giá '8,5tr' không có tháng -> price_period: null",
    raw_message: "- 2N+1 64m2 giá 8,5tr đồ cơ bản: tủ bếp, giường,... S106 Đông Nam - Tây Nam",
    expected_extraction: {
      address_text: "S106",
      price_amount: 8500000,
      price_text: "8,5tr",
      price_period: null,
      floor_area_m2: 64,
      furniture_status: "đồ cơ bản",
      furniture_list: "tủ bếp, giường,...",
      key_details: {
        vi: "Căn 2N+1 64m2 tòa S106 đồ cơ bản (tủ bếp, giường), hướng Đông Nam - Tây Nam, giá 8,5tr.",
        en: "2BR+1 64m2 S106 basic furniture (kitchen cabinet, bed), 8.5m VND.",
        zh: "S106栋2房+1 64平米基础家具（厨柜、床），850万。"
      }
    }
  },
  {
    pattern_type: "phrase_full_do",
    description: "Nguồn ghi full đồ -> furniture_status ghi đúng chữ full đồ. Giá '10,5tr' không có tháng -> price_period: null",
    raw_message: "Tòa: GS6/ 2N2wc 63m\nTầng/view: Tầng thấp/ ban công Đông Nam - Tây Nam / view bể bơi tuyệt đẹp\nNội thất: full đồ\nThanh toán : đóng 3 cọc 1 hoặc 2 cọc 1\nNgày vào: vào luôn\nGiá thuê: 10,5tr\nLh 0938936894",
    expected_extraction: {
      address_text: "Tòa: GS6",
      price_amount: 10500000,
      price_text: "10,5tr",
      price_period: null,
      floor_area_m2: 63,
      furniture_status: "full đồ",
      furniture_list: null,
      key_details: {
        vi: "Tòa GS6 căn 2N2wc 63m tầng thấp view bể bơi, full đồ, đóng 3 cọc 1 hoặc 2 cọc 1, vào luôn, giá 10,5tr.",
        en: "Building GS6 2BR 2WC 63m pool view, fully furnished, 10.5m VND.",
        zh: "GS6栋2房2卫63平米泳池景观，家具齐全，1050万。"
      }
    }
  },
  {
    pattern_type: "appliances_bep_rem",
    description: "Chỉ có bếp rèm -> furniture_status để null, furniture_list ghi có bếp rèm. Giá '9,5 tr mpdv' không có tháng -> price_period: null",
    raw_message: "Tòa i3  2n2w+ có bếp  rèm\ngiá thuê 9,5 tr mpdv\nthời gian vào 1/11\n(Đóng 3) (cọc 1) (hợp đồng 1 năm)\nPhí mô giới 7tr",
    expected_extraction: {
      address_text: "Tòa i3",
      price_amount: 9500000,
      price_text: "9,5 tr mpdv",
      price_period: null,
      furniture_status: null,
      furniture_list: "có bếp rèm",
      key_details: {
        vi: "Tòa i3 căn 2n2w+ có bếp rèm, giá thuê 9,5 tr mpdv, vào 1/11, đóng 3 cọc 1.",
        en: "Building i3 2BR+ with kitchen and curtains, 9.5m VND free service fee.",
        zh: "i3栋2房+带厨房窗帘，租金950万免物业费。"
      }
    }
  },
  {
    pattern_type: "different_floor_areas",
    description: "Nhà nhiều tầng có diện tích mỗi tầng khác nhau -> floor_area_m2 liệt kê cách nhau dấu phẩy '50, 70, 80'. Tổng DT = 200. Giá '39 triệu' không có chữ tháng -> price_period: null",
    raw_message: "Cho thuê nhà nguyên căn mặt phố Thi Sách, Quận Hai Bà Trưng\nMô Tả :\n- Mặt phố ô tô tránh nhau, ô tô đỗ cửa, có vỉa hè\n- Phù hợp: Văn phòng, showroom/giới thiệu sản phẩm, trung tâm ngoại ngữ, phòng khám, kinh doanh online... (không làm hàng ăn)\n- Diện tích:\n+ Tầng 1: 50m, thông sàn\n+ Tầng 2: 70m, chia làm 2 phòng\n+ Tầng 3: 80m, thông sàn\n- Mặt tiền: 4.5m\n- Nội thất: Điều hòa\n- Điện nước: giá nhà nước\n- Thời gian nhận nhà: nhận luôn\n- Giá thuê: 39 triệu.",
    expected_extraction: {
      address_text: "Mặt phố Thi Sách, Quận Hai Bà Trưng",
      property_types: ["Nhà mặt phố"],
      floor_area_m2: "50, 70, 80",
      total_lease_area_m2: 200,
      price_amount: 39000000,
      price_text: "39 triệu",
      price_period: null,
      price_basis: "Tổng căn",
      furniture_status: null,
      furniture_list: "Điều hòa",
      key_details: {
        vi: "Nhà nguyên căn mặt phố Thi Sách, Hai Bà Trưng, vỉa hè ô tô tránh, DT: T1 50m2, T2 70m2, T3 80m2, tổng 200m2, mặt tiền 4.5m, nội thất điều hòa, giá 39 triệu (chủ nhà không cho làm hàng ăn).",
        en: "Whole townhouse Thi Sach street, Hai Ba Trung, pavement car access, Area: F1 50m2, F2 70m2, F3 80m2, total 200m2, frontage 4.5m, AC, 39m VND (no F&B allowed).",
        zh: "施策街整栋临街房，海婆徵郡，人行道可避让车辆，面积：1层50平米、2层70平米、3层80平米，总200平米，门宽4.5米，带空调，租金3900万（房东禁止餐饮业）。"
      }
    }
  },
  {
    pattern_type: "phrase_full_go",
    description: "Nguồn ghi full gỗ -> furniture_status ghi đúng chữ full gỗ. Giá '11tr' không có tháng -> price_period: null",
    raw_message: "- S203 full gỗ 2N+1 giá 11tr - ngày 15/11 vào",
    expected_extraction: {
      address_text: "S203",
      price_amount: 11000000,
      price_text: "11tr",
      price_period: null,
      furniture_status: "full gỗ",
      furniture_list: null,
      key_details: {
        vi: "Tòa S203 căn 2N+1 full gỗ giá 11tr, ngày 15/11 vào.",
        en: "Building S203 2BR+1 full wood interior 11m VND, available Nov 15.",
        zh: "S203栋2房+1全木质家具租金1100万，11月15日入住。"
      }
    }
  },
  {
    pattern_type: "warehouse_per_m2_no_floor_area",
    description: "Kho xưởng chỉ có tổng diện tích (1800m), KHÔNG đề cập số tầng/mỗi tầng -> floor_area_m2: null. Giá '150K / m2' -> price_basis: 'per_m2'. Không có nội thất, hoa hồng, cọc -> tất cả để null.",
    raw_message: "Cho thuê KHO XƯỞNG TIÊU CHUẨN ĐẠI TỪ- GIẢI PHÓNG tổng MB kho DT 1800m có cắt nhỏ : 800m,- đến 1000m\nđường xe công ra vào đỗ cửa kho thoải mái\nKho cao : 8-9m , có 2 cửa kho rộng phù hợp xuất, nhập hàng. PHÁP LÝ CHUẨN\nXuất VAT đầy đủ, có pccc đầy đủ, điện 3 pha, nước sạch\nGIÁ thuê:150K / m2 xuất VAT đầy đủ\n6 cọc 1 hoặc 3 cọc 1, hợp đồng 3 năm trở lên",
    expected_extraction: {
      reasoning: "Kho xưởng tổng diện tích 1800m2, không hề nói diện tích từng tầng hay số tầng -> total_lease_area_m2: 1800, floor_area_m2: null. Giá thuê ghi rõ '150K / m2' -> price_amount: 150000, price_currency: 'VND', price_basis: 'per_m2'. Không có thông tin nội thất, hoa hồng môi giới -> các trường này BẮT BUỘC để null.",
      price_evidence: "150K / m2",
      floor_area_evidence: null,
      furniture_evidence: null,
      address_text: "Đại Từ - Giải Phóng",
      property_types: ["Kho xưởng"],
      floor_area_m2: null,
      total_lease_area_m2: 1800,
      price_amount: 150000,
      price_text: "150K / m2",
      price_currency: "VND",
      price_basis: "per_m2",
      price_period: null,
      lease_term_text: "6 cọc 1 hoặc 3 cọc 1, hợp đồng 3 năm trở lên",
      furniture_status: null,
      furniture_list: null,
      landlord_commission_text: null,
      our_share_percent: null,
      our_share_text: null,
      key_details: {
        vi: "Kho xưởng tiêu chuẩn Đại Từ - Giải Phóng, tổng diện tích 1800m2 có cắt nhỏ 800m - 1000m, kho cao 8-9m, điện 3 pha, PCCC, giá thuê 150K/m2.",
        en: "Standard warehouse Dai Tu - Giai Phong, total area 1800m2 split 800-1000m, height 8-9m, 3-phase power, fire safety, rent 150K VND/m2.",
        zh: "大慈-解放标准仓库，总面积1800平米可分割800-1000平米，高8-9米，三相电，消防合规，租金150K/平米。"
      }
    }
  },
  {
    pattern_type: "minimal_apartment_missing_fields",
    description: "Tin nhắn cực ngắn chỉ có địa chỉ, diện tích và giá -> Toàn bộ trường thiếu (quận, phường, tầng, nội thất, hoa hồng, cọc, kỳ hạn) BẮT BUỘC ĐỂ NULL.",
    raw_message: "Cho thuê căn hộ ngõ 104 Đào Tấn, dt 60m, giá 12tr",
    expected_extraction: {
      reasoning: "Căn hộ diện tích 60m không chia tầng -> total_lease_area_m2: 60, floor_area_m2: null. Giá 12tr không có chữ theo tháng hay năm -> price_amount: 12000000, price_currency: 'VND', price_basis: 'total', price_period: null. Các trường quận, phường, nội thất, hoa hồng, hợp đồng không được nhắc tới -> BẮT BUỘC ĐỂ NULL.",
      price_evidence: "12tr",
      floor_area_evidence: null,
      furniture_evidence: null,
      address_text: "ngõ 104 Đào Tấn",
      property_types: ["Căn hộ"],
      floor_area_m2: null,
      total_lease_area_m2: 60,
      price_amount: 12000000,
      price_text: "12tr",
      price_currency: "VND",
      price_basis: "total",
      price_period: null,
      lease_term_text: null,
      furniture_status: null,
      furniture_list: null,
      landlord_commission_text: null,
      our_share_percent: null,
      our_share_text: null,
      key_details: {
        vi: "Căn hộ ngõ 104 Đào Tấn, diện tích 60m2, giá 12tr.",
        en: "Apartment alley 104 Dao Tan, 60m2, price 12m VND.",
        zh: "桃晋104弄公寓，面积60平米，租金1200万。"
      }
    }
  },
  {
    pattern_type: "townhouse_multi_floor_with_commission",
    description: "Nhà phố có số tầng rõ ràng (60m2 x 5 tầng) -> floor_area_m2: '60', total_lease_area_m2: 300. Có hoa hồng và cọc rõ ràng.",
    raw_message: "Cho thuê nhà mặt phố Nguyễn Khang, Cầu Giấy. Diện tích 60m2 x 5 tầng, mặt tiền 5m. Giá 35tr/tháng. Đóng 3 cọc 1, hợp đồng 3 năm. Hoa hồng 1 tháng bên mình 50%.",
    expected_extraction: {
      reasoning: "Nhà 5 tầng nói rõ 60m2 x 5 tầng -> diện tích mỗi tầng floor_area_m2: '60', tổng diện tích total_lease_area_m2: 300 (60 x 5). Giá 35tr/tháng trọn căn -> price_basis: 'total', price_period: 'Theo tháng'. Hoa hồng '1 tháng bên mình 50%' -> landlord_commission_text: '1 tháng bên mình 50%', our_share_percent: 50. Không có thông tin nội thất đồ đạc -> furniture_status: null, furniture_list: null.",
      price_evidence: "35tr/tháng",
      floor_area_evidence: "60m2 x 5 tầng",
      furniture_evidence: null,
      address_text: "Mặt phố Nguyễn Khang, Cầu Giấy",
      property_types: ["Nhà mặt phố"],
      floor_area_m2: "60",
      total_lease_area_m2: 300,
      price_amount: 35000000,
      price_text: "35tr/tháng",
      price_currency: "VND",
      price_basis: "total",
      price_period: "Theo tháng",
      lease_term_text: "Đóng 3 cọc 1, hợp đồng 3 năm",
      furniture_status: null,
      furniture_list: null,
      landlord_commission_text: "1 tháng bên mình 50%",
      our_share_percent: 50,
      our_share_text: "bên mình 50%",
      key_details: {
        vi: "Nhà mặt phố Nguyễn Khang, Cầu Giấy, DT 60m2 x 5 tầng, tổng 300m2, mặt tiền 5m, giá 35tr/tháng. HĐ 3 năm, cọc 1 đóng 3. Hoa hồng 1 tháng bên mình 50%.",
        en: "Frontage Nguyen Khang, Cau Giay, 60m2 x 5 floors, total 300m2, 5m frontage, 35m VND/month. 3-yr lease, deposit 1 pay 3. Commission 1 month 50%.",
        zh: "阮康临街房，纸桥郡，60平米x5层，总300平米，门宽5米，租金3500万/月。合同3年，押1付3。佣金1个月我方50%。"
      }
    }
  },
  {
    pattern_type: "retail_with_negative_constraints",
    description: "Mặt bằng kinh doanh 1 tầng không chia sàn -> floor_area_m2: null. Có điều kiện cấm (không làm hàng ăn, cafe) -> bảo tồn nguyên vẹn.",
    raw_message: "Mặt bằng kinh doanh tầng 1 phố Huế, DT 80m thông sàn. Giá thuê 45tr/tháng. Cọc 2 thanh toán 3. CẤM KINH DOANH ĂN UỐNG, không làm hàng ăn cafe. Phù hợp thời trang, mỹ phẩm, văn phòng.",
    expected_extraction: {
      reasoning: "Mặt bằng tầng 1 thông sàn 80m -> total_lease_area_m2: 80, floor_area_m2: null (không có nhiều tầng). Giá 45tr/tháng -> price_basis: 'total', price_period: 'Theo tháng'. Có điều kiện cấm rõ: cấm ăn uống, không làm hàng ăn cafe -> đưa vào key_details ở cả 3 thứ tiếng. Không có nội thất đồ đạc -> furniture_status: null, furniture_list: null.",
      price_evidence: "45tr/tháng",
      floor_area_evidence: null,
      furniture_evidence: null,
      address_text: "Mặt bằng kinh doanh tầng 1 phố Huế",
      property_types: ["Mặt bằng"],
      floor_area_m2: null,
      total_lease_area_m2: 80,
      price_amount: 45000000,
      price_text: "45tr/tháng",
      price_currency: "VND",
      price_basis: "total",
      price_period: "Theo tháng",
      lease_term_text: "Cọc 2 thanh toán 3",
      furniture_status: null,
      furniture_list: null,
      landlord_commission_text: null,
      our_share_percent: null,
      our_share_text: null,
      key_details: {
        vi: "Mặt bằng tầng 1 phố Huế, DT 80m thông sàn, giá 45tr/tháng. Cọc 2 thanh toán 3. CẤM KINH DOANH ĂN UỐNG, không làm hàng ăn cafe.",
        en: "Ground floor retail Hue street, 80m2 open space, 45m VND/month. Deposit 2 pay 3. NO F&B, no food or coffee.",
        zh: "顺化街1层商铺，面积80平米通铺，租金4500万/月。押2付3。禁止餐饮业、咖啡馆。"
      }
    }
  },
  {
    pattern_type: "office_per_m2_usd",
    description: "Văn phòng báo giá bằng USD theo m2 (12$/m2/tháng) -> price_currency: 'USD', price_basis: 'per_m2', floor_area_m2: null.",
    raw_message: "Tòa nhà văn phòng phố Duy Tân, Cầu Giấy. Trống sàn tầng 7 DT 250m2, giá 12$/m2/tháng. Bàn giao trần sàn điều hòa trung tâm. HĐ tối thiểu 2 năm.",
    expected_extraction: {
      reasoning: "Sàn văn phòng tầng 7 diện tích 250m2 -> total_lease_area_m2: 250, floor_area_m2: null. Giá 12$/m2/tháng -> đơn vị USD, tính theo mét vuông -> price_amount: 12, price_currency: 'USD', price_basis: 'per_m2', price_period: 'Theo tháng'. Bàn giao trần sàn điều hòa -> furniture_list: 'trần sàn điều hòa trung tâm', furniture_status: null. Không có hoa hồng -> để null.",
      price_evidence: "12$/m2/tháng",
      floor_area_evidence: null,
      furniture_evidence: "trần sàn điều hòa trung tâm",
      address_text: "Tòa nhà văn phòng phố Duy Tân, Cầu Giấy",
      property_types: ["Văn phòng"],
      floor_area_m2: null,
      total_lease_area_m2: 250,
      price_amount: 12,
      price_text: "12$/m2/tháng",
      price_currency: "USD",
      price_basis: "per_m2",
      price_period: "Theo tháng",
      lease_term_text: "HĐ tối thiểu 2 năm",
      furniture_status: null,
      furniture_list: "trần sàn điều hòa trung tâm",
      landlord_commission_text: null,
      our_share_percent: null,
      our_share_text: null,
      key_details: {
        vi: "Văn phòng Duy Tân, Cầu Giấy tầng 7, DT 250m2, giá 12$/m2/tháng. Bàn giao trần sàn điều hòa trung tâm, HĐ tối thiểu 2 năm.",
        en: "Office Duy Tan, Cau Giay 7th floor, 250m2, rent 12 USD/m2/month. Central AC, ceiling, floor, min 2-yr contract.",
        zh: "维新写字楼，纸桥郡7层，250平米，租金12美元/平米/月。交付中央空调吊顶地板，合同至少2年。"
      }
    }
  }
];

/**
 * Lấy các mẫu chuẩn từ Database (hoặc fallback bộ mẫu tĩnh)
 */
export async function getGoldenSamplesForPrompt(): Promise<string> {
  let samples: GoldenSample[] = STATIC_GOLDEN_SAMPLES;

  try {
    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from("ai_golden_samples")
      .select("pattern_type, raw_message, expected_extraction, description")
      .limit(10);

    if (!error && Array.isArray(data) && data.length > 0) {
      samples = data as unknown as GoldenSample[];
    }
  } catch {
    // Sử dụng STATIC_GOLDEN_SAMPLES nếu lỗi kết nối
  }

  let text = "\n--- CÁC VÍ DỤ MẪU CHUẨN ĐỐI CHIẾU (FEW-SHOT GOLDEN EXAMPLES - HÃY HỌC THEO PHONG CÁCH NÀY) ---\n";
  samples.forEach((s, idx) => {
    text += `\n[VÍ DỤ ${idx + 1}] (${s.description || s.pattern_type}):\n`;
    text += `TIN NHẮN GỐC:\n${s.raw_message}\n`;
    text += `KẾT QUẢ BÓC TÁCH CHUẨN:\n${JSON.stringify(s.expected_extraction, null, 2)}\n`;
  });

  return text;
}

/**
 * CHỐT CHẶN XÁC THỰC CHUỖI CON NGUYÊN BẢN (Zero-Hallucination Substring Verifier)
 * Bất kỳ từ ngữ nào AI trả về ở furniture_status hoặc furniture_list,
 * hàm này kiểm tra xem từ đó CÓ THỰC SỰ XUẤT HIỆN trong tin nhắn gốc không.
 * Nếu AI tự chế ra từ không có trong tin gốc -> Tự động loại bỏ về null.
 */
export function verifyVerbatimSpan(extractedPhrase: string | null | undefined, rawText: string): string | null {
  if (!extractedPhrase || typeof extractedPhrase !== "string") return null;
  const trimmed = extractedPhrase.trim();
  if (!trimmed || trimmed.toLowerCase() === "chưa rõ" || trimmed.toLowerCase() === "null") return null;

  // Kiểm tra xem chuỗi có xuất hiện trong tin nhắn gốc không (bỏ qua hoa thường)
  if (rawText.toLowerCase().includes(trimmed.toLowerCase())) {
    return trimmed;
  }

  // Nếu không xuất hiện nguyên vẹn, kiểm tra xem có từng từ riêng lẻ có trong text không
  // (ví dụ "Dh, nl, giường, bếp" từng item có trong text)
  const items = trimmed.split(/[,;\n]+/).map(i => i.trim()).filter(Boolean);
  if (items.length > 0 && items.every(i => rawText.toLowerCase().includes(i.toLowerCase()))) {
    return trimmed;
  }

  // Đây là chữ AI tự sáng tạo không có trong tin gốc -> Loại bỏ về null!
  return null;
}

/**
 * CHỐT CHẶN XÁC THỰC KỲ HẠN GIÁ NGUYÊN BẢN (Zero-Extrapolation Price Period Verifier)
 * Chỉ công nhận kỳ hạn ("Theo tháng" / "Theo năm" / "Một lần") nếu tin nhắn
 * thực sự có từ ngữ thể hiện kỳ hạn (ví dụ: "/tháng", "tr/tháng", "triệu/tháng", "tr/th", "/th", "theo tháng", "/năm", "bán"...).
 * Nếu tin nhắn chỉ ghi "Giá thuê: 55tr", "giá 8,5tr", "12 triệu" mà KHÔNG có chữ theo tháng -> Bắt buộc trả về null!
 */
export function detectPricePeriod(
  priceText: string | null | undefined,
  rawText: string | null | undefined
): "Theo tháng" | "Theo năm" | "Một lần" | null {
  const pText = (priceText || "").toLowerCase();
  const rText = (rawText || "").toLowerCase();
  const combined = `${pText} ${rText}`;

  // 1. Kiểm tra kỳ hạn theo năm
  if (
    /\btheo\s+năm\b|\btheo\s+nam\b|\/\s*năm\b|\/\s*nam\b|\btr(?:iệu)?\s*\/\s*năm\b|\bhàng\s+năm\b|\bmỗi\s+năm\b/i.test(combined)
  ) {
    return "Theo năm";
  }

  // 2. Kiểm tra kỳ hạn một lần (bán / mua đứt)
  if (
    /\bmột\s+lần\b|\bmua\s+đứt\b|\bchuyển\s+nhượng\b|\bgiá\s+bán\b|\bbán\s+đứt\b/i.test(combined)
  ) {
    return "Một lần";
  }

  // 3. Kiểm tra kỳ hạn theo tháng
  // CÁC TRƯỜNG HỢP CÓ TỪ CHỈ KỲ HẠN THÁNG RÕ RÀNG:
  // - "/tháng", "/ tháng", "/thang", "/ thang"
  // - "tr/tháng", "triệu/tháng", "tr/thang", "triệu/thang"
  // - "tr/th", "/th", "/ th"
  // - "theo tháng", "theo thang"
  // - "mỗi tháng", "hàng tháng"
  // - "1 tháng" đi kèm giá: ví dụ "50tr / 1 tháng"
  if (
    /\btheo\s+tháng\b|\btheo\s+thang\b|\/\s*tháng\b|\/\s*thang\b|\btr(?:iệu)?\s*\/\s*tháng\b|\btr(?:ieu)?\s*\/\s*thang\b|\btr\s*\/\s*th\b|\/\s*th\b|\bhàng\s+tháng\b|\bmỗi\s+tháng\b|\b(?:\d+|tr(?:iệu)?)\s*\/\s*1\s*tháng\b/i.test(
      combined
    )
  ) {
    return "Theo tháng";
  }

  // Nếu trong câu rút gọn của giá (priceText) có xuất hiện từ "tháng" (ngoại trừ "thang máy")
  if (pText && /(?:^|[^\wà-ỹ])tháng(?!\s*máy)(?:[^\wà-ỹ]|$)/i.test(pText)) {
    return "Theo tháng";
  }

  // Nếu không có bất kỳ từ ngữ nào chỉ tháng/năm/bán -> Tuyệt đối không tự dịch nghĩa theo tháng!
  return null;
}

/**
 * CHỐT CHẶN BÓC TÁCH DIỆN TÍCH TỪNG TẦNG (Multi-Floor Area Extractor)
 * Nhận diện cấu trúc diện tích từng tầng:
 * Ví dụ:
 *  - Tầng 1: 50m, Tầng 2: 70m, Tầng 3: 80m -> "50, 70, 80"
 *  - Tầng 1: 100m, Tầng 2: 100m -> "100" (các tầng đều nhau)
 *  - T1: 50m2, T2 70m2, T3 80m2 -> "50, 70, 80"
 */
export function extractMultiFloorAreas(
  text: string | null | undefined
): { floorAreaStr: string; totalArea: number } | null {
  if (!text) return null;

  // Regex nhận diện các mẫu:
  // "Tầng 1: 50m", "Tầng 1 - 50m", "Tầng 1 là 50m", "T1: 50m", "T1 50m2", "+ Tầng 1: 50m, thông sàn"
  const floorRegex = /(?:tầng|t)\s*(\d+)[\s:là-]+(\d+(?:[.,]\d+)?)\s*m(?:2|²)?/gi;
  const matches = [...text.matchAll(floorRegex)];

  if (matches.length >= 2) {
    const floorMap = new Map<number, string>();
    for (const m of matches) {
      const fNum = parseInt(m[1], 10);
      const val = m[2].replace(",", ".");
      // Bỏ qua tầng quá lớn vô lý (> 100 tầng) hoặc trùng tầng
      if (!floorMap.has(fNum) && fNum > 0 && fNum <= 100) {
        floorMap.set(fNum, val);
      }
    }

    const sortedFloors = [...floorMap.entries()].sort((a, b) => a[0] - b[0]);
    if (sortedFloors.length >= 2) {
      const values = sortedFloors.map((e) => e[1]);
      const numericValues = values.map((v) => parseFloat(v));
      const allEqual = numericValues.every((v) => v === numericValues[0]);
      const totalArea = Math.round(numericValues.reduce((sum, v) => sum + v, 0) * 100) / 100;

      if (allEqual) {
        return {
          floorAreaStr: values[0],
          totalArea,
        };
      } else {
        return {
          floorAreaStr: values.join(", "),
          totalArea,
        };
      }
    }
  }

  return null;
}

export interface GroundingAuditResult {
  is_verified: boolean;
  citations: {
    price?: string | null;
    floor_area?: string | null;
    furniture?: string | null;
  };
  audit_notes: string[];
}

/**
 * KIỂM TOÁN VIÊN LOGIC ĐỘC LẬP (Deterministic Grounding Auditor)
 * Kiểm tra tính có mặt và độ khớp thực tế của các trường AI bóc tách với đoạn tin nhắn gốc.
 * Không đoán mò, không đè số tùy tiện: Chỉ xác thực bằng chứng và chuẩn hóa logic ràng buộc.
 */
export function auditAndVerifyExtractedProperty(
  prop: any,
  rawSnippet: string
): { prop: any; audit: GroundingAuditResult } {
  const text = (rawSnippet || "").trim();
  const lowerText = text.toLowerCase();
  const audit_notes: string[] = [];

  // 1. Kiểm toán Cơ sở tính giá (Price Basis Audit)
  const priceSnippet = (prop.price_evidence || prop.price_text || "").toLowerCase();
  const hasPerM2 =
    /(?:\/|\/tháng\s*\/|\/th\s*\/|\/tháng\s*|mỗi\s*|trên\s*|theo\s*)\s*m[2²]/i.test(priceSnippet) ||
    /\b(?:\d+k|\d+)\s*\/\s*m[2²]/i.test(priceSnippet) ||
    /\b(?:k|đ|đồng|vnd|usd|\$)\s*\/\s*m[2²]/i.test(priceSnippet) ||
    /(?:\/|\/tháng\s*\/|\/th\s*\/|\/tháng\s*|mỗi\s*|trên\s*|theo\s*)\s*m[2²]/i.test(lowerText) ||
    /\b(?:\d+k|\d+)\s*\/\s*m[2²]/i.test(lowerText);

  if (hasPerM2 || prop.price_basis === "per_m2" || String(prop.price_basis).toLowerCase().includes("m2")) {
    prop.price_basis = "per_m2";
    audit_notes.push("Cơ sở tính giá: Theo m² (phát hiện bằng chứng m² trong tin nhắn)");
  } else {
    prop.price_basis = "total";
  }

  // Chuẩn hóa tiền tệ
  if (!prop.price_currency || prop.price_currency !== "USD") {
    prop.price_currency = "VND";
  }

  // 2. Kiểm toán Diện tích mỗi tầng (Floor-Area Integrity Audit)
  // Chỉ chấp nhận floor_area_m2 khi tin nhắn có nói rõ về số tầng / mỗi tầng / mỗi sàn
  const hasFloorMention = /(?:\d+\s*tầng|mỗi\s*tầng|mỗi\s*sàn|\d+\s*lầu|tầng\s*\d+|sàn\s*\d+|x\s*\d+\s*t\b)/i.test(lowerText);

  if (!hasFloorMention) {
    if (prop.floor_area_m2) {
      audit_notes.push(`Reset floor_area_m2 (${prop.floor_area_m2}) -> null vì tin nhắn không nhắc đến tầng/sàn`);
    }
    prop.floor_area_m2 = null;
  } else {
    // Có nhắc đến tầng: nếu AI gán nhầm floor_area_m2 bằng total_lease_area_m2 mà không phải nhà 1 tầng
    if (
      prop.total_lease_area_m2 &&
      prop.floor_area_m2 &&
      String(prop.floor_area_m2).trim() === String(prop.total_lease_area_m2).trim() &&
      !/(?:nhà\s*1\s*tầng|kho\s*1\s*tầng|1\s*tầng\s*duy\s*nhất)/i.test(lowerText)
    ) {
      prop.floor_area_m2 = null;
      audit_notes.push("Tránh trùng lặp tổng diện tích sang diện tích mỗi tầng -> reset floor_area_m2 về null");
    }
  }

  // 3. Kiểm toán Nội thất nguyên bản (Verbatim Furniture Substring Verification)
  prop.furniture_status = verifyVerbatimSpan(prop.furniture_status, text);
  prop.furniture_list = verifyVerbatimSpan(prop.furniture_list, text) || prop.furniture_list || null;
  prop.handover_condition = prop.furniture_status || null;

  // 4. Kiểm toán điều kiện cấm (Negative Constraints Preservation)
  const foodBanMatch = text.match(/không\s*(?:làm\s*)?(?:hàng\s*ăn|ăn\s*uống|kinh\s*doanh\s*ăn\s*uống|quán\s*ăn)/i);
  if (foodBanMatch && prop.key_details) {
    if (!/không\s*(?:làm\s*)?(?:hàng\s*ăn|ăn\s*uống)/i.test(prop.key_details.vi || "")) {
      prop.key_details.vi = `${prop.key_details.vi ? prop.key_details.vi + ". " : ""}Chủ nhà không cho làm hàng ăn/ăn uống`;
      audit_notes.push("Bảo tồn điều kiện cấm hàng ăn (VI)");
    }
    if (!/no\s*(?:f&b|food|restaurant)/i.test(prop.key_details.en || "")) {
      prop.key_details.en = `${prop.key_details.en ? prop.key_details.en + ". " : ""}No F&B allowed`;
    }
    if (!/禁止餐饮/i.test(prop.key_details.zh || "")) {
      prop.key_details.zh = `${prop.key_details.zh ? prop.key_details.zh + "。" : ""}禁止餐饮`;
    }
  }

  // 5. Làm sạch triệt để các trường thiếu về NULL
  const cleanField = (val: any) => {
    if (val === undefined || val === null) return null;
    const s = String(val).trim();
    if (s === "" || s.toLowerCase() === "null" || s.toLowerCase() === "undefined" || s.toLowerCase() === "chưa rõ") {
      return null;
    }
    return val;
  };

  prop.house_number = cleanField(prop.house_number);
  prop.street_name = cleanField(prop.street_name);
  prop.ward = cleanField(prop.ward);
  prop.district_legacy = cleanField(prop.district_legacy);
  prop.province = cleanField(prop.province);
  prop.price_period = cleanField(prop.price_period);
  prop.lease_term_text = cleanField(prop.lease_term_text);
  prop.landlord_commission_text = cleanField(prop.landlord_commission_text);
  prop.our_share_text = cleanField(prop.our_share_text);
  prop.floor_area_m2 = cleanField(prop.floor_area_m2);
  if (prop.floor_area_m2) prop.floor_area_m2 = String(prop.floor_area_m2);

  // 6. Xây dựng kết quả kiểm toán bằng chứng
  const audit: GroundingAuditResult = {
    is_verified: true,
    citations: {
      price: cleanField(prop.price_evidence) || cleanField(prop.price_text),
      floor_area: cleanField(prop.floor_area_evidence),
      furniture: cleanField(prop.furniture_evidence) || cleanField(prop.furniture_status),
    },
    audit_notes,
  };

  return { prop, audit };
}

