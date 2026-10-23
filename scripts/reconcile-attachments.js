const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function reconcileAttachments() {
  console.log("🔄 Bắt đầu đối soát và phục hồi ảnh cho toàn bộ Kho BĐS...");

  // 1. Lấy tất cả properties
  const { data: properties, error: pErr } = await supabase
    .from('properties')
    .select('id, code, attachments, primary_partner_id');

  if (pErr || !properties) {
    console.error("Lỗi lấy danh sách properties:", pErr);
    return;
  }

  for (const prop of properties) {
    const currentAtt = Array.isArray(prop.attachments) ? prop.attachments : [];
    if (currentAtt.length > 0) {
      console.log(`ℹ️ [${prop.code}] Đã có ${currentAtt.length} ảnh. Bỏ qua.`);
      continue;
    }

    // Tìm listing liên kết
    const { data: listings } = await supabase
      .from('property_listings')
      .select('id, attachments, submission_id, partner_id')
      .eq('property_id', prop.id);

    let foundImages = [];

    // Tìm từ listing
    if (listings && listings.length > 0) {
      for (const l of listings) {
        if (Array.isArray(l.attachments) && l.attachments.length > 0) {
          foundImages.push(...l.attachments);
        }

        // Tìm từ submission
        if (l.submission_id) {
          const { data: sub } = await supabase
            .from('submissions')
            .select('attachments')
            .eq('id', l.submission_id)
            .single();
          if (sub && Array.isArray(sub.attachments)) {
            foundImages.push(...sub.attachments);
          }

          // Tìm từ zalo_incoming_chats của submission này
          const { data: chats } = await supabase
            .from('zalo_incoming_chats')
            .select('zalo_image_urls')
            .eq('submission_id', l.submission_id);

          if (chats) {
            for (const c of chats) {
              if (Array.isArray(c.zalo_image_urls)) {
                foundImages.push(...c.zalo_image_urls);
              }
            }
          }
        }
      }
    }

    // Deduplicate
    const cleanImages = Array.from(new Set(foundImages.filter(u => typeof u === 'string' && u.startsWith('http'))));

    if (cleanImages.length > 0) {
      console.log(`✨ [${prop.code}] Phục hồi thành công ${cleanImages.length} ảnh!`);
      await supabase
        .from('properties')
        .update({ attachments: cleanImages })
        .eq('id', prop.id);
    } else {
      console.log(`[${prop.code}] Không tìm thấy ảnh gốc trong Zalo chats.`);
    }
  }

  console.log("🎉 Hoàn tất quá trình phục hồi ảnh!");
}

reconcileAttachments().catch(console.error);
