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

  return <InboxView initialListings={pendingListings || []} />;
}
