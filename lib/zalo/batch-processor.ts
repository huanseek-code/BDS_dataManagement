import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchZaloConversation } from "./conversation";
import { extractBatchPropertiesFromTimeline, BatchTimelineItem } from "@/lib/ai/batch-extract";

/**
 * Xử lý Batch gom cụm văn bản:
 * 1. Thu thập toàn bộ tin nhắn văn bản từ đối tác (Zalo API + Local DB)
 * 2. Lọc bỏ các tin nhắn văn bản trùng lặp (Deduplication)
 * 3. Đưa toàn bộ dòng thời gian cho Gemini phân tích đa căn (Multi-Property Text Extraction)
 * 4. Tạo bản nháp sạch vào property_listings (kho dữ liệu thuần text)
 */
export async function processBatchSubmission(
  submissionId: string
): Promise<{ success: boolean; propertyCount: number; message: string }> {
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

    // 4. Gọi API Lịch sử hội thoại của Zalo OA để lấy thêm tin nhắn văn bản nếu có
    const zaloConvMessages = await fetchZaloConversation(partner.zalo_user_id, 30);

    // 5. Kết hợp & Sắp xếp dòng thời gian văn bản chuẩn
    const timelineItems: BatchTimelineItem[] = [];
    const processedMsgIds = new Set<string>();

    // 5a. Ưu tiên các tin nhắn văn bản lấy được từ API hội thoại Zalo
    if (zaloConvMessages && zaloConvMessages.length > 0) {
      const subStartTime = submission.first_msg_at ? new Date(submission.first_msg_at).getTime() - 2 * 60 * 1000 : 0;
      const relevantZaloMsgs = zaloConvMessages.filter((m) => m.time >= subStartTime);

      for (const zm of relevantZaloMsgs) {
        processedMsgIds.add(zm.msg_id);

        if (zm.type === "text" && zm.text && zm.text.trim().length > 0) {
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

    // 5b. Bổ sung các tin nhắn văn bản từ local chats nếu chưa có
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
      }
    }

    // Sắp xếp lại toàn bộ dòng thời gian chuẩn theo thời điểm gửi (tăng dần)
    timelineItems.sort((a, b) => a.time - b.time);

    // 5c. Khử trùng lặp các tin nhắn text giống hệt nhau gửi dồn dập
    const seenTexts = new Set<string>();
    const deduplicatedTimeline: BatchTimelineItem[] = [];
    for (const item of timelineItems) {
      const normalized = (item.text || "").trim().toLowerCase();
      if (!seenTexts.has(normalized)) {
        seenTexts.add(normalized);
        deduplicatedTimeline.push(item);
      }
    }

    if (deduplicatedTimeline.length === 0) {
      await supabase
        .from("submissions")
        .update({ status: "done", ai_status: "done", ai_mode: "empty_text_batch" })
        .eq("id", submissionId);
      return { success: true, propertyCount: 0, message: "Batch không có nội dung văn bản BĐS" };
    }

    // 6. Gửi dòng thời gian văn bản cho AI bóc tách đa căn (Multi-Property Text Extraction)
    console.log(`[Batch Processor] Bắt đầu phân tích batch ${submissionId} gồm ${deduplicatedTimeline.length} đoạn văn bản...`);
    const batchResult = await extractBatchPropertiesFromTimeline(deduplicatedTimeline);

    let insertedCount = 0;

    // 7. Lưu từng căn BĐS độc lập vào property_listings (kho dữ liệu thuần text)
    if (batchResult.properties.length > 0) {
      for (const prop of batchResult.properties) {
        await supabase.from("property_listings").insert({
          submission_id: submissionId,
          partner_id: partner.id,
          review_status: "pending",
          address_text: prop.address_text,
          house_number: prop.house_number || null,
          street_name: prop.street_name || null,
          ward: prop.ward || null,
          district_legacy: prop.district_legacy || null,
          province: prop.province || null,
          property_types: prop.property_types || [],
          floor_area_m2: prop.floor_area_m2 ? String(prop.floor_area_m2).trim() : null,
          total_lease_area_m2: prop.total_lease_area_m2 || null,
          price_amount: prop.price_amount || null,
          price_currency: prop.price_currency || "VND",
          price_period: prop.price_period || null,
          price_basis: (prop.price_basis === "per_m2" || String(prop.price_basis).toLowerCase().includes("m2") || String(prop.price_basis).toLowerCase().includes("m²")) ? "per_m2" : "total",
          price_text: prop.price_text || null,
          key_details: {
            ...((prop.key_details || {}) as any),
            lease_term_text: prop.lease_term_text || null,
            furniture_status: prop.furniture_status || null,
            furniture_list: prop.furniture_list || null,
            handover_condition: prop.furniture_status || null,
          },
          landlord_commission_text: prop.landlord_commission_text || null,
          our_share_percent: prop.our_share_percent || null,
          our_share_text: prop.our_share_text || null,
          location_note: prop.source_text_snippet || submission.raw_text,
          attachments: [], // Kho dữ liệu thuần text
          ai_extracted: prop as any,
          change_history: [{ created_at: new Date().toISOString(), text: prop.source_text_snippet || "Bóc tách văn bản từ Zalo OA" }],
        });
        insertedCount++;
      }
    } else {
      // Trường hợp dự phòng nếu AI không phát hiện ra căn nào
      const textOnly = deduplicatedTimeline.map((t) => t.text).join("\n\n");

      await supabase.from("property_listings").insert({
        submission_id: submissionId,
        partner_id: partner.id,
        review_status: "pending",
        address_text: textOnly.slice(0, 80) || "Đợt gửi từ Zalo OA",
        location_note: textOnly || "Không trích xuất được BĐS",
        attachments: [],
        key_details: {
          vi: textOnly || "Nội dung văn bản",
          en: textOnly || "Text content",
          zh: textOnly || "文本内容",
        },
        change_history: [{ created_at: new Date().toISOString(), text: textOnly || "Đợt gửi văn bản" }],
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