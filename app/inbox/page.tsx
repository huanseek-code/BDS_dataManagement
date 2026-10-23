import { createAdminClient } from "@/lib/supabase/admin";
import { InboxView } from "@/components/InboxView";

export const revalidate = 5;

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
        phone,
        note
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

  // Self-healing: Tự động đối soát và gắn ảnh nếu hồ sơ đang chờ duyệt bị thiếu ảnh
  if (pendingListings && pendingListings.length > 0) {
    for (const listing of pendingListings) {
      const currentAtts = Array.isArray(listing.attachments) ? listing.attachments : [];
      if (currentAtts.length === 0 && listing.submission_id) {
        const { data: chats } = await supabase
          .from("zalo_incoming_chats")
          .select("zalo_image_urls")
          .eq("submission_id", listing.submission_id);

        const found: string[] = [];
        for (const c of chats || []) {
          if (Array.isArray(c.zalo_image_urls)) found.push(...c.zalo_image_urls);
        }
        const uniqueFound = [...new Set(found.filter(Boolean))];
        if (uniqueFound.length > 0) {
          listing.attachments = uniqueFound;
          // Cập nhật ngầm lại vào database để bền vững
          supabase
            .from("property_listings")
            .update({ attachments: uniqueFound })
            .eq("id", listing.id)
            .then(() => {});
        }
      }
    }
  }

  return <InboxView initialListings={pendingListings || []} />;
}
