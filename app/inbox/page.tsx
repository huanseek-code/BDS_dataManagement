import { createAdminClient } from "@/lib/supabase/admin";
import { InboxView } from "@/components/InboxView";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const supabase = createAdminClient();

  // Fetch all pending property listings waiting for review
  const { data: pendingListings } = await supabase
    .from("property_listings")
    .select(`
      *,
      partner:partners(
        display_name,
        zalo_user_id,
        phone
      ),
      submission:submissions(
        id,
        raw_text,
        msg_count,
        attachment_count,
        created_at,
        close_reason
      )
    `)
    .eq("review_status", "pending")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Hộp thư Nguồn Chờ Duyệt (Inbox Diff & Review)
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Đối chiếu tin nhắn gốc từ Zalo OA với các trường thông tin chuẩn hóa trước khi đưa vào kho
        </p>
      </div>

      <InboxView initialListings={pendingListings || []} />
    </div>
  );
}

