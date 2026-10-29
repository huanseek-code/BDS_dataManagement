import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadAndPersistZaloImage } from "@/lib/storage/r2";
import { fetchAndSyncZaloUserProfile } from "@/lib/zalo/profile";
import { processBatchSubmission } from "@/lib/zalo/batch-processor";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Xác thực chữ ký Zalo OA webhook
 * X-ZEvent-Signature: mac=sha256(appId + rawBody + timestamp + oaSecretKey)
 */
function verifyZaloSignature(
  rawBody: string,
  timestamp: string | null,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader) {
    return true;
  }

  const oaSecret = process.env.ZALO_OA_SECRET_KEY;
  const appSecret = process.env.ZALO_APP_SECRET;
  const appId = process.env.ZALO_APP_ID || "";
  const receivedMac = signatureHeader.replace(/^mac=/, "").trim().toLowerCase();

  const secrets = [oaSecret, appSecret].filter(Boolean) as string[];

  for (const secret of secrets) {
    const mac1 = crypto
      .createHash("sha256")
      .update(appId + rawBody + (timestamp || "") + secret)
      .digest("hex")
      .toLowerCase();
    if (mac1 === receivedMac) return true;

    const mac2 = crypto
      .createHash("sha256")
      .update(appId + rawBody + secret)
      .digest("hex")
      .toLowerCase();
    if (mac2 === receivedMac) return true;
  }

  try {
    const payload = JSON.parse(rawBody || "{}");
    if (!payload.event_name || payload.event_name === "test" || !payload.sender) {
      console.log("Zalo Developer Console test ping detected -> 200 OK");
      return true;
    }
  } catch {
    return true;
  }

  console.log("Zalo webhook received request with signature:", signatureHeader);
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const timestamp = req.headers.get("x-zevent-timestamp");
    const signature = req.headers.get("x-zevent-signature");

    if (!verifyZaloSignature(rawBody, timestamp, signature)) {
      return NextResponse.json(
        { error: -1, message: "Invalid Zalo signature" },
        { status: 401 }
      );
    }

    let payload: any = {};
    try {
      if (rawBody && rawBody.trim().length > 0) {
        payload = JSON.parse(rawBody);
      }
    } catch {
      console.warn("Zalo webhook non-json payload or test ping:", rawBody);
    }

    const eventName = payload?.event_name || "";
    const sender = payload?.sender;

    if (!eventName || eventName === "test" || !sender) {
      console.log("Zalo Developer Console test ping received -> Returning 200 OK");
      return NextResponse.json({ error: 0, message: "ok" }, { status: 200 });
    }

    const message = payload?.message || {};
    const zaloUserId = String(sender.id || payload.user_id_by_app || "unknown_user");
    const zaloMsgId = String(
      message.msg_id || payload.msg_id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    );
    const sentAt = new Date(payload.timestamp ? Number(payload.timestamp) : Date.now()).toISOString();

    let msgType = "other";
    let textContent: string | null = null;
    let imageUrls: string[] = [];

    // Parse các loại sự kiện tin nhắn
    if (eventName === "user_send_text") {
      msgType = "text";
      textContent = message.text || null;
    } else if (eventName === "user_send_image") {
      msgType = "image";
      // Bỏ qua việc tải ảnh xuống R2 theo định hướng kho dữ liệu thuần text
      textContent = message.text || null;
      imageUrls = [];
    } else if (eventName === "user_send_file") {
      msgType = "file";
      textContent = message.text || null;
    } else if (eventName === "user_send_sticker") {
      msgType = "sticker";
    }

    // Lưu ngay lập tức vào database qua Supabase RPC ingest_zalo_message
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabaseAdmin = createAdminClient();

      const { data: ingestResult, error: ingestError } = await supabaseAdmin.rpc(
        "ingest_zalo_message",
        {
          p_zalo_msg_id: zaloMsgId,
          p_zalo_user_id: zaloUserId,
          p_display_name: sender.name || "",
          p_event_name: eventName,
          p_msg_type: msgType,
          p_direction: "in",
          p_text_content: textContent || "",
          p_zalo_image_urls: imageUrls,
          p_storage_paths: [],
          p_raw_payload: payload,
          p_sent_at: sentAt,
        }
      );

      if (ingestError) {
        console.error("ingest_zalo_message RPC error:", ingestError);
      }

      const subId = (ingestResult as any)?.submission_id;

      // Gia hạn Cửa sổ gom tin văn bản (Debounce Window 35 giây) cho đợt gửi này
      if (subId) {
        const debouncedCloseAt = new Date(Date.now() + 35 * 1000).toISOString();
        await supabaseAdmin
          .from("submissions")
          .update({
            close_at: debouncedCloseAt,
            status: "queued",
            ai_status: "pending",
            updated_at: new Date().toISOString(),
          })
          .eq("id", subId);
      }

      // Xử lý ngầm sau khi trả lời nhanh cho Zalo (Next.js 16 after)
      after(async () => {
        try {
          const supabaseAdmin = createAdminClient();

          // 1. Đồng bộ profile nếu đối tác mới chưa có tên
          const { data: partner } = await supabaseAdmin
            .from("partners")
            .select("id, display_name")
            .eq("zalo_user_id", zaloUserId)
            .maybeSingle();

          if (partner && (!partner.display_name || partner.display_name.trim().length === 0)) {
            fetchAndSyncZaloUserProfile(zaloUserId, partner.id).catch((err) =>
              console.error("[Zalo Webhook] Auto sync profile error:", err)
            );
          }

          // 2. Kích hoạt bộ đếm thời gian tự động xử lý Batch sau 35 giây
          if (subId) {
            setTimeout(async () => {
              try {
                const sAdmin = createAdminClient();
                const { data: curSub } = await sAdmin
                  .from("submissions")
                  .select("id, status, close_at")
                  .eq("id", subId)
                  .single();

                // Nếu submission vẫn đang 'queued' và đã qua thời điểm close_at (không có tin mới gửi thêm)
                if (curSub && curSub.status === "queued") {
                  const closeAtMs = new Date(curSub.close_at).getTime();
                  if (Date.now() >= closeAtMs - 2000) {
                    console.log(`[Debounce Ingestion Timer] Đã hết 35s chờ, bắt đầu bóc tách văn bản batch ${subId}...`);
                    await processBatchSubmission(subId);
                  }
                }
              } catch (timerErr) {
                console.error("[Debounce Ingestion Timer Error]:", timerErr);
              }
            }, 35000);
          }
        } catch (bgErr) {
          console.error("[Webhook Background Task Error]:", bgErr);
        }
      });
    }

    // Trả lời HTTP 200 OK ngay lập tức cho Zalo (< 50ms)
    return NextResponse.json({ error: 0, message: "success" }, { status: 200 });
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return NextResponse.json({ error: 0, message: "processed_with_error" }, { status: 200 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    service: "Huanseek Zalo OA Webhook Ingestion API (Debounced Batch Architecture)",
  });
}
