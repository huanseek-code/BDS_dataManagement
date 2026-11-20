import { NextRequest, NextResponse } from "next/server";
import { processBatchSubmission, processPendingSubmissionsQueue } from "@/lib/zalo/batch-processor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    let submissionId: string | null = null;
    try {
      const body = await req.json();
      submissionId = body?.submissionId || null;
    } catch {
      // Body rỗng -> xử lý hàng đợi cuốn chiếu các tin đang chờ
    }

    if (submissionId) {
      const res = await processBatchSubmission(submissionId, true);
      return NextResponse.json({
        success: res.success,
        message: res.message,
        processedBatches: res.success ? 1 : 0,
        totalProperties: res.propertyCount,
      });
    }

    const queueRes = await processPendingSubmissionsQueue({
      originUrl: req.nextUrl.origin,
    });

    return NextResponse.json({
      success: true,
      message: `Đã xử lý xong ${queueRes.processedCount} tin nhắn (phục hồi ${queueRes.retriedSuccessCount} tin lỗi), trích xuất ${queueRes.totalProperties} căn BĐS.`,
      processedBatches: queueRes.processedCount,
      retriedSuccessCount: queueRes.retriedSuccessCount,
      totalProperties: queueRes.totalProperties,
    });
  } catch (err: any) {
    console.error("[Process Batch API Error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal Error" },
      { status: 500 }
    );
  }
}
