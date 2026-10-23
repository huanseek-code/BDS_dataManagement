import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lấy Access Token Zalo OA còn hiệu lực, tự động refresh nếu hết hạn
 */
export async function getValidZaloOAToken(): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: tokenRow } = await supabase.from("zalo_oa_tokens").select("*").single();

  if (!tokenRow) return null;

  const now = Date.now();
  const expiresAt = new Date(tokenRow.expires_at).getTime();

  // Nếu token còn hạn ít nhất 5 phút
  if (expiresAt - now > 5 * 60 * 1000) {
    return tokenRow.access_token;
  }

  // Token hết hạn hoặc sắp hết hạn -> Dùng refresh_token đổi token mới
  if (!tokenRow.refresh_token) {
    return tokenRow.access_token;
  }

  try {
    const appId = process.env.ZALO_APP_ID;
    const secretKey = process.env.ZALO_APP_SECRET || process.env.ZALO_OA_SECRET_KEY;

    const res = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        secret_key: secretKey || "",
      },
      body: new URLSearchParams({
        app_id: appId || "",
        grant_type: "refresh_token",
        refresh_token: tokenRow.refresh_token,
      }),
    });

    const data = await res.json();
    if (data.access_token) {
      const newExpiresAt = new Date(now + (Number(data.expires_in) || 90000) * 1000).toISOString();
      await supabase.from("zalo_oa_tokens").upsert({
        id: 1,
        access_token: data.access_token,
        refresh_token: data.refresh_token || tokenRow.refresh_token,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      });
      return data.access_token;
    }
  } catch (err) {
    console.error("[Zalo Profile] Failed to refresh OA token:", err);
  }

  return tokenRow.access_token;
}

/**
 * Tự động lấy tên hiển thị và avatar thật của người dùng từ Zalo OA API
 */
export async function fetchAndSyncZaloUserProfile(zaloUserId: string, partnerId?: string): Promise<string | null> {
  if (!zaloUserId || zaloUserId === "unknown_user" || zaloUserId.startsWith("test_") || zaloUserId.startsWith("zalo_user_")) {
    return null;
  }

  try {
    const accessToken = await getValidZaloOAToken();
    if (!accessToken) return null;

    const res = await fetch(
      "https://openapi.zalo.me/v3.0/oa/user/detail?data=" +
        encodeURIComponent(JSON.stringify({ user_id: zaloUserId })),
      {
        headers: { access_token: accessToken },
      }
    );

    const data = await res.json();
    const displayName = data?.data?.display_name || data?.data?.user_alias || null;

    if (displayName) {
      const supabase = createAdminClient();
      if (partnerId) {
        await supabase
          .from("partners")
          .update({
            display_name: displayName,
            updated_at: new Date().toISOString(),
          })
          .eq("id", partnerId);
      } else {
        await supabase
          .from("partners")
          .update({
            display_name: displayName,
            updated_at: new Date().toISOString(),
          })
          .eq("zalo_user_id", zaloUserId);
      }
      return displayName;
    }
  } catch (err) {
    console.error(`[Zalo Profile] Error fetching profile for user ${zaloUserId}:`, err);
  }

  return null;
}
