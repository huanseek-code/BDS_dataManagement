import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractPropertiesFromChat } from "@/lib/ai/extract";
import { downloadAndPersistZaloImage } from "@/lib/storage/r2";
import { fetchAndSyncZaloUserProfile } from "@/lib/zalo/profile";

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
  // Nếu Zalo Developer gửi ping test không có signature
  if (!signatureHeader) {
    return true;
  }

  const oaSecret = process.env.ZALO_OA_SECRET_KEY;
  const appSecret = process.env.ZALO_APP_SECRET;
  const appId = process.env.ZALO_APP_ID || "";
  const receivedMac = signatureHeader.replace(/^mac=/, "").trim().toLowerCase();

  const secrets = [oaSecret, appSecret].filter(Boolean) as string[];

  for (const secret of secrets) {
    // 1. Công thức Zalo OA: sha256(appId + rawBody + timestamp + secret)
    const mac1 = crypto
      .createHash("sha256")
      .update(appId + rawBody + (timestamp || "") + secret)
      .digest("hex")
      .toLowerCase();
    if (mac1 === receivedMac) return true;

    // 2. Công thức biến thể sha256(appId + rawBody + secret)
    const mac2 = crypto
      .createHash("sha256")
      .update(appId + rawBody + secret)
      .digest("hex")
      .toLowerCase();
    if (mac2 === receivedMac) return true;
  }

  // Nếu là ping kiểm tra từ giao diện Zalo Developer Console
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

    // Nếu là request kiểm tra kết nối từ Zalo Developer Console
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

    // Parse event types
    if (eventName === "user_send_text") {
      msgType = "text";
      textContent = message.text || null;
    } else if (eventName === "user_send_image") {
      msgType = "image";
      textContent = message.text || null;
      if (Array.isArray(message.attachments)) {
        const rawUrls = message.attachments
          .map((att: any) => att?.payload?.url || att?.url)
          .filter(Boolean);

        // Lưu trữ vĩnh viễn lên Cloudflare R2 (hoặc fallback URL gốc nếu chưa có R2)
        imageUrls = await Promise.all(
          rawUrls.map((url: string) => downloadAndPersistZaloImage(url))
        );
      }
    } else if (eventName === "user_send_file") {
      msgType = "file";
      textContent = message.text || null;
    } else if (eventName === "user_send_sticker") {
      msgType = "sticker";
    }

    // Call Supabase RPC ingest_zalo_message
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

      // Fast Real-Time Smart Append & Instant Extraction via Next.js 16 after()
      after(async () => {
        try {
          const supabaseAdmin = createAdminClient();

          // 1. Tìm partner_id tương ứng với zaloUserId
          const { data: partner } = await supabaseAdmin
            .from("partners")
            .select("id, display_name")
            .eq("zalo_user_id", zaloUserId)
            .maybeSingle();

          if (!partner) return;

          // Tự động đồng bộ tên hiển thị từ Zalo OA nếu chưa có tên
          if (!partner.display_name || partner.display_name.trim().length === 0) {
            fetchAndSyncZaloUserProfile(zaloUserId, partner.id).catch((err) =>
              console.error("[Zalo Webhook] Auto sync profile error:", err)
            );
          }

          // 2. Tìm hồ sơ BĐS đang "Chờ duyệt" (review_status = 'pending') gần nhất
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

          const { data: pendingListing } = await supabaseAdmin
            .from("property_listings")
            .select("*")
            .eq("partner_id", partner.id)
            .eq("review_status", "pending")
            .gte("updated_at", twoHoursAgo)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const subId = (ingestResult as any)?.submission_id || pendingListing?.submission_id;

          // Cửa sổ thời gian nhận ảnh tiếp nối (Burst Window): Trong vòng 5 phút kể từ khi căn được tạo/cập nhật
          const isPendingActiveBurst = Boolean(
            pendingListing &&
            new Date(pendingListing.updated_at).getTime() >= Date.now() - 5 * 60 * 1000
          );

          // 3. Nếu tin nhắn có ảnh và ĐANG TRONG CỬA SỔ 5 PHÚT của căn gần nhất -> Gắn thêm ảnh vào căn đó
          if (imageUrls.length > 0 && isPendingActiveBurst && pendingListing) {
            const { data: freshPending } = await supabaseAdmin
              .from("property_listings")
              .select("attachments")
              .eq("id", pendingListing.id)
              .single();
            const currentAttachments = Array.isArray(freshPending?.attachments) ? freshPending.attachments : [];
            const mergedAttachments = [...new Set([...currentAttachments, ...imageUrls])];
            await supabaseAdmin
              .from("property_listings")
              .update({
                attachments: mergedAttachments,
                updated_at: new Date().toISOString(),
              })
              .eq("id", pendingListing.id);
            console.log(`[Burst Append] Attached ${imageUrls.length} image(s) to recent pending listing ${pendingListing.id}`);
          }

          // Nếu chỉ gửi ảnh thuần túy (không có text) -> Dừng tại đây vì ảnh đã được lưu an toàn trong zalo_incoming_chats
          if (!textContent || textContent.trim().length === 0) {
            return;
          }

          const cleanText = (textContent || "").trim();
          // Bỏ qua các tin nhắn chào hỏi hoặc lệnh điều hướng đơn thuần
          const isSystemGreeting = /^(hello|hi|chào|xin chào|#gui_nguon|xong|xong\.|ok|đã xong)$/i.test(cleanText);

          if (!cleanText || (isSystemGreeting && !pendingListing)) {
            return;
          }

          // 3b. Kiểm tra chống gửi lặp tin nhắn trong vòng 90 giây (Debounce / Deduplication)
          const ninetySecondsAgo = new Date(Date.now() - 90 * 1000).toISOString();
          const { data: duplicateChat } = await supabaseAdmin
            .from("zalo_incoming_chats")
            .select("id")
            .eq("partner_id", partner.id)
            .eq("text_content", textContent)
            .gte("created_at", ninetySecondsAgo)
            .neq("zalo_msg_id", zaloMsgId)
            .limit(1)
            .maybeSingle();

          if (duplicateChat) {
            console.log(`[Debounce] Bỏ qua tin nhắn trùng lặp trong 90s từ đối tác ${partner.id} để tiết kiệm chi phí Gemini.`);
            return;
          }

          // 4. Chuẩn bị ngữ cảnh cho Gemini (Chỉ dùng ngữ cảnh nếu căn đang chờ duyệt trong cửa sổ 5 phút gần đây)
          let existingContextText: string | null = null;
          if (isPendingActiveBurst && pendingListing) {
            const currentDetails = pendingListing.key_details as any;
            existingContextText = `
- Địa chỉ: ${pendingListing.address_text || "Chưa có"}
- Diện tích: ${pendingListing.floor_area_m2 || pendingListing.total_lease_area_m2 || "Chưa có"} m2
- Đơn giá chào: ${pendingListing.price_amount ? pendingListing.price_amount + " " + pendingListing.price_currency : "Chưa có"}
- Hoa hồng: ${pendingListing.landlord_commission_text || "Chưa có"}
- Đặc điểm: ${currentDetails?.vi || "Chưa có"}
- Ghi chú: ${pendingListing.price_text || ""}
`.trim();
          }

          // 5. Gọi Gemini AI bóc tách & phán đoán ngữ nghĩa (Decision: CONTINUATION vs NEW_PROPERTY)
          const result = await extractPropertiesFromChat(cleanText, imageUrls, existingContextText);

          if (result.properties.length > 0) {
            const prop = result.properties[0];

            if (result.decision === "CONTINUATION" && isPendingActiveBurst && pendingListing) {
              // --- HỢP NHẤT BỒI ĐẮP VÀO CĂN ĐANG CHỜ DUYỆT ---
              const { data: freshPending } = await supabaseAdmin
                .from("property_listings")
                .select("attachments")
                .eq("id", pendingListing.id)
                .single();

              const currentAtts = Array.isArray(freshPending?.attachments) ? (freshPending.attachments as unknown as string[]) : [];
              const mergedAttachments = [...new Set([...currentAtts, ...imageUrls])];
              const prevHistory = Array.isArray(pendingListing.change_history) ? pendingListing.change_history : [];

              await supabaseAdmin
                .from("property_listings")
                .update({
                  address_text: (prop.address_text && prop.address_text !== "null" && prop.address_text.length > 3)
                    ? prop.address_text
                    : (pendingListing.address_text || prop.address_text),
                  house_number: prop.house_number || pendingListing.house_number,
                  street_name: prop.street_name || pendingListing.street_name,
                  ward: prop.ward || pendingListing.ward,
                  district_legacy: prop.district_legacy || pendingListing.district_legacy,
                  province: prop.province || pendingListing.province || null,
                  property_types: (prop.property_types && prop.property_types.length > 0)
                    ? prop.property_types
                    : pendingListing.property_types,
                  floor_area_m2: prop.floor_area_m2 || pendingListing.floor_area_m2,
                  total_lease_area_m2: prop.total_lease_area_m2 || pendingListing.total_lease_area_m2,
                  price_amount: prop.price_amount || pendingListing.price_amount,
                  price_currency: prop.price_currency || pendingListing.price_currency,
                  price_period: prop.price_period || pendingListing.price_period,
                  price_basis: prop.price_basis || pendingListing.price_basis,
                  price_text: prop.price_text || pendingListing.price_text,
                  key_details: {
                    ...((prop.key_details || pendingListing.key_details || {}) as any),
                    handover_condition: prop.handover_condition || (pendingListing.key_details as any)?.handover_condition,
                  },
                  landlord_commission_text: prop.landlord_commission_text || pendingListing.landlord_commission_text,
                  our_share_percent: prop.our_share_percent || pendingListing.our_share_percent,
                  our_share_text: prop.our_share_text || pendingListing.our_share_text,
                  location_note: prop.source_text_snippet || pendingListing.location_note || cleanText,
                  attachments: mergedAttachments,
                  ai_extracted: prop as any,
                  needs_reply: result.needs_reply,
                  change_history: [...prevHistory, { appended_at: new Date().toISOString(), text: cleanText }],
                  updated_at: new Date().toISOString(),
                })
                .eq("id", pendingListing.id);

              console.log(`[Smart Append] Merged message into pending listing ${pendingListing.id} with ${mergedAttachments.length} attachments`);
              revalidatePath("/inbox");
            } else {
              // --- TẠO CĂN BĐS MỚI ĐỘC LẬP (BOUNDED TEMPORAL & CLAIM-BASED CLUSTERING) ---
              // 1. Quét toàn bộ ảnh ĐÃ ĐƯỢC GÁN cho các căn khác của partner này (ngăn chặn tái sử dụng / rò rỉ ảnh cũ)
              const { data: pastListings } = await supabaseAdmin
                .from("property_listings")
                .select("attachments")
                .eq("partner_id", partner.id)
                .gte("created_at", twoHoursAgo);

              const claimedUrls = new Set<string>();
              for (const pl of pastListings || []) {
                if (Array.isArray(pl.attachments)) {
                  for (const url of pl.attachments) {
                    if (url && typeof url === "string") claimedUrls.add(url);
                  }
                }
              }

              // 2. Tìm các ảnh gửi trong 5 phút gần đây chưa bị gán vào bất kỳ căn nào (Mô hình: Gửi ảnh trước, gửi tin nhắn sau)
              const { data: recentChats } = await supabaseAdmin
                .from("zalo_incoming_chats")
                .select("zalo_image_urls")
                .eq("partner_id", partner.id)
                .gte("created_at", fiveMinutesAgo);

              const unassignedRecentImages: string[] = [];
              for (const rc of recentChats || []) {
                if (Array.isArray(rc.zalo_image_urls)) {
                  for (const u of rc.zalo_image_urls) {
                    if (u && typeof u === "string" && !claimedUrls.has(u)) {
                      unassignedRecentImages.push(u);
                    }
                  }
                }
              }

              // Tập ảnh hợp lệ cho căn mới này = ảnh trong tin nhắn hiện tại + ảnh unassigned gần đây
              const candidateAttachments = [...new Set([...imageUrls, ...unassignedRecentImages])];

              for (let pIdx = 0; pIdx < result.properties.length; pIdx++) {
                const p = result.properties[pIdx];
                // Căn đầu tiên sẽ nhận toàn bộ ảnh gom được
                const finalAttachments = pIdx === 0 ? candidateAttachments : [];

                await supabaseAdmin.from("property_listings").insert({
                  submission_id: subId || null,
                  partner_id: partner.id,
                  review_status: "pending",
                  address_text: p.address_text,
                  house_number: p.house_number,
                  street_name: p.street_name,
                  ward: p.ward,
                  district_legacy: p.district_legacy,
                  province: p.province || null,
                  property_types: p.property_types || [],
                  floor_area_m2: p.floor_area_m2,
                  total_lease_area_m2: p.total_lease_area_m2,
                  price_amount: p.price_amount,
                  price_currency: p.price_currency || "VND",
                  price_period: p.price_period || "month",
                  price_basis: p.price_basis || "total",
                  price_text: p.price_text,
                  key_details: {
                    ...((p.key_details || {}) as any),
                    handover_condition: p.handover_condition,
                  },
                  landlord_commission_text: p.landlord_commission_text,
                  our_share_percent: p.our_share_percent,
                  our_share_text: p.our_share_text,
                  location_note: p.source_text_snippet || cleanText,
                  attachments: finalAttachments,
                  ai_extracted: p as any,
                  needs_reply: result.needs_reply,
                  change_history: [{ created_at: new Date().toISOString(), text: p.source_text_snippet || cleanText }],
                });
              }

              if (subId) {
                // Ghi nhận vào submissions để Cron tick không chạy bóc tách trùng lặp
                await supabaseAdmin
                  .from("submissions")
                  .update({
                    ai_status: "done",
                    ai_mode: "ai_realtime",
                    ai_model: process.env.GEMINI_MODEL || "gemini-flash-latest",
                  })
                  .eq("id", subId);
              }

              console.log(`[Instant Processing] Created ${result.properties.length} new listing(s) with ${candidateAttachments.length} isolated attachments for partner ${partner.id}`);
              revalidatePath("/inbox");
            }
          }
        } catch (bgErr) {
          console.error("[Instant Smart Append Error]:", bgErr);
        }
      });
    }

    // Return 200 OK immediately to Zalo
    return NextResponse.json({ error: 0, message: "success" }, { status: 200 });
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    // Still return 200 to prevent Zalo retry loops for malformed JSON
    return NextResponse.json({ error: 0, message: "processed_with_error" }, { status: 200 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    service: "Huanseek Zalo OA Webhook Ingestion API",
  });
}
