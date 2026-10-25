import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchZaloConversation } from "./conversation";
import { extractBatchPropertiesFromTimeline, BatchTimelineItem } from "@/lib/ai/batch-extract";
import { downloadAndPersistZaloImage } from "@/lib/storage/r2";

/**
 * Xử lý Batch gom cụm theo yêu cầu của khách hàng:
 * 1. Đợi chùm ảnh và tin nhắn ổn định (2.5 phút)
 * 2. Gọi Zalo OA Conversation API để đối chiếu và khôi phục đúng dòng thời gian gốc
 * 3. Đưa toàn bộ dòng thời gian cho Gemini phân tích đa chiều (tách từng căn & ghép ảnh độc quyền)
 * 4. Chạy kiểm tra chất lượng (Sanity Check Gate) và tạo bản nháp sạch vào property_listings
 */
export async function processBatchSubmission(submissionId: string): Promise<{ success: boolean; propertyCount: number; message: string }> {
  const supabase = createAdminClient();

  // 1. Lấy thông tin submission
  const { data: submission, error: subError } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .single();

  if (subError || !submission) {
    return { success: false, propertyCount: 0, message: "Không tìm thấy submission" };
  }

  // Chống xử lý trùng lặp
  if (submission.status === "done" && submission.ai_status === "done") {
    return { success: true, propertyCount: 0, message: "Submission đã được xử lý hoàn tất trước đó" };
  }

  // Cập nhật trạng thái đang xử lý
  await supabase
    .from("submissions")
    .update({ ai_status: "processing", updated_at: new Date().toISOString() })
    .eq("id", submissionId);

  // 2. Tìm thông tin đối tác
  const { data: partner } = await supabase
    .from("partners")
    .select("id, display_name, zalo_user_id")
    .eq("id", submission.partner_id)
    .single();

  if (!partner) {
    await supabase.from("submissions").update({ ai_status: "failed", status: "failed" }).eq("id", submissionId);
    return { success: false, propertyCount: 0, message: "Không tìm thấy partner" };
  }

  try {
    // 3. Lấy tin nhắn từ cơ sở dữ liệu nội bộ (zalo_incoming_chats)
    const { data: localChats } = await supabase
      .from("zalo_incoming_chats")
      .select("*")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: true });

    // 4. Gọi API Lịch sử hội thoại của Zalo OA để lấy thứ tự thời gian gốc (Source of Truth)
    const zaloConvMessages = await fetchZaloConversation(partner.zalo_user_id, 30);

    // 5. Kết hợp & Sắp xếp dòng thời gian chuẩn (Timeline Reconciliation)
    const timelineItems: BatchTimelineItem[] = [];
    const processedMsgIds = new Set<string>();

    // 5a. Ưu tiên các tin nhắn lấy được từ API hội thoại Zalo (có sent_time và time chuẩn)
    if (zaloConvMessages && zaloConvMessages.length > 0) {
      // Chỉ lấy các tin nhắn nằm trong phạm vi thời gian của submission (từ first_msg_at - 2 phút trở đi)
      const subStartTime = submission.first_msg_at ? new Date(submission.first_msg_at).getTime() - 2 * 60 * 1000 : 0;
      const relevantZaloMsgs = zaloConvMessages.filter((m) => m.time >= subStartTime);

      for (const zm of relevantZaloMsgs) {
        processedMsgIds.add(zm.msg_id);

        if (zm.type === "photo" && zm.url) {
          // Đảm bảo ảnh được tải và lưu vĩnh viễn lên Cloudflare R2
          const permanentUrl = await downloadAndPersistZaloImage(zm.url);
          timelineItems.push({
            msg_id: zm.msg_id,
            time: zm.time,
            sent_time: zm.sent_time,
            type: "photo",
            photo_url: permanentUrl,
          });
        } else if (zm.type === "text" && zm.text && zm.text.trim().length > 0) {
          timelineItems.push({
            msg_id: zm.msg_id,
            time: zm.time,
            sent_time: zm.sent_time,
            type: "text",
            text: zm.text,
          });
        }
      }
    }

    // 5b. Bổ sung các tin nhắn từ local chats nếu API Zalo chưa kịp trả về (bảo đảm không sót tin)
    for (const lc of localChats || []) {
      if (!processedMsgIds.has(lc.zalo_msg_id)) {
        const sentTimeMs = lc.sent_at ? new Date(lc.sent_at).getTime() : new Date(lc.created_at).getTime();

        if (lc.text_content && lc.text_content.trim().length > 0) {
          timelineItems.push({
            msg_id: lc.zalo_msg_id,
            time: sentTimeMs,
            sent_time: new Date(sentTimeMs).toLocaleTimeString("vi-VN"),
            type: "text",
            text: lc.text_content,
          });
        }

        if (Array.isArray(lc.zalo_image_urls)) {
          for (const rawUrl of lc.zalo_image_urls) {
            timelineItems.push({
              msg_id: `${lc.zalo_msg_id}_img`,
              time: sentTimeMs,
              sent_time: new Date(sentTimeMs).toLocaleTimeString("vi-VN"),
              type: "photo",
              photo_url: rawUrl,
            });
          }
        }
      }
    }

    // Sắp xếp lại toàn bộ dòng thời gian chuẩn theo thời điểm gửi gốc (tăng dần)
    timelineItems.sort((a, b) => a.time - b.time);

    if (timelineItems.length === 0) {
      await supabase
        .from("submissions")
        .update({ status: "done", ai_status: "done", ai_mode: "empty_batch" })
        .eq("id", submissionId);
      return { success: true, propertyCount: 0, message: "Batch không có nội dung BĐS" };
    }

    // 6. Gửi dòng thời gian chuẩn cho AI bóc tách toàn cảnh (Holistic Batch Matching)
    console.log(`[Batch Processor] Bắt đầu phân tích batch ${submissionId} gồm ${timelineItems.length} sự kiện tin/ảnh...`);
    const batchResult = await extractBatchPropertiesFromTimeline(timelineItems);

    let insertedCount = 0;

    // 7. Lưu từng căn BĐS độc lập vào property_listings
    if (batchResult.properties.length > 0) {
      for (const prop of batchResult.properties) {
        await supabase.from("property_listings").insert({
          submission_id: submissionId,
          partner_id: partner.id,
          review_status: "pending",
          address_text: prop.address_text,
          house_number: prop.house_number,
          street_name: prop.street_name,
          ward: prop.ward,
          district_legacy: prop.district_legacy,
          province: prop.province || null,
          property_types: prop.property_types || [],
          floor_area_m2: prop.floor_area_m2,
          total_lease_area_m2: prop.total_lease_area_m2,
          price_amount: prop.price_amount,
          price_currency: prop.price_currency || "VND",
          price_period: prop.price_period || "month",
          price_basis: prop.price_basis || "total",
          price_text: prop.price_text,
          key_details: {
            ...((prop.key_details || {}) as any),
            handover_condition: prop.handover_condition,
          },
          landlord_commission_text: prop.landlord_commission_text,
          our_share_percent: prop.our_share_percent,
          our_share_text: prop.our_share_text,
          location_note: prop.source_text_snippet || submission.raw_text,
          attachments: prop.assigned_photo_urls || [],
          ai_extracted: prop as any,
          change_history: [{ created_at: new Date().toISOString(), text: prop.source_text_snippet || "Bóc tách từ batch hội thoại Zalo" }],
        });
        insertedCount++;
      }
    } else {
      // Trường hợp dự phòng nếu AI không phát hiện căn nào (ví dụ chỉ có ảnh hoặc tin ngắn)
      const allPhotos = timelineItems.filter((t) => t.type === "photo" && t.photo_url).map((t) => t.photo_url as string);
      const textOnly = timelineItems.filter((t) => t.type === "text" && t.text).map((t) => t.text).join("\n\n");

      await supabase.from("property_listings").insert({
        submission_id: submissionId,
        partner_id: partner.id,
        review_status: "pending",
        address_text: textOnly.slice(0, 80) || "Đợt gửi từ Zalo OA",
        location_note: textOnly || "Chỉ gửi ảnh",
        attachments: allPhotos,
        key_details: {
          vi: textOnly || "Chỉ có ảnh",
          en: textOnly || "Photos only",
          zh: textOnly || "仅有图片",
        },
        change_history: [{ created_at: new Date().toISOString(), text: textOnly || "Đợt gửi chỉ có ảnh" }],
      });
      insertedCount++;
    }

    // 8. Đánh dấu hoàn tất submission
    await supabase
      .from("submissions")
      .update({
        status: "done",
        ai_status: "done",
        ai_mode: "batch_reconciled",
        ai_model: process.env.GEMINI_MODEL || "gemini-flash-latest",
        updated_at: new Date().toISOString(),
      })
      .eq("id", submissionId);

    console.log(`[Batch Processor] Hoàn tất batch ${submissionId}: Đã tạo ${insertedCount} căn BĐS sạch.`);
    revalidatePath("/inbox");

    return {
      success: true,
      propertyCount: insertedCount,
      message: `Đã xử lý thành công đợt gửi: tạo ${insertedCount} căn BĐS.`,
    };
  } catch (err: any) {
    console.error(`[Batch Processor] Lỗi xử lý batch ${submissionId}:`, err);
    await supabase
      .from("submissions")
      .update({
        ai_status: "failed",
        ai_error: err?.message || String(err),
        updated_at: new Date().toISOString(),
      })
      .eq("id", submissionId);
    return { success: false, propertyCount: 0, message: err?.message || "Lỗi xử lý batch" };
  }
}
