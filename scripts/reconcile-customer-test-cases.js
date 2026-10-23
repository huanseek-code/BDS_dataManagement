const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function reconcile() {
  console.log("=== BẮT ĐẦU CHUẨN HÓA CÁC BẢN GHI TEST KHÁCH HÀNG BÁO ===");

  const ids = [
    "57aa117a-a38e-45d3-ad50-a6ee42be9bb5", // Thi Sách
    "47f9da76-354a-40e9-8ff5-4942a5c93b62", // Kepler
    "f5b8ee27-29ec-4e1c-809c-5ce2aa59e6b9", // Trần Vỹ
    "755c7165-3ba4-4469-aeb2-46b900c8d738", // Discovery Complex 1
    "8b9b157d-33c1-437e-b585-67a8868503d7", // Discovery Complex 2
    "a44de2fc-106e-4516-99d3-9991876504c1"  // Discovery Complex 3
  ];

  const { data: listings, error } = await supabase
    .from("property_listings")
    .select("*")
    .in("id", ids);

  if (error) {
    console.error("Lỗi lấy dữ liệu listings:", error);
    return;
  }

  const thiSach = listings.find(l => l.id === "57aa117a-a38e-45d3-ad50-a6ee42be9bb5");
  const kepler = listings.find(l => l.id === "47f9da76-354a-40e9-8ff5-4942a5c93b62");
  const tranVy = listings.find(l => l.id === "f5b8ee27-29ec-4e1c-809c-5ce2aa59e6b9");
  const discoveries = listings.filter(l => l.address_text?.includes("Discovery"));

  // 1. Tập hợp 8 ảnh của Thi Sách
  const thiSachAtts = new Set(Array.isArray(thiSach?.attachments) ? thiSach.attachments : []);
  console.log(`Thi Sách có ${thiSachAtts.size} ảnh gốc.`);

  if (thiSach) {
    const curKd = thiSach.key_details || {};
    let vi = curKd.vi || "";
    let en = curKd.en || "";
    let zh = curKd.zh || "";

    if (!vi.includes("hàng ăn") && !vi.includes("ăn uống")) {
      vi += " (Không làm hàng ăn/kinh doanh ăn uống)";
    }
    if (!en.toLowerCase().includes("food") && !en.toLowerCase().includes("restaurant")) {
      en += " (No F&B / restaurant business allowed)";
    }
    if (!zh.includes("餐饮")) {
      zh += " (禁止餐饮餐饮业)";
    }

    const { error: e1 } = await supabase
      .from("property_listings")
      .update({
        key_details: { ...curKd, vi, en, zh },
        updated_at: new Date().toISOString()
      })
      .eq("id", thiSach.id);
    if (e1) console.error("Lỗi cập nhật Thi Sách:", e1);
    else console.log("✅ Đã cập nhật Thi Sách: Đã bổ sung điều kiện 'không làm hàng ăn'.");
  }

  // 2. Cập nhật Kepler: Loại bỏ 8 ảnh Thi Sách, bổ sung giá 18 triệu/tháng, handover_condition = fully_furnished
  let keplerIsolatedAtts = [];
  if (kepler) {
    const rawAtts = Array.isArray(kepler.attachments) ? kepler.attachments : [];
    keplerIsolatedAtts = rawAtts.filter(url => !thiSachAtts.has(url));

    const curKd = kepler.key_details || {};
    const curAi = kepler.ai_extracted || {};

    const { error: e2 } = await supabase
      .from("property_listings")
      .update({
        price_amount: 18000000,
        price_text: "18 triệu/tháng",
        price_currency: "VND",
        price_period: "month",
        price_basis: "total",
        key_details: { ...curKd, handover_condition: "fully_furnished" },
        ai_extracted: { ...curAi, handover_condition: "fully_furnished", price_amount: 18000000, price_text: "18 triệu/tháng" },
        attachments: keplerIsolatedAtts,
        updated_at: new Date().toISOString()
      })
      .eq("id", kepler.id);
    if (e2) console.error("Lỗi cập nhật Kepler:", e2);
    else console.log(`✅ Đã cập nhật Kepler: Giá 18tr/tháng, ảnh từ ${rawAtts.length} -> còn ${keplerIsolatedAtts.length} ảnh chuẩn.`);
  }

  const keplerAttSet = new Set(keplerIsolatedAtts);

  // 3. Cập nhật Trần Vỹ: Loại bỏ ảnh Thi Sách + Kepler, bổ sung giá 200 tr/tháng, diện tích sàn 180m2, tổng 1440m2
  let tranVyIsolatedAtts = [];
  if (tranVy) {
    const rawAtts = Array.isArray(tranVy.attachments) ? tranVy.attachments : [];
    tranVyIsolatedAtts = rawAtts.filter(url => !thiSachAtts.has(url) && !keplerAttSet.has(url));

    const curKd = tranVy.key_details || {};
    const curAi = tranVy.ai_extracted || {};

    const { error: e3 } = await supabase
      .from("property_listings")
      .update({
        price_amount: 200000000,
        price_text: "200 tr/ tháng",
        price_currency: "VND",
        price_period: "month",
        price_basis: "total",
        floor_area_m2: 180,
        total_lease_area_m2: 1440,
        ai_extracted: { ...curAi, price_amount: 200000000, price_text: "200 tr/ tháng", floor_area_m2: 180, total_lease_area_m2: 1440 },
        attachments: tranVyIsolatedAtts,
        updated_at: new Date().toISOString()
      })
      .eq("id", tranVy.id);
    if (e3) console.error("Lỗi cập nhật Trần Vỹ:", e3);
    else console.log(`✅ Đã cập nhật Trần Vỹ: Giá 200tr, DT 180m2 (tổng 1440m2), ảnh từ ${rawAtts.length} -> còn ${tranVyIsolatedAtts.length} ảnh chuẩn.`);
  }

  const tranVyAttSet = new Set(tranVyIsolatedAtts);

  // 4. Cập nhật Discovery: Loại bỏ ảnh Thi Sách + Kepler + Trần Vỹ, chuẩn hóa handover_condition = fully_furnished
  for (const disc of discoveries) {
    const rawAtts = Array.isArray(disc.attachments) ? disc.attachments : [];
    const discIsolated = rawAtts.filter(
      url => !thiSachAtts.has(url) && !keplerAttSet.has(url) && !tranVyAttSet.has(url)
    );

    const curKd = disc.key_details || {};
    const curAi = disc.ai_extracted || {};

    const { error: e4 } = await supabase
      .from("property_listings")
      .update({
        key_details: { ...curKd, handover_condition: "fully_furnished" },
        ai_extracted: { ...curAi, handover_condition: "fully_furnished" },
        attachments: discIsolated,
        updated_at: new Date().toISOString()
      })
      .eq("id", disc.id);
    if (e4) console.error(`Lỗi cập nhật Discovery ${disc.id}:`, e4);
    else console.log(`✅ Đã cập nhật Discovery (${disc.id}): Bàn giao fully_furnished, ảnh từ ${rawAtts.length} -> còn ${discIsolated.length} ảnh chuẩn.`);
  }

  console.log("=== HOÀN TẤT CHUẨN HÓA DỮ LIỆU ===");
}

reconcile().catch(console.error);
