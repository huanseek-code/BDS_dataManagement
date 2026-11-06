import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processBatchSubmission } from "@/lib/zalo/batch-processor";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    let submissionId: string | null = null;
    try {
      const body = await req.json();
      submissionId = body?.submissionId || null;
    } catch {
      // Body rỗng -> xử lý các submissions hợp lệ đang chờ
    }

    const supabase = createAdminClient();

    let targetIds: string[] = [];
    if (submissionId) {
      targetIds = [submissionId];
    } else {
      const nowIso = new Date().toISOString();
      const { data: queuedSubs } = await supabase
        .from("submissions")
        .select("id, ai_status, updated_at")
        .in("status", ["queued", "collecting"])
        .neq("ai_status", "done")
        .lte("close_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(5);

      targetIds = (queuedSubs || [])
        .filter((sub) => {
          if (sub.ai_status === "processing") {
            const isStuck =
              !sub.updated_at ||
              new Date(sub.updated_at).getTime() < Date.now() - 2 * 60 * 1000;
            return isStuck;
          }
          return true;
        })
        .map((s) => s.id);
    }

    if (targetIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Không có đợt gửi nào đang chờ xử lý.",
        processedCount: 0,
      });
    }

    let totalProperties = 0;
    for (const sid of targetIds) {
      const res = await processBatchSubmission(sid);
      if (res.success) {
        totalProperties += res.propertyCount;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Đã xử lý xong ${targetIds.length} đợt gửi, trích xuất ${totalProperties} căn BĐS.`,
      processedBatches: targetIds.length,
      totalProperties,
    });
  } catch (err: any) {
    console.error("[Process Batch API Error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal Error" },
      { status: 500 }
    );
  }
}
