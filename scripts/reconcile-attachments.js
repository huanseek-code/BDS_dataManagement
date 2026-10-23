const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function reconcileAttachments() {
  console.log("🔄 Bắt đầu đối soát và phục hồi ảnh cho toàn bộ hệ thống (Kho BĐS & Chờ duyệt)...");

  // 1. Đối soát và phục hồi cho property_listings (Hồ sơ Chờ duyệt & Lịch sử duyệt)
  const { data: listings, error: lErr } = await supabase
    .from('property_listings')
    .select('id, address_text, review_status, attachments, submission_id, partner_id');

  if (listings) {
    for (const l of listings) {
      const currentAtt = Array.isArray(l.attachments) ? l.attachments : [];
      let foundImages = [...currentAtt];

      if (l.submission_id) {
        // Lấy ảnh từ submissions
        const { data: sub } = await supabase
          .from('submissions')
          .select('attachments')
          .eq('id', l.submission_id)
          .single();
        if (sub && Array.isArray(sub.attachments)) {
          foundImages.push(...sub.attachments);
        }

        // Lấy ảnh từ zalo_incoming_chats
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

      const cleanImages = Array.from(new Set(foundImages.filter(u => typeof u === 'string' && u.startsWith('http'))));

      if (cleanImages.length > currentAtt.length) {
        console.log(`✨ [Listing ${l.id} - ${l.address_text}] Phục hồi thành công ${cleanImages.length} ảnh! (cũ: ${currentAtt.length})`);
        
        const updateData = { attachments: cleanImages };
        // Nếu là căn Kepler mà đang bị rejected do test lúc chưa có ảnh -> chuyển về pending để duyệt lại
        if (l.address_text && l.address_text.toLowerCase().includes('kepler')) {
          updateData.review_status = 'pending';
          updateData.reject_reason = null;
        }

        await supabase
          .from('property_listings')
          .update(updateData)
          .eq('id', l.id);
      }
    }
  }

  // 2. Đối soát và phục hồi cho properties (Kho BĐS)
  const { data: properties, error: pErr } = await supabase
    .from('properties')
    .select('id, code, attachments, primary_partner_id');

  if (pErr || !properties) {
    console.error("Lỗi lấy danh sách properties:", pErr);
    return;
  }

  for (const prop of properties) {
    const currentAtt = Array.isArray(prop.attachments) ? prop.attachments : [];
    let foundImages = [...currentAtt];

    // Tìm listing liên kết
    const { data: linkedListings } = await supabase
      .from('property_listings')
      .select('id, attachments, submission_id, partner_id')
      .eq('property_id', prop.id);

    if (linkedListings && linkedListings.length > 0) {
      for (const l of linkedListings) {
        if (Array.isArray(l.attachments)) {
          foundImages.push(...l.attachments);
        }

        if (l.submission_id) {
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

    const cleanImages = Array.from(new Set(foundImages.filter(u => typeof u === 'string' && u.startsWith('http'))));

    if (cleanImages.length > currentAtt.length) {
      console.log(`✨ [Property ${prop.code}] Cập nhật bổ sung thành công ${cleanImages.length} ảnh!`);
      await supabase
        .from('properties')
        .update({ attachments: cleanImages })
        .eq('id', prop.id);
    }
  }

  console.log("🎉 Hoàn tất quá trình phục hồi và đối soát ảnh toàn hệ thống!");
}

reconcileAttachments().catch(console.error);
