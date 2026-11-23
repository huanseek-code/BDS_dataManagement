import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractBatchPropertiesFromTimeline, BatchTimelineItem } from "@/lib/ai/batch-extract";
import { getGeminiApiKeys } from "@/lib/ai/key-manager";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Xử lý 1 tin nhắn BĐS độc lập (1 tin nhắn = 1 submission = 1 lệnh AI riêng biệt):
 * 1. Lấy đúng nội dung văn bản của tin nhắn thuộc submissionId này (không trộn lẫn tin khác).
 * 2. Gọi Gemini 3.x bóc tách chuẩn xác thông tin BĐS trong tin nhắn đó.
 * 3. Lưu vào property_listings (Hộp thư chờ duyệt).
 */
export async function processBatchSubmission(
  submissionId: string,
  isRetryPass: boolean = false
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

  // Chống xử lý trùng lặp nếu submission đã hoàn tất
  if (submission.status === "done" && submission.ai_status === "done") {
    return { success: true, propertyCount: 0, message: "Submission đã được xử lý hoàn tất trước đó" };
  }

  // Nếu đang được tiến trình khác xử lý và chưa quá 45 giây -> Bỏ qua để tránh chạy đè
  if (
    !isRetryPass &&
    submission.ai_status === "processing" &&
    submission.updated_at &&
    new Date(submission.updated_at).getTime() > Date.now() - 45 * 1000
  ) {
    return { success: true, propertyCount: 0, message: "Submission đang được xử lý bởi tiến trình khác" };
  }

  // Đánh dấu trạng thái đang xử lý
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
    // 3. Chỉ lấy đúng tin nhắn thuộc submissionId này trong zalo_incoming_chats (1 tin nhắn = 1 lệnh AI độc lập)
    const { data: localChats } = await supabase
      .from("zalo_incoming_chats")
      .select("*")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: true });

    const timelineItems: BatchTimelineItem[] = [];
    for (const lc of localChats || []) {
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

    // Dự phòng từ raw_text của chính submission đó
    if (timelineItems.length === 0 && submission.raw_text && submission.raw_text.trim().length > 0) {
      const subTime = submission.first_msg_at ? new Date(submission.first_msg_at).getTime() : Date.now();
      timelineItems.push({
        msg_id: `raw_${submission.id}`,
        time: subTime,
        sent_time: new Date(subTime).toLocaleTimeString("vi-VN"),
        type: "text",
        text: submission.raw_text,
      });
    }

    if (timelineItems.length === 0) {
      await supabase
        .from("submissions")
        .update({ status: "done", ai_status: "done", ai_mode: "ai" })
        .eq("id", submissionId);
      return { success: true, propertyCount: 0, message: "Tin nhắn không có nội dung văn bản BĐS" };
    }

    // 4. Gọi câu lệnh AI riêng biệt cho tin nhắn này
    console.log(`[Per-Message AI] Đang bóc tách tin nhắn ${submissionId}${isRetryPass ? " (Chạy lại tin lỗi)" : ""}...`);
    const batchResult = await extractBatchPropertiesFromTimeline(timelineItems);

    let insertedCount = 0;

    // Xóa bản nháp cũ của submission này (nếu có do retry)
    await supabase
      .from("property_listings")
      .delete()
      .eq("submission_id", submissionId)
      .eq("review_status", "pending");

    // 5. Lưu kết quả bóc tách vào property_listings
    if (batchResult.properties.length > 0) {
      for (const prop of batchResult.properties) {
        const cleanSnippet = String(prop.source_text_snippet || submission.raw_text || "")
          .replace(/\\r\\n/g, "\n")
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "");

        const rawBasis = String(prop.price_basis || "").toLowerCase();
        const normalizedBasis =
          rawBasis === "per_m2" || rawBasis.includes("m2") || rawBasis.includes("m²")
            ? "per_m2"
            : rawBasis === "per_floor" || rawBasis.includes("sàn") || rawBasis.includes("tầng")
            ? "per_floor"
            : "total";

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
          price_basis: normalizedBasis,
          price_text: prop.price_text || null,
          key_details: {
            ...((prop.key_details || {}) as any),
            lease_term_text: prop.lease_term_text || null,
            furniture_status: prop.furniture_status || null,
            furniture_list: prop.furniture_list || null,
            handover_condition: prop.furniture_status || null,
            secondary_price_amount: (prop as any).secondary_price_amount || (prop.key_details as any)?.secondary_price_amount || null,
            secondary_price_currency: (prop as any).secondary_price_currency || (prop.key_details as any)?.secondary_price_currency || null,
            secondary_price_basis: (prop as any).secondary_price_basis || (prop.key_details as any)?.secondary_price_basis || null,
            secondary_price_basis_text: (prop as any).secondary_price_basis_text || (prop.key_details as any)?.secondary_price_basis_text || null,
            secondary_price_period: (prop as any).secondary_price_period || (prop.key_details as any)?.secondary_price_period || null,
            secondary_price_text: (prop as any).secondary_price_text || (prop.key_details as any)?.secondary_price_text || null,
          },
          landlord_commission_text: prop.landlord_commission_text || null,
          our_share_percent: prop.our_share_percent || null,
          our_share_text: prop.our_share_text || null,
          location_note: cleanSnippet,
          attachments: [],
          ai_extracted: prop as any,
          change_history: [{ created_at: new Date().toISOString(), text: cleanSnippet || "Bóc tách văn bản từ Zalo OA" }],
        });
        insertedCount++;
      }
    }

    // 6. Đánh dấu hoàn tất submission
    await supabase
      .from("submissions")
      .update({
        status: "done",
        ai_status: "done",
        ai_error: null,
        ai_mode: "ai",
        ai_model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
        updated_at: new Date().toISOString(),
      })
      .eq("id", submissionId);

    console.log(`[Per-Message AI] Hoàn tất tin nhắn ${submissionId}: Tạo ${insertedCount} căn BĐS.`);
    try {
      revalidatePath("/inbox");
    } catch {
      // Bỏ qua nếu ngoài request lifecycle
    }

    return {
      success: true,
      propertyCount: insertedCount,
      message: `Đã xử lý thành công tin nhắn: tạo ${insertedCount} căn BĐS.`,
    };
  } catch (err: any) {
    console.error(`[Per-Message AI] Lỗi xử lý tin nhắn ${submissionId}:`, err?.message || err);
    await supabase
      .from("submissions")
      .update({
        ai_status: "failed",
        ai_error: err?.message || String(err),
        updated_at: new Date().toISOString(),
      })
      .eq("id", submissionId);
    return { success: false, propertyCount: 0, message: err?.message || "Lỗi xử lý tin nhắn" };
  }
}

/**
 * Bộ điều phối Hàng đợi Cuốn chiếu cho từng tin nhắn (Per-Message Wave Queue + End-of-Session Retry):
 * 1. Xử lý lần lượt từng lượt (mỗi lượt 1-2 tin tùy số API Key).
 * 2. Sau mỗi lượt nghỉ 1.5 giây (1500ms) rồi mới sang lượt tiếp theo để chống nghẽn Rate Limit.
 * 3. Cuối phiên (sau khi hoàn tất 1 lượt toàn bộ tin mới): Tự động chạy lại các tin bị lỗi (failed) tối đa 2 lần.
 * 4. Tự nối dây chuyền (Self-Chaining) nếu số lượng tin quá lớn để không bao giờ vướng giới hạn thời gian Server.
 */
export async function processPendingSubmissionsQueue(options?: {
  originUrl?: string;
  specificSubmissionId?: string | null;
}): Promise<{
  processedCount: number;
  retriedSuccessCount: number;
  totalProperties: number;
}> {
  const supabase = createAdminClient();
  const startTimeMs = Date.now();
  const MAX_SAFE_RUNTIME_MS = 28000; // Tự chuyển tiếp dây chuyền nếu chạy quá 28 giây
  const WAVE_DELAY_MS = 1500; // Nghỉ 1.5 giây giữa các lượt theo đúng yêu cầu
  const RETRY_DELAY_MS = 2000; // Nghỉ 2 giây trước khi chạy lại tin lỗi cuối phiên

  const keyCount = Math.max(getGeminiApiKeys().length, 1);
  const waveSize = Math.min(keyCount, 2); // Mỗi lượt 1-2 tin nhắn song song

  let processedCount = 0;
  let retriedSuccessCount = 0;
  let totalProperties = 0;
  const failedInThisSession = new Set<string>();

  // 1. Lấy danh sách các tin nhắn đang chờ xử lý (theo thứ tự gửi từ cũ đến mới)
  const { data: pendingSubs } = await supabase
    .from("submissions")
    .select("id, ai_status, updated_at, created_at")
    .in("status", ["queued", "collecting"])
    .neq("ai_status", "done")
    .order("created_at", { ascending: true })
    .limit(40);

  const queueIds: string[] = [];
  if (options?.specificSubmissionId) {
    queueIds.push(options.specificSubmissionId);
  }

  for (const sub of pendingSubs || []) {
    if (queueIds.includes(sub.id)) continue;
    if (sub.ai_status === "processing") {
      const isStuck = !sub.updated_at || new Date(sub.updated_at).getTime() < Date.now() - 45 * 1000;
      if (!isStuck) continue;
    }
    if (sub.ai_status === "failed") {
      failedInThisSession.add(sub.id);
      continue;
    }
    queueIds.push(sub.id);
  }

  // 2. VÒNG LẶP CHÍNH: Xử lý cuốn chiếu từng lượt + nghỉ 1.5 giây giữa các lượt
  for (let i = 0; i < queueIds.length; i += waveSize) {
    const waveIds = queueIds.slice(i, i + waveSize);
    const results = await Promise.all(waveIds.map((id) => processBatchSubmission(id, false)));

    for (let idx = 0; idx < results.length; idx++) {
      const res = results[idx];
      const sid = waveIds[idx];
      if (res.success) {
        processedCount++;
        totalProperties += res.propertyCount;
      } else {
        failedInThisSession.add(sid);
      }
    }

    // Nếu còn lượt tiếp theo: Kiểm tra thời gian hoặc nghỉ 1.5 giây trước khi sang lượt kế tiếp
    if (i + waveSize < queueIds.length) {
      if (Date.now() - startTimeMs >= MAX_SAFE_RUNTIME_MS) {
        triggerNextQueueChain(options?.originUrl);
        return { processedCount, retriedSuccessCount, totalProperties };
      }
      await sleep(WAVE_DELAY_MS);
    }
  }

  // 3. CUỐI PHIÊN: Sau khi hoàn thành xong 1 lượt tất cả các tin, chạy lại các tin bị lỗi 1 - 2 lần nữa
  let remainingFailedIds = Array.from(failedInThisSession);
  for (let retryRound = 1; retryRound <= 2 && remainingFailedIds.length > 0; retryRound++) {
    if (Date.now() - startTimeMs >= MAX_SAFE_RUNTIME_MS) {
      triggerNextQueueChain(options?.originUrl);
      return { processedCount, retriedSuccessCount, totalProperties };
    }

    console.log(
      `[Per-Message Queue] Cuối phiên - Chạy lại lần ${retryRound}/2 cho ${remainingFailedIds.length} tin bị lỗi...`
    );
    await sleep(RETRY_DELAY_MS);

    const stillFailed: string[] = [];
    for (const failedId of remainingFailedIds) {
      if (Date.now() - startTimeMs >= MAX_SAFE_RUNTIME_MS) {
        stillFailed.push(failedId);
        continue;
      }
      const retryRes = await processBatchSubmission(failedId, true);
      if (retryRes.success) {
        retriedSuccessCount++;
        processedCount++;
        totalProperties += retryRes.propertyCount;
      } else {
        stillFailed.push(failedId);
      }
      await sleep(1000);
    }
    remainingFailedIds = stillFailed;
  }

  // Nếu sau 2 lần retry cuối phiên vẫn còn tin lỗi không thể phục hồi, đóng trạng thái để không treo vòng lặp vô hạn
  if (remainingFailedIds.length > 0) {
    await supabase
      .from("submissions")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .in("id", remainingFailedIds);
  }

  return { processedCount, retriedSuccessCount, totalProperties };
}

function triggerNextQueueChain(originUrl?: string) {
  if (!originUrl) return;
  console.log("[Per-Message Queue] Tự động kích hoạt tiến trình nối tiếp để xử lý nốt hàng đợi...");
  fetch(`${originUrl}/api/inbox/process-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chained: true }),
  }).catch((err) => console.error("[Per-Message Queue Chain Error]:", err));
}
