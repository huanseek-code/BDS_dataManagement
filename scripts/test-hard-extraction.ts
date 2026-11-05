import * as fs from "fs";
import * as path from "path";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

// Mock server-only before importing batch-extract
const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === "server-only") return {};
  return originalRequire.apply(this, arguments);
};

import { extractBatchPropertiesFromTimeline } from "../lib/ai/batch-extract";

interface ExtractionScenario {
  id: string;
  name: string;
  description: string;
  rawText?: string;
  timeline?: Array<{
    msg_id: string;
    time: number;
    sent_time: string;
    type: "text" | "photo";
    text?: string;
  }>;
  expected: {
    propertyCount: number;
    properties?: Array<{
      addressContains?: string;
      total_lease_area_m2?: number | null;
      floor_area_m2?: string | null;
      price_amount?: number | null;
      price_basis?: string;
      price_currency?: string;
      price_period?: string | null;
      furniture_status?: string | null;
      landlord_commission_text?: string | null;
      our_share_percent?: number | null;
      prohibitedKeywordsInViSummary?: string[];
      requiredKeywordsInViSummary?: string[];
    }>;
  };
}

const scenarios: ExtractionScenario[] = [
  {
    id: "HARD_1",
    name: "Biệt thự đơn lập sân vườn: Phân biệt diện tích đất vs diện tích xây dựng",
    description: "Đất 350m2, xây dựng 150m2 x 3.5 tầng có sân vườn. Cấm làm homestay / CHDV. Không nhân máy móc đất 350*3.5",
    rawText: `Cho thuê Biệt thự Đơn lập KĐT Vinhomes Riverside Long Biên.
- Diện tích đất: 350m2, diện tích xây dựng: 150m2 x 3.5 tầng có hầm và sân vườn quanh nhà.
- Thiết kế:
  + Tầng hầm: gara để 2 ô tô + kho rượu
  + Tầng 1: phòng khách, bếp
  + Tầng 2-3: 4 phòng ngủ khép kín
- Nội thất: full đồ nhập khẩu
- Giá thuê: 90 triệu/tháng
- Điều kiện: Hợp đồng 3 năm trở lên, cọc 2 đóng 3. Chủ nhà cấm kinh doanh homestay hoặc làm căn hộ dịch vụ`,
    expected: {
      propertyCount: 1,
      properties: [
        {
          addressContains: "Vinhomes Riverside",
          floor_area_m2: "150",
          price_amount: 90000000,
          price_period: "Theo tháng",
          furniture_status: "full đồ", // Kiểm tra chứa 'full đồ'
          requiredKeywordsInViSummary: ["homestay", "căn hộ dịch vụ"],
        },
      ],
    },
  },
  {
    id: "HARD_2",
    name: "Một tin nhắn chứa 3 căn đa dạng loại hình (Liền kề, Kho xưởng theo m2, Chung cư)",
    description: "Căn 1 giá tháng VND, Căn 2 kho xưởng giá/m2 chưa VAT, Căn 3 chung cư không có chữ tháng",
    rawText: `🔥 HÀNG MỚI VỀ HÔM NAY:
1) Cho thuê liền kề KĐT Geleximco khu D 120m2 x 4 tầng có thang máy, hoàn thiện cơ bản, đường 13.5m. Giá: 22 triệu/tháng.
2) Cho thuê kho xưởng KCN Quang Minh - Mê Linh 1500m2 trần cao 8m xe cont 40 feet vào tận cửa, trạm điện 400kVA, PCCC nghiệm thu. Giá: 85k/m2.
3) Căn hộ 2N2WC chung cư Ngoại Giao Đoàn, DT 85m full đồ đẹp chỉ việc xách vali vào ở. Giá: 13tr. Lh 0988123456`,
    expected: {
      propertyCount: 3,
      properties: [
        {
          addressContains: "Geleximco khu D",
          floor_area_m2: "120",
          price_amount: 22000000,
          price_period: "Theo tháng",
          price_basis: "total",
        },
        {
          addressContains: "KCN Quang Minh",
          floor_area_m2: null,
          total_lease_area_m2: 1500,
          price_amount: 85000,
          price_basis: "per_m2",
        },
        {
          addressContains: "Ngoại Giao Đoàn",
          floor_area_m2: null,
          total_lease_area_m2: 85,
          price_amount: 13000000,
          price_period: null,
          furniture_status: "full đồ",
        },
      ],
    },
  },
  {
    id: "HARD_3",
    name: "Tin thiếu dữ liệu trầm trọng (Minimal data - Zero Hallucination)",
    description: "Chỉ có địa chỉ, 45m2 và giá 8,5tr. Không có tầng, không có chữ tháng, không có nội thất -> Phải để NULL",
    rawText: `Chính chủ cho thuê nhà ngõ Khương Đình, Thanh Xuân. DT 45m2, 3 phòng ngủ. Giá 8,5tr. Lh 0912345678`,
    expected: {
      propertyCount: 1,
      properties: [
        {
          addressContains: "Khương Đình",
          floor_area_m2: null,
          total_lease_area_m2: 45,
          price_amount: 8500000,
          price_period: null,
          furniture_status: null,
        },
      ],
    },
  },
  {
    id: "HARD_4",
    name: "Tin tìm khách / Nhu cầu khách (Negative lead filtering)",
    description: "Môi giới đăng nhu cầu tìm căn cho khách thuê, không phải nguồn cho thuê -> Phải trả về 0 căn",
    rawText: `Khách quen của em cần tìm thuê gấp căn 3 ngủ tại The Manor Mễ Trì hoặc Golden Palace, ngân sách 25-30 triệu/tháng, yêu cầu đủ đồ vào ở ngay. Anh chị nào có hàng kết nối em nhé. Zalo 0977889900`,
    expected: {
      propertyCount: 0,
    },
  },
  {
    id: "HARD_5",
    name: "Văn phòng báo giá bằng USD theo m2/tháng",
    description: "Sàn văn phòng Keangnam 220m2 giá 18$/m2/tháng -> price_currency: USD, price_basis: Theo m²",
    rawText: `Cho thuê sàn văn phòng hạng A Keangnam Landmark 72, Nam Từ Liêm.
- Diện tích trống: 220m2 tầng 18 view thoáng
- Giá thuê: 18$/m2/tháng (đã gồm phí dịch vụ, chưa VAT)
- Bàn giao trần sàn điều hòa trung tâm. HĐ tối thiểu 3 năm, cọc 3 thanh toán 3`,
    expected: {
      propertyCount: 1,
      properties: [
        {
          addressContains: "Keangnam Landmark 72",
          total_lease_area_m2: 220,
          price_currency: "USD",
          price_amount: 18,
          price_basis: "per_m2",
          price_period: "Theo tháng",
        },
      ],
    },
  },
  {
    id: "HARD_6",
    name: "Các tầng có diện tích lệch nhau và mô tả chi tiết từng tầng",
    description: "Tầng 1 80m2 thông sàn kinh doanh, Tầng 2-4 mỗi tầng 100m2, Tầng 5 60m2 -> Tổng = 440m2",
    rawText: `Cho thuê nhà mặt phố Nguyễn Trãi, Thanh Xuân:
- Tầng 1: 80m2 thông sàn kinh doanh
- Tầng 2, 3, 4: mỗi tầng 100m2 chia 2 phòng
- Tầng 5: 60m2 + sân phơi rộng
- Giá thuê: 75 triệu/tháng
- Phù hợp: Nha khoa, thẩm mỹ viện, trung tâm đào tạo, ngân hàng`,
    expected: {
      propertyCount: 1,
      properties: [
        {
          addressContains: "Nguyễn Trãi",
          total_lease_area_m2: 440,
          price_amount: 75000000,
          price_period: "Theo tháng",
        },
      ],
    },
  },
  {
    id: "HARD_7",
    name: "Nhiều phương án thuê: Thuê lẻ tầng vs Thuê toàn bộ toà nhà",
    description: "Thuê lẻ tầng 1-2 giá 35tr vs Thuê cả nhà 80tr -> Lấy 80tr cả nhà làm chính",
    rawText: `Cho thuê toà nhà 7 tầng phố Nguyễn Thị Định, Cầu Giấy.
- Diện tích: 90m2 x 7 tầng, thang máy tốc độ cao, MT 6m.
- Phương án 1: Thuê tầng 1-2 làm showroom, spa: 35 triệu/tháng.
- Phương án 2: Thuê toàn bộ cả toà nhà: 80 triệu/tháng.
Thanh toán 6 cọc 1, hợp đồng lâu dài.`,
    expected: {
      propertyCount: 1,
      properties: [
        {
          addressContains: "Nguyễn Thị Định",
          floor_area_m2: "90",
          total_lease_area_m2: 630,
          price_amount: 80000000,
          price_period: "Theo tháng",
          requiredKeywordsInViSummary: ["35", "80"],
        },
      ],
    },
  },
  {
    id: "HARD_8",
    name: "Đất công nghiệp/kho bãi không chia tầng (2000m2 giá 45k/m2/tháng)",
    description: "Đất không có tầng -> floor_area_m2 = null, price_basis: per_m2, price_amount: 45000",
    rawText: `Chính chủ cho thuê 2000m2 đất công nghiệp tại cụm CN Ngọc Hồi, Thanh Trì. Đã quây tôn, đường xe cont tránh nhau, điện 3 pha, nước sạch. HĐ ký 5 năm. Giá 45k/m2/tháng.`,
    expected: {
      propertyCount: 1,
      properties: [
        {
          addressContains: "Ngọc Hồi",
          total_lease_area_m2: 2000,
          floor_area_m2: null,
          price_amount: 45000,
          price_basis: "per_m2",
          price_period: "Theo tháng",
        },
      ],
    },
  },
  {
    id: "HARD_9",
    name: "Tiếng lóng môi giới cực gắt: '55 củ/tháng', '70mx5t', 'tm', 'hh 1 tháng bên mình 50%'",
    description: "55 củ = 55 triệu, tm = thang máy, our_share_percent = 50",
    rawText: `mp Kim Mã 70mx5t mt 4.8m tm thông sàn, nội thất cơ bản: ac nóng lạnh, vỉa hè rộng đỗ 2 oto. Giá 55 củ/tháng. Hh 1 tháng bên mình 50%. Lh 0912345678`,
    expected: {
      propertyCount: 1,
      properties: [
        {
          addressContains: "Kim Mã",
          floor_area_m2: "70",
          total_lease_area_m2: 350,
          price_amount: 55000000,
          price_period: "Theo tháng",
          our_share_percent: 50,
        },
      ],
    },
  },
  {
    id: "HARD_10",
    name: "Nhà phố kết cấu 1 hầm + 6 tầng nổi + 1 tum",
    description: "Nhận diện diện tích sàn 85m2, không bị nhầm lẫn hầm tum",
    rawText: `Cho thuê nhà phố Trần Đại Nghĩa, Hai Bà Trưng.
- Kết cấu: 1 hầm + 6 tầng nổi + 1 tum.
- DT sàn: 85m2.
- Mỗi tầng thông sàn, có thang máy.
- Giá thuê 65tr/tháng. Hợp đồng 3 năm.`,
    expected: {
      propertyCount: 1,
      properties: [
        {
          addressContains: "Trần Đại Nghĩa",
          floor_area_m2: "85",
          price_amount: 65000000,
          price_period: "Theo tháng",
        },
      ],
    },
  },
  {
    id: "HARD_11",
    name: "Sang nhượng cửa hàng: Phân biệt tiền thuê nhà vs Tiền sang nhượng đồ đạc",
    description: "Tiền thuê 25tr/tháng, phí nhượng 70tr -> price_amount: 25000000 (KHÔNG PHẢI 70TR!)",
    rawText: `Nhượng lại cửa hàng thời trang mặt phố Chùa Bộc, Đống Đa. DT 50m2 tầng 1 thông sàn. Tiền thuê nhà: 25 triệu/tháng, hợp đồng còn 2 năm. Giá sang nhượng toàn bộ đồ đạc biển bảng, điều hòa, quầy thu ngân: 70 triệu (có thương lượng).`,
    expected: {
      propertyCount: 1,
      properties: [
        {
          addressContains: "Chùa Bộc",
          total_lease_area_m2: 50,
          price_amount: 25000000,
          price_period: "Theo tháng",
          requiredKeywordsInViSummary: ["70"],
        },
      ],
    },
  },
  {
    id: "HARD_12",
    name: "Dòng thời gian có tin nhắn đính chính / giảm giá gửi sau",
    description: "Msg 1: 18tr -> Msg 2 (15 phút sau): chủ nhà giảm còn 16.5tr -> Phải lấy 16.5tr",
    timeline: [
      {
        msg_id: "msg_12_a",
        time: Date.now() - 900000,
        sent_time: "10:00",
        type: "text",
        text: `Cho thuê nhà 50m2 x 4 tầng ngõ 106 Hoàng Quốc Việt, Cầu Giấy, giá 18tr/tháng.`,
      },
      {
        msg_id: "msg_12_b",
        time: Date.now(),
        sent_time: "10:15",
        type: "text",
        text: `Căn ngõ 106 Hoàng Quốc Việt chủ nhà vừa báo giảm giá còn 16.5tr/tháng nhé cả nhà.`,
      },
    ],
    expected: {
      propertyCount: 1,
      properties: [
        {
          addressContains: "Hoàng Quốc Việt",
          floor_area_m2: "50",
          total_lease_area_m2: 200,
          price_amount: 16500000,
          price_period: "Theo tháng",
        },
      ],
    },
  },
];

async function runHardExtractionTests() {
  console.log("==================================================================");
  console.log("CHẠY BỘ KIỂM THỬ BÓC TÁCH BĐS PHỨC TẠP VỚI GEMINI 3.6 FLASH");
  console.log("==================================================================\n");

  let passedTests = 0;
  let failedTests = 0;
  const detailedResults: any[] = [];

  for (let idx = 0; idx < scenarios.length; idx++) {
    const sc = scenarios[idx];
    console.log(`\n------------------------------------------------------------------`);
    console.log(`[TEST ${idx + 1}/${scenarios.length}] ${sc.id}: ${sc.name}`);
    console.log(`Mô tả: ${sc.description}`);
    console.log(`------------------------------------------------------------------`);

    try {
      const timeline = sc.timeline || [
        {
          msg_id: `msg_${sc.id}`,
          time: Date.now(),
          sent_time: "10:00",
          type: "text" as const,
          text: sc.rawText,
        },
      ];

      const start = Date.now();
      const res = await extractBatchPropertiesFromTimeline(timeline);
      const elapsedMs = Date.now() - start;

      const props = res.properties || [];
      console.log(`Thời gian: ${elapsedMs}ms | Số căn bóc được: ${props.length} (Kỳ vọng: ${sc.expected.propertyCount})`);

      const errors: string[] = [];

      if (props.length !== sc.expected.propertyCount) {
        errors.push(`Số lượng căn lệch: Trả về ${props.length}, Kỳ vọng ${sc.expected.propertyCount}`);
      }

      if (sc.expected.properties) {
        for (let pIdx = 0; pIdx < sc.expected.properties.length; pIdx++) {
          const expP = sc.expected.properties[pIdx];
          const actP = props[pIdx];

          if (!actP) {
            errors.push(`Căn thứ ${pIdx + 1} không tồn tại trong kết quả`);
            continue;
          }

          console.log(`\n  * Chi tiết Căn ${pIdx + 1}: [${actP.address_text}]`);
          console.log(`    - floor_area_m2: ${actP.floor_area_m2} (Kỳ vọng: ${expP.floor_area_m2})`);
          console.log(`    - total_lease_area_m2: ${actP.total_lease_area_m2} (Kỳ vọng: ${expP.total_lease_area_m2})`);
          console.log(`    - price_amount: ${actP.price_amount} (Kỳ vọng: ${expP.price_amount})`);
          console.log(`    - price_basis: ${actP.price_basis} (Kỳ vọng: ${expP.price_basis})`);
          console.log(`    - price_period: ${actP.price_period} (Kỳ vọng: ${expP.price_period})`);
          console.log(`    - furniture_status: ${actP.furniture_status} (Kỳ vọng: ${expP.furniture_status})`);
          console.log(`    - snippet: ${actP.source_text_snippet?.replace(/\n/g, " ").slice(0, 60)}...`);

          if (expP.addressContains && !actP.address_text?.toLowerCase().includes(expP.addressContains.toLowerCase())) {
            errors.push(`Căn ${pIdx + 1}: Địa chỉ không chứa '${expP.addressContains}'`);
          }

          if (expP.floor_area_m2 !== undefined) {
            if (String(actP.floor_area_m2 || "").trim() !== String(expP.floor_area_m2 || "").trim()) {
              errors.push(`Căn ${pIdx + 1}: floor_area_m2 lệch (Nhận: ${actP.floor_area_m2}, Kỳ vọng: ${expP.floor_area_m2})`);
            }
          }

          if (expP.total_lease_area_m2 !== undefined) {
            if (Number(actP.total_lease_area_m2) !== Number(expP.total_lease_area_m2)) {
              errors.push(`Căn ${pIdx + 1}: total_lease_area_m2 lệch (Nhận: ${actP.total_lease_area_m2}, Kỳ vọng: ${expP.total_lease_area_m2})`);
            }
          }

          if (expP.price_amount !== undefined) {
            if (Number(actP.price_amount) !== Number(expP.price_amount)) {
              errors.push(`Căn ${pIdx + 1}: price_amount lệch (Nhận: ${actP.price_amount}, Kỳ vọng: ${expP.price_amount})`);
            }
          }

          if (expP.price_basis !== undefined) {
            if (actP.price_basis !== expP.price_basis) {
              errors.push(`Căn ${pIdx + 1}: price_basis lệch (Nhận: ${actP.price_basis}, Kỳ vọng: ${expP.price_basis})`);
            }
          }

          if (expP.price_period !== undefined) {
            if (actP.price_period !== expP.price_period) {
              errors.push(`Căn ${pIdx + 1}: price_period lệch (Nhận: ${actP.price_period}, Kỳ vọng: ${expP.price_period})`);
            }
          }

          if (expP.our_share_percent !== undefined) {
            if (Number(actP.our_share_percent) !== Number(expP.our_share_percent)) {
              errors.push(`Căn ${pIdx + 1}: our_share_percent lệch (Nhận: ${actP.our_share_percent}, Kỳ vọng: ${expP.our_share_percent})`);
            }
          }

          if (expP.furniture_status !== undefined) {
            if (expP.furniture_status === null) {
              if (actP.furniture_status !== null) {
                errors.push(`Căn ${pIdx + 1}: furniture_status phải là null (Nhận: ${actP.furniture_status})`);
              }
            } else {
              const actStatus = (actP.furniture_status || "").toLowerCase();
              const expStatus = expP.furniture_status.toLowerCase();
              if (!actStatus.includes(expStatus)) {
                errors.push(`Căn ${pIdx + 1}: furniture_status lệch (Nhận: ${actP.furniture_status}, Kỳ vọng chứa: ${expP.furniture_status})`);
              }
            }
          }

          if (expP.requiredKeywordsInViSummary) {
            for (const kw of expP.requiredKeywordsInViSummary) {
              if (!actP.key_details?.vi?.toLowerCase().includes(kw.toLowerCase())) {
                errors.push(`Căn ${pIdx + 1}: Tóm tắt vi bỏ sót từ khóa cấm/ràng buộc: '${kw}'`);
              }
            }
          }
        }
      }

      if (errors.length === 0) {
        passedTests++;
        console.log(`\n=> [PASS] Kịch bản ${sc.id} đạt chuẩn 100%`);
        detailedResults.push({ id: sc.id, name: sc.name, status: "PASS", errors: [] });
      } else {
        failedTests++;
        console.error(`\n=> [FAIL] Kịch bản ${sc.id} có lỗi:`);
        errors.forEach(e => console.error(`   - ${e}`));
        detailedResults.push({ id: sc.id, name: sc.name, status: "FAIL", errors });
      }
    } catch (err: any) {
      failedTests++;
      console.error(`\n=> [ERROR] Kịch bản ${sc.id} ném ngoại lệ:`, err.message);
      detailedResults.push({ id: sc.id, name: sc.name, status: "ERROR", errors: [err.message] });
    }
  }

  console.log("\n==================================================================");
  console.log(`TỔNG KẾT BÓC TÁCH: ${passedTests}/${scenarios.length} PASS | ${failedTests} FAIL`);
  console.log("==================================================================");
}

runHardExtractionTests().catch(console.error);

