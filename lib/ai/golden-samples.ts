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
