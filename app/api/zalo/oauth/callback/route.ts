import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get("code");
    const oaId = searchParams.get("oa_id");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (error) {
      return new NextResponse(
        `<html><body style="font-family:sans-serif;padding:40px;text-align:center;">
          <h2 style="color:#e11d48;">Cấp quyền thất bại</h2>
          <p>${errorDescription || error}</p>
        </body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 400 }
      );
    }

    if (!code) {
      return new NextResponse(
        `<html><body style="font-family:sans-serif;padding:40px;text-align:center;">
          <h2>Không tìm thấy mã xác thực (authorization code)</h2>
        </body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 400 }
      );
    }

    const appId = process.env.ZALO_APP_ID || "";
    const secretKey = process.env.ZALO_APP_SECRET || process.env.ZALO_OA_SECRET_KEY || "";

    // Gửi yêu cầu đổi authorization_code lấy access_token
    let tokenData: any = null;
    try {
      const tokenRes = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          secret_key: secretKey,
        },
        body: new URLSearchParams({
          code,
          app_id: appId,
          grant_type: "authorization_code",
        }),
      });

      tokenData = await tokenRes.json();
      console.log("[Zalo OA OAuth Callback] Token response:", tokenData);

      if (tokenData.access_token) {
        // Lưu vào Supabase zalo_oa_tokens
        const supabaseAdmin = createAdminClient();
        const expiresAt = new Date(Date.now() + (Number(tokenData.expires_in) || 7776000) * 1000).toISOString();

        await supabaseAdmin.from("zalo_oa_tokens").upsert({
          id: 1,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || "",
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("[Zalo OA OAuth Callback] Token exchange failed:", err);
    }

    return new NextResponse(
      `<!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <title>Cấp quyền thành công</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; text-align: center; }
          .card { background: #1e293b; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); max-width: 480px; border: 1px solid #334155; }
          .icon { font-size: 54px; margin-bottom: 16px; }
          h1 { font-size: 24px; margin: 0 0 12px; color: #38bdf8; }
          p { color: #94a3b8; font-size: 15px; line-height: 1.6; }
          .badge { display: inline-block; background: #0284c7; color: white; padding: 6px 14px; border-radius: 999px; font-weight: 600; margin-top: 16px; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">🎉</div>
          <h1>Cấp quyền OA thành công!</h1>
          <p>Official Account <strong>Huanseek</strong> (OA ID: ${oaId || "Đã liên kết"}) đã được cấp quyền thành công cho ứng dụng.</p>
          <div class="badge">Zalo Webhook đã sẵn sàng nhận tin</div>
          <p style="margin-top: 24px; font-size: 13px;">Bạn có thể quay lại trang <strong>Zalo for Developers</strong> hoặc đóng cửa sổ này.</p>
        </div>
      </body>
      </html>`,
      {
        headers: { "Content-Type": "text/html; charset=utf-8" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("[Zalo OA OAuth Callback] Error:", error);
    return new NextResponse(`Error: ${error.message}`, { status: 500 });
  }
}
