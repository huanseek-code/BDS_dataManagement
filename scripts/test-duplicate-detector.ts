import { isPotentialDuplicate, computeAddressSimilarity, extractAddressEntities } from "../lib/utils/duplicate-detector";

interface TestCase {
  name: string;
  target: {
    address_text: string;
    total_lease_area_m2?: number | null;
    price_amount?: number | null;
  };
  candidate: {
    address_text: string;
    total_lease_area_m2?: number | null;
    price_amount?: number | null;
  };
  expectedDuplicate: boolean;
  expectedReasonKeyword?: string;
}

const testCases: TestCase[] = [
  {
    name: "Ca lỗi người dùng báo (Ảnh 1 vs Ảnh 2): Nguyễn Khang 400m2 32tr vs Vũ Đức Thận 260m2 55tr",
    target: {
      address_text: "ngay sát mặt phố Nguyễn Khang - Cầu Giấy",
      total_lease_area_m2: 400,
      price_amount: 32000000,
    },
    candidate: {
      address_text: "Nhà mặt phố Vũ Đức Thận LB",
      total_lease_area_m2: 260,
      price_amount: 55000000,
    },
    expectedDuplicate: false,
  },
  {
    name: "Hai mặt phố khác nhau có từ 'mặt phố': Chùa Bộc vs Thi Sách",
    target: {
      address_text: "Mặt phố Chùa Bộc, Đống Đa",
      total_lease_area_m2: 300,
      price_amount: 50000000,
    },
    candidate: {
      address_text: "Mặt phố Thi Sách, Hai Bà Trưng",
      total_lease_area_m2: 200,
      price_amount: 39000000,
    },
    expectedDuplicate: false,
  },
  {
    name: "Cùng khu đô thị nhưng KHÁC MÃ TÒA: GS6 vs S203",
    target: {
      address_text: "Tòa GS6 Vinhomes Smart City",
      total_lease_area_m2: 63,
      price_amount: 10500000,
    },
    candidate: {
      address_text: "Tòa S203 Vinhomes Smart City",
      total_lease_area_m2: 63,
      price_amount: 11000000,
    },
    expectedDuplicate: false,
    expectedReasonKeyword: "tòa nhà",
  },
  {
    name: "Cùng tên đường nhưng KHÁC SỐ NHÀ: 151 Định Công vs 180 Định Công",
    target: {
      address_text: "151 Định Công, Hoàng Mai",
      total_lease_area_m2: 70,
      price_amount: 15000000,
    },
    candidate: {
      address_text: "180 Định Công, Hoàng Mai",
      total_lease_area_m2: 70,
      price_amount: 15000000,
    },
    expectedDuplicate: false,
    expectedReasonKeyword: "số nhà",
  },
  {
    name: "Cùng tên đường nhưng DIỆN TÍCH LỆCH QUÁ LỚN: 60m2 vs 400m2",
    target: {
      address_text: "Mặt phố Nguyễn Khang, Cầu Giấy",
      total_lease_area_m2: 60,
      price_amount: 25000000,
    },
    candidate: {
      address_text: "Mặt phố Nguyễn Khang, Cầu Giấy",
      total_lease_area_m2: 400,
      price_amount: 32000000,
    },
    expectedDuplicate: false,
    expectedReasonKeyword: "Diện tích",
  },
  {
    name: "Cùng địa chỉ nhưng GIÁ TIỀN LỆCH QUÁ LỚN: 15tr vs 60tr",
    target: {
      address_text: "Mặt phố Nguyễn Khang, Cầu Giấy",
      total_lease_area_m2: 100,
      price_amount: 15000000,
    },
    candidate: {
      address_text: "Mặt phố Nguyễn Khang, Cầu Giấy",
      total_lease_area_m2: 100,
      price_amount: 60000000,
    },
    expectedDuplicate: false,
    expectedReasonKeyword: "giá",
  },
  {
    name: "TRÙNG LẶP THỰC TẾ 1: Kho xưởng Đại Từ - Giải Phóng 1800m2 viết khác phong cách",
    target: {
      address_text: "Cho thuê KHO XƯỞNG TIÊU CHUẨN ĐẠI TỪ- GIẢI PHÓNG",
      total_lease_area_m2: 1800,
      price_amount: 150000,
    },
    candidate: {
      address_text: "Đại Từ - Giải Phóng",
      total_lease_area_m2: 1800,
      price_amount: 150000,
    },
    expectedDuplicate: true,
  },
  {
    name: "TRÙNG LẶP THỰC TẾ 2: Căn hộ cùng tòa, cùng diện tích và giá tương đồng (S106 64m2 8,5tr)",
    target: {
      address_text: "Tòa S106 căn 2N+1",
      total_lease_area_m2: 64,
      price_amount: 8500000,
    },
    candidate: {
      address_text: "S106 Đông Nam",
      total_lease_area_m2: 64,
      price_amount: 8500000,
    },
    expectedDuplicate: true,
  },
  {
    name: "TRÙNG LẶP THỰC TẾ 3: Nhà phố Thi Sách 200m 39tr đăng lại",
    target: {
      address_text: "Mặt phố Thi Sách, Quận Hai Bà Trưng",
      total_lease_area_m2: 200,
      price_amount: 39000000,
    },
    candidate: {
      address_text: "Thi Sách, Hai Bà Trưng",
      total_lease_area_m2: 200,
      price_amount: 39000000,
    },
    expectedDuplicate: true,
  },
  {
    name: "Khác địa danh dù cùng là 'đất dịch vụ 50m2': Mậu Lương vs Văn Phú",
    target: {
      address_text: "Đất dịch vụ Mậu Lương, Hà Đông",
      total_lease_area_m2: 50,
      price_amount: 10000000,
    },
    candidate: {
      address_text: "Đất dịch vụ Văn Phú, Hà Đông",
      total_lease_area_m2: 50,
      price_amount: 10000000,
    },
    expectedDuplicate: false,
  },
  {
    name: "Cùng phố Đào Tấn nhưng KHÁC SỐ NGÕ: ngõ 104 vs ngõ 118",
    target: {
      address_text: "Nhà ngõ 104 Đào Tấn, Ba Đình",
      total_lease_area_m2: 60,
      price_amount: 12000000,
    },
    candidate: {
      address_text: "Nhà ngõ 118 Đào Tấn, Ba Đình",
      total_lease_area_m2: 60,
      price_amount: 12000000,
    },
    expectedDuplicate: false,
    expectedReasonKeyword: "số nhà",
  },
  {
    name: "Khác Khu công nghiệp dù cùng là 'Kho xưởng 2000m2': Quang Minh vs Nội Bài",
    target: {
      address_text: "Kho xưởng KCN Quang Minh, Mê Linh",
      total_lease_area_m2: 2000,
      price_amount: 160000000,
    },
    candidate: {
      address_text: "Kho xưởng KCN Nội Bài, Sóc Sơn",
      total_lease_area_m2: 2000,
      price_amount: 160000000,
    },
    expectedDuplicate: false,
  },
  {
    name: "TRÙNG LẶP THỰC TẾ 4: Mặt bằng phố Huế 80m2 45tr trùng lặp",
    target: {
      address_text: "Mặt bằng kinh doanh tầng 1 phố Huế",
      total_lease_area_m2: 80,
      price_amount: 45000000,
    },
    candidate: {
      address_text: "MBKD phố Huế, Hai Bà Trưng",
      total_lease_area_m2: 80,
      price_amount: 45000000,
    },
    expectedDuplicate: true,
  },
];

console.log("=================================================");
console.log("CHẠY BỘ KIỂM THỬ THUẬT TOÁN PHÁT HIỆN TRÙNG LẶP BĐS");
console.log("=================================================\n");

let passed = 0;
let failed = 0;

for (let i = 0; i < testCases.length; i++) {
  const tc = testCases[i];
  const res = isPotentialDuplicate(tc.target, tc.candidate);
  const isMatchExpected = res.isDuplicate === tc.expectedDuplicate;

  if (isMatchExpected) {
    passed++;
    console.log(`[PASS] Case ${i + 1}: ${tc.name}`);
    console.log(`       -> Kết quả: ${res.isDuplicate ? "TRÙNG LẶP" : "KHÔNG TRÙNG"} (Độ tin cậy: ${res.confidence}%, Lý do: ${res.reason})\n`);
  } else {
    failed++;
    console.error(`[FAIL] Case ${i + 1}: ${tc.name}`);
    console.error(`       -> Kỳ vọng: ${tc.expectedDuplicate ? "TRÙNG LẶP" : "KHÔNG TRÙNG"}`);
    console.error(`       -> Thực tế: ${res.isDuplicate ? "TRÙNG LẶP" : "KHÔNG TRÙNG"} (Độ tin cậy: ${res.confidence}%, Lý do: ${res.reason})\n`);
  }
}

console.log("-------------------------------------------------");
console.log(`TỔNG KẾT: ${passed}/${testCases.length} PASS | ${failed} FAIL`);
console.log("-------------------------------------------------");

if (failed > 0) {
  process.exit(1);
}
