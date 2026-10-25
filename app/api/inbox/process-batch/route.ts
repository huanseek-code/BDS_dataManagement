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
      // Body rỗng -> xử lý tất cả submissions đang queued
    }

    const supabase = createAdminClient();

    let targetIds: string[] = [];
    if (submissionId) {
      targetIds = [submissionId];
    } else {
      const { data: queuedSubs } = await supabase
        .from("submissions")
        .select("id")
        .eq("status", "queued")
        .order("created_at", { ascending: false })
        .limit(10);
      targetIds = (queuedSubs || []).map((s) => s.id);
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
