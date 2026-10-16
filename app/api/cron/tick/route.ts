import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractPropertiesFromChat } from "@/lib/ai/extract";

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

    // 1. Quét và chốt các khung tin nhắn đã hết thời gian gom (idle timeout / max window)
    const { data: closedSubmissions, error: closeError } = await supabaseAdmin.rpc(
      "close_expired_submissions"
    );

    if (closeError) {
      console.error("Error closing expired submissions:", closeError);
    }

    const closedCount = closedSubmissions?.length || 0;

    // 2. Kiểm tra cài đặt AI
    const { data: aiSettingRow } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "ai")
      .single();

    const isAiEnabled = (aiSettingRow?.value as any)?.enabled === true && Boolean(process.env.GEMINI_API_KEY);

    // 3. Xử lý các submissions vừa đóng
    if (closedSubmissions && closedSubmissions.length > 0) {
      for (const sub of closedSubmissions) {
        // KIỂM TRA CHỐNG TRÙNG LẶP: Nếu Webhook đã tạo listing từ trước, Cron không chèn lặp lại!
        const { count: existingListingsCount } = await supabaseAdmin
          .from("property_listings")
          .select("id", { count: "exact", head: true })
          .eq("submission_id", sub.submission_id);

        if (existingListingsCount && existingListingsCount > 0) {
          await supabaseAdmin
            .from("submissions")
            .update({
              status: "done",
              ai_status: "done",
              ai_mode: "ai_realtime_skipped_cron",
            })
            .eq("id", sub.submission_id);
          continue;
        }

        if (isAiEnabled && sub.raw_text && sub.raw_text.trim().length > 0) {
          try {
            // Cập nhật trạng thái đang xử lý AI
            await supabaseAdmin
              .from("submissions")
              .update({ ai_status: "processing", ai_attempts: 1 })
              .eq("id", sub.submission_id);

            // Bóc tách bằng Gemini Flash
            const result = await extractPropertiesFromChat(sub.raw_text);

            if (result.properties.length > 0) {
              for (const prop of result.properties) {
                await supabaseAdmin.from("property_listings").insert({
                  submission_id: sub.submission_id,
                  partner_id: sub.partner_id,
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
                  key_details: prop.key_details,
                  landlord_commission_text: prop.landlord_commission_text,
                  our_share_percent: prop.our_share_percent,
                  our_share_text: prop.our_share_text,
                  location_note: prop.source_text_snippet || sub.raw_text,
                  ai_extracted: prop as any,
                  needs_reply: result.needs_reply,
                  change_history: [{ created_at: new Date().toISOString(), text: prop.source_text_snippet || sub.raw_text }],
                });
              }
            } else {
              // Nếu AI không phát hiện ra căn nào (tin rỗng/tin chào hỏi), tạo nháp giữ tin gốc
              await supabaseAdmin.from("property_listings").insert({
                submission_id: sub.submission_id,
                partner_id: sub.partner_id,
                review_status: "pending",
                address_text: sub.raw_text.slice(0, 80),
                location_note: sub.raw_text,
                key_details: {
                  vi: sub.raw_text,
                  en: sub.raw_text,
                  zh: sub.raw_text,
                },
                change_history: [{ created_at: new Date().toISOString(), text: sub.raw_text }],
              });
            }

            // Hoàn tất submission
            await supabaseAdmin
              .from("submissions")
              .update({
                status: "done",
                ai_status: "done",
                ai_mode: "ai",
                ai_model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
              })
              .eq("id", sub.submission_id);
          } catch (aiErr: any) {
            console.error("AI processing failed, falling back to draft:", aiErr);
            // Fallback: tạo bản nháp thủ công
            await supabaseAdmin.from("property_listings").insert({
              submission_id: sub.submission_id,
              partner_id: sub.partner_id,
              review_status: "pending",
              address_text: sub.raw_text.slice(0, 100),
              location_note: sub.raw_text,
              key_details: { vi: sub.raw_text, en: sub.raw_text, zh: sub.raw_text },
              change_history: [{ created_at: new Date().toISOString(), text: sub.raw_text }],
            });
            await supabaseAdmin
              .from("submissions")
              .update({
                status: "done",
                ai_status: "failed",
                ai_error: aiErr?.message,
              })
              .eq("id", sub.submission_id);
          }
        } else {
          // Chế độ thủ công
          await supabaseAdmin.from("property_listings").insert({
            submission_id: sub.submission_id,
            partner_id: sub.partner_id,
            review_status: "pending",
            address_text: sub.raw_text?.slice(0, 100) || "Nguồn từ tin Zalo",
            key_details: {
              vi: sub.raw_text || "Chỉ có ảnh",
              en: sub.raw_text || "Photos only",
              zh: sub.raw_text || "仅有图片",
            },
          });

          await supabaseAdmin
            .from("submissions")
            .update({ status: "done", ai_status: "done", ai_mode: "manual" })
            .eq("id", sub.submission_id);
        }
      }
    }

    return NextResponse.json({
      status: "success",
      timestamp: new Date().toISOString(),
      closed_submissions_count: closedCount,
      ai_enabled: isAiEnabled,
    });
  } catch (err: any) {
    console.error("Cron tick error:", err);
    return NextResponse.json(
      { error: "Internal error", details: err?.message },
      { status: 500 }
    );
  }
}
