import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processBatchSubmission } from "@/lib/zalo/batch-processor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return handleCronTick(req);
}

export async function POST(req: NextRequest) {
  return handleCronTick(req);
}

async function handleCronTick(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("x-cron-secret") || req.headers.get("authorization");

    // Nếu đã cấu hình cron secret, kiểm tra bảo mật
    if (cronSecret && authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (token !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({
        status: "skipped",
        reason: "SUPABASE_SERVICE_ROLE_KEY not configured yet",
      });
    }

    const supabaseAdmin = createAdminClient();

    // 1. Quét và chốt các khung tin nhắn đã hết thời gian gom qua RPC
    const { data: closedSubmissions, error: closeError } = await supabaseAdmin.rpc(
      "close_expired_submissions"
    );

    if (closeError) {
      console.error("Error closing expired submissions:", closeError);
    }

    // 2. Tìm tất cả các submissions đang 'queued' mà đã qua thời điểm close_at (hoặc close_reason = idle_timeout)
    const nowIso = new Date().toISOString();
    const { data: queuedSubs } = await supabaseAdmin
      .from("submissions")
      .select("id")
      .eq("status", "queued")
      .neq("ai_status", "processing")
      .lte("close_at", nowIso)
      .limit(10);

    const targetSubIds = new Set<string>();
    for (const cs of closedSubmissions || []) {
      if (cs.submission_id) targetSubIds.add(cs.submission_id);
    }
    for (const qs of queuedSubs || []) {
      if (qs.id) targetSubIds.add(qs.id);
    }

    let processedCount = 0;
    for (const subId of targetSubIds) {
      try {
        console.log(`[Cron Tick] Đang xử lý đợt gom tin nhắn: ${subId}`);
        const res = await processBatchSubmission(subId);
        if (res.success) {
          processedCount++;
        }
      } catch (subErr) {
        console.error(`[Cron Tick] Lỗi xử lý submission ${subId}:`, subErr);
      }
    }

    return NextResponse.json({
      status: "success",
      timestamp: new Date().toISOString(),
      closed_submissions_count: targetSubIds.size,
      processed_count: processedCount,
    });
  } catch (err: any) {
    console.error("Cron tick error:", err);
    return NextResponse.json(
      { error: "Internal error", details: err?.message },
      { status: 500 }
    );
  }
}
