import "server-only";
import { getValidZaloOAToken } from "./profile";

export interface ZaloConversationMessage {
  msg_id: string;
  src: number; // 1: user to OA, 0: OA to user
  time: number; // Millisecond timestamp sent by user
  sent_time: string; // e.g. "16:06:19 24/10/2026"
  type: string; // "text" | "photo" | "file" | "sticker" | "other"
  text?: string;
  url?: string;
  thumb?: string;
  description?: string;
  from_id?: string;
  from_display_name?: string;
}

/**
 * Lấy lịch sử hội thoại chuẩn thời gian giữa người dùng và Zalo OA
 * Sử dụng endpoint v2.0/oa/conversation chính thức từ Zalo Developers
 * Tự động phân trang (tối đa 10 tin/request) để thu thập đủ đợt gửi.
 */
export async function fetchZaloConversation(
  zaloUserId: string,
  maxMessages: number = 30
): Promise<ZaloConversationMessage[]> {
  if (!zaloUserId || zaloUserId === "unknown_user") {
    return [];
  }

  const token = await getValidZaloOAToken();
  if (!token) {
    console.warn("[Zalo Conversation] Không lấy được Access Token hợp lệ.");
    return [];
  }

  const allMessages: ZaloConversationMessage[] = [];
  const pageSize = 10; // Zalo API quy định count tối đa là 10 tin/lần

  try {
    for (let offset = 0; offset < maxMessages; offset += pageSize) {
      const url = `https://openapi.zalo.me/v2.0/oa/conversation?data=${encodeURIComponent(
        JSON.stringify({
          user_id: zaloUserId,
          offset: offset,
          count: pageSize,
        })
      )}`;

      const res = await fetch(url, {
        headers: {
          access_token: token,
        },
        cache: "no-store",
      });

      if (!res.ok) {
        console.warn(`[Zalo Conversation] HTTP ${res.status} when fetching conversation for user ${zaloUserId}`);
        break;
      }

      const json = await res.json();
      if (json.error !== 0 || !Array.isArray(json.data) || json.data.length === 0) {
        if (json.error !== 0 && json.error !== -210) {
          console.warn(`[Zalo Conversation] API returned error:`, json);
        }
        break;
      }

      for (const item of json.data) {
        allMessages.push({
          msg_id: item.message_id || `msg_${item.time}`,
          src: item.src,
          time: Number(item.time) || Date.now(),
          sent_time: item.sent_time || "",
          type: item.type || "text",
          text: item.message || "",
          url: item.url || item.thumb || "",
          thumb: item.thumb || "",
          description: item.description || "",
          from_id: item.from_id,
          from_display_name: item.from_display_name,
        });
      }

      // Nếu số tin trả về ít hơn 10 tức là đã hết tin nhắn trong hội thoại
      if (json.data.length < pageSize) {
        break;
      }
    }
  } catch (err: any) {
    console.error("[Zalo Conversation] Lỗi truy vấn API hội thoại Zalo:", err?.message || err);
  }

  // Sắp xếp lại theo thứ tự thời gian tăng dần (từ cũ đến mới nhất) để AI dễ đọc theo mạch hội thoại
  return allMessages.sort((a, b) => a.time - b.time);
}
