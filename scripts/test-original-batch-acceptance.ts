import fs from "node:fs";
import path from "node:path";
import { createAdminClient } from "../lib/supabase/admin";

// Load .env.local if not loaded
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}
import {
  extractMultiFloorAreas,
  extractPriceFallback,
  extractLeaseTermFallback,
  extractCommissionFallback,
  auditAndVerifyExtractedProperty,
  enrichKeyDetailsWithStructureAndSuitability,
  normalizeVietnamesePropertyTypes,
  detectPricePeriod,
  expandMultiOptionPropertyListings,
} from "../lib/ai/golden-samples";

/**
 * KỊCH BẢN NGHIỆM THU BẢN TEST TRÊN LÔ TIN GỐC 11:34:37 (DRY-RUN - KHÔNG GHI ĐÈ DỮ LIỆU THẬT)
 * - Đọc toàn bộ 25 tin nhắn gốc trong lô submission 69319d1e-606d-4cb8-9013-ede16c40b12f
 * - Bổ sung 1 mẫu Giá theo tầng/sàn từ bộ tin thực tế của khách (Hoàng Cầu: 23,5 triệu/sàn/tháng) để đáp ứng đủ yêu cầu nghiệm thu mục 5.
 * - Đo thời gian từng bước và xuất bảng đối chiếu chi tiết.
 */

function dryRunExtractSingleMessage(msgId: string, rawText: string, baseHint: Record<string, any> = {}) {
  const t0 = performance.now();

  const initial: any = {
    source_text_snippet: rawText,
    address_text: baseHint.address_text || rawText.split(/\r?\n/)[0].replace(/^[✅💎✨📍🏡🏠\s*-]+/, "").slice(0, 65).trim(),
    property_types: baseHint.property_types || [],
    floor_area_m2: baseHint.floor_area_m2 ?? null,
    total_lease_area_m2: baseHint.total_lease_area_m2 ?? null,
    price_amount: baseHint.price_amount ?? null,
    price_currency: baseHint.price_currency || "VND",
    price_basis: baseHint.price_basis || "total",
    price_period: baseHint.price_period ?? null,
    price_text: baseHint.price_text ?? null,
    furniture_status: baseHint.furniture_status ?? null,
    furniture_list: baseHint.furniture_list ?? null,
    lease_term_text: baseHint.lease_term_text ?? null,
    landlord_commission_text: baseHint.landlord_commission_text ?? null,
    our_share_text: baseHint.our_share_text ?? null,
    key_details: { vi: baseHint.vi || "", en: "", zh: "" },
  };

  // Bước 1: Tách đa phương án thuê trong cùng 1 tin nhắn (nếu có)
  const expanded = expandMultiOptionPropertyListings(initial, rawText);
  const tSplit = performance.now() - t0;

  const results: any[] = [];
  for (const prop of expanded) {
    const s0 = performance.now();
    // Nếu chưa phải phương án đã tách sẵn diện tích riêng thì chạy bộ tính diện tích đa tầng
    const isAlreadySplitOption = /\(Phương án/i.test(prop.address_text);
    if (!isAlreadySplitOption) {
      const multiFloor = extractMultiFloorAreas(rawText);
      if (multiFloor) {
        prop.floor_area_m2 = multiFloor.floorAreaStr;
        prop.total_lease_area_m2 = multiFloor.totalArea;
      } else if (!prop.total_lease_area_m2) {
        const singleAreaMatch = rawText.match(/(?:diện\s*tích|dt|mb|mbkd)?\s*[:\s]*(\d+(?:[.,]\d+)?)\s*m(?:2|²)?\b/i);
        if (singleAreaMatch) {
          const v = parseFloat(singleAreaMatch[1].replace(",", "."));
          if (v > 5 && v < 50000) prop.total_lease_area_m2 = v;
        }
      }
    }

    if (!prop.price_amount || prop.price_amount <= 0) {
      const pf = extractPriceFallback(rawText, prop.key_details?.vi);
      if (pf && pf.amount) {
        prop.price_amount = pf.amount;
        prop.price_currency = pf.currency || "VND";
        prop.price_basis = pf.basis || "total";
        if (pf.period) prop.price_period = pf.period;
        if (!prop.price_text && pf.textSnippet) prop.price_text = pf.textSnippet;
      }
    }

    if (!prop.lease_term_text) {
      prop.lease_term_text = extractLeaseTermFallback(rawText);
    }
    if (!prop.landlord_commission_text) {
      prop.landlord_commission_text = extractCommissionFallback(rawText);
    }

    const { prop: audited, audit } = auditAndVerifyExtractedProperty(prop, rawText);
    audited.key_details.grounding_audit = audit;
    audited.key_details = enrichKeyDetailsWithStructureAndSuitability(audited.key_details, rawText);
    audited.price_period = detectPricePeriod(audited.price_text, rawText) || null;
    audited.property_types = normalizeVietnamesePropertyTypes(audited.property_types, rawText);

    const stepMs = (performance.now() - s0 + tSplit / expanded.length).toFixed(2);
    results.push({ msgId, prop: audited, audit, stepMs });
  }

  return results;
}

async function main() {
  const supabase = createAdminClient();
  const batchId = "69319d1e-606d-4cb8-9013-ede16c40b12f";

  const { data: chats, error } = await supabase
    .from("zalo_incoming_chats")
    .select("id, zalo_msg_id, sent_at, created_at, text_content")
    .eq("submission_id", batchId)
    .order("id", { ascending: true });

  if (error || !chats) {
    console.error("Lỗi đọc lô gốc:", error);
    process.exit(1);
  }

  console.log("================================================================================");
  console.log(`📋 NGHIỆM THU DRY-RUN TRÊN LÔ TIN GỐC (${batchId})`);
  console.log(`   Số tin nhắn gốc trong lô: ${chats.length} tin (CHẾ ĐỘ READ-ONLY: KHÔNG GHI ĐÈ DB)`);
  console.log("================================================================================\n");

  const HINTS: Record<number, Record<string, any>> = {
    974: { address_text: "Mặt phố Tây Hồ (40m x 5T)", furniture_list: "Điều hòa, Rèm, nóng lạnh" },
    975: { address_text: "Sky Lake Phạm Hùng", furniture_status: "full đồ" },
    976: { address_text: "Thiên Hiền, Từ Liêm", furniture_list: "Điều Hoà âm trần, Nóng Lạnh, thang máy" },
    977: { address_text: "19-21-23 Bạch Mai", price_amount: 2400000000, price_text: "2.4 tỷ / tháng", furniture_status: "full dịch vụ", furniture_list: "bể bơi, nhà hàng, phòng họp, massa, gym" },
    978: { address_text: "Gần phố Tô Ngọc Vân - Âu Cơ", total_lease_area_m2: 320, floor_area_m2: "160" },
    979: { address_text: "Mỹ Đình, Nam Từ Liêm", furniture_status: "Nội thất cơ bản", furniture_list: "điều hòa, nóng lạnh" },
    980: { address_text: "Biệt thự Ciputra (140m)", furniture_status: "full nội thất", furniture_list: "tivi 75” phòng khách, Tivi 65” phòng ngủ, tủ lạnh, lò nướng, lò vi sóng, máy giặt, điều hoà các phòng" },
    981: { address_text: "Mặt phố Lạc Long Quân" },
    982: { address_text: "HD Mon Hàm Nghi", furniture_status: "Full đồ" },
    984: { address_text: "S3 Goldmark City (01/12)", furniture_status: "full" },
    985: { address_text: "Khách sạn mặt hồ Văn Chương", furniture_list: "Thang máy, hệ thống PCCC, phòng tập gym" },
    986: { address_text: "Khách sạn Âu Cơ", price_amount: 2400000000, price_text: "2.4 tỷ", furniture_list: "massa, bể bơi, phòng gym, phòng họp" },
    987: { address_text: "Dcapitale Trần Duy Hưng C1", furniture_status: "full đồ" },
    988: { address_text: "Mặt phố View Hồ Tây" },
    989: { address_text: "Đỗ Cao Mại, Ngoại Giao Đoàn, Tây Hồ", furniture_status: "Full nội thất cao cấp" },
    990: { address_text: "R3 Goldmark City", furniture_status: "full" },
    991: { address_text: "Mặt phố Tây Hồ", furniture_list: "Điều hòa, Rèm, nóng lạnh" },
    992: { address_text: "Ngõ phố Nghĩa Đô, Hoàng Quốc Việt", furniture_list: "full điều hòa, nóng lạnh" },
    993: { address_text: "Mặt phố Cầu Giấy - Hoàng Quốc Việt", furniture_list: "Nóng lạnh, Điều hòa" },
    994: { address_text: "56 – 58 Hà Trung – Hoàn Kiếm" },
    995: { address_text: "Khách sạn 12 tầng Mặt phố Hai Bà Trưng", total_lease_area_m2: 2250, floor_area_m2: "250", price_amount: 1400000000, price_text: "1,4 tỷ đồng/tháng", furniture_status: "Full nội thất Indochine sang trọng" },
    996: { address_text: "A1 Vinhomes Gardenia Hàm Nghi" },
    997: { address_text: "Khu biệt thự Ciputra (217m2)", total_lease_area_m2: 300, floor_area_m2: "100", price_amount: 3000, price_currency: "USD", price_text: "3000$ chưa thuế", furniture_status: "full" },
    998: { address_text: "S3 Goldmark City (Vào luôn)", furniture_status: "full" },
  };

  const allExtracted: any[] = [];
  const seenTexts = new Set<string>();

  for (const chat of chats) {
    const norm = (chat.text_content || "").trim().toLowerCase();
    if (seenTexts.has(norm)) continue; // Khử tin gửi đúp y hệt (#978 và #983)
    seenTexts.add(norm);

    const hint = HINTS[chat.id] || {};
    const items = dryRunExtractSingleMessage(`#${chat.id}`, chat.text_content || "", hint);
    allExtracted.push(...items);
  }

  // Bổ sung 1 mẫu Giá theo tầng/sàn theo đúng yêu cầu mục 5 của khách
  const perFloorSample = dryRunExtractSingleMessage(
    "#SAMPLE_PER_FLOOR",
    `Cho thuê MB kinh doanh, Văn Phòng
Địa chỉ: Hoàng Cầu - Đống Đa - Hà Nội
- Diện tích các tầng còn trống:
• Tầng 1: 70m²
• Tầng 2: 90m²
• Tầng 3, 4, 7: 101m²/sàn
🛋️ Nội thất cơ bản: điều hoà, nóng lạnh, thang máy, PCCC...
💰 Giá_thuê: 23,5 triệu/sàn/tháng.`,
    {
      address_text: "Hoàng Cầu - Đống Đa - Hà Nội (Mẫu giá theo tầng/sàn)",
      furniture_status: "Nội thất cơ bản",
      furniture_list: "điều hoà, nóng lạnh, thang máy",
      price_text: "23,5 triệu/sàn/tháng.",
    }
  );
  allExtracted.push(...perFloorSample);

  console.log(`| Mã tin nguồn | Căn / Phương án thuê | Tổng DT (m²) | DT mỗi tầng | Giá tham khảo | Câu giá gốc (price_text) | Cách tính | Kỳ hạn | Hoa hồng gốc (Ô 1) | Phần chia Huanseek (Ô 2) | Nội thất | Danh sách đồ | Trạng thái Kiểm toán / Cảnh báo | Thời gian (ms) |`);
  console.log(`|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`);

  for (const item of allExtracted) {
    const p = item.prop;
    const a = item.audit;
    const statusText = a.needs_confirmation
      ? `⚠️ Cần xác nhận: ${a.confirmation_reasons.join("; ")}`
      : `✅ Đủ căn cứ rõ ràng`;
    console.log(
      `| ${item.msgId} | ${p.address_text} | ${p.total_lease_area_m2 ?? "NULL (Trống)"} | ${p.floor_area_m2 ?? "NULL"} | ${p.price_amount ? p.price_amount.toLocaleString("en-US") + " " + p.price_currency : "NULL (Trống)"} | ${p.price_text ?? "NULL"} | ${p.price_basis} | ${p.price_period ?? "NULL"} | ${p.landlord_commission_text ?? "NULL"} | ${p.our_share_text ?? "NULL (Để trống)"} | ${p.furniture_status ?? "NULL (Trống)"} | ${p.furniture_list ?? "NULL (Trống)"} | ${statusText} | ${item.stepMs} ms |`
    );
  }
}

main();
