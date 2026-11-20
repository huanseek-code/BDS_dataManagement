import { NextRequest, NextResponse } from "next/server";
import { processPendingSubmissionsQueue } from "@/lib/zalo/batch-processor";

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

    const res = await processPendingSubmissionsQueue({
      originUrl: req.nextUrl.origin,
    });

    return NextResponse.json({
      status: "success",
      timestamp: new Date().toISOString(),
      processed_count: res.processedCount,
      retried_success_count: res.retriedSuccessCount,
      total_properties: res.totalProperties,
    });
  } catch (err: any) {
    console.error("Cron tick error:", err);
    return NextResponse.json(
      { error: "Internal error", details: err?.message },
      { status: 500 }
    );
  }
}
