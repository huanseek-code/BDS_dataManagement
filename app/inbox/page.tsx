import { createAdminClient } from "@/lib/supabase/admin";
import { InboxView } from "@/components/InboxView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InboxPage() {
  const supabase = createAdminClient();

  // Fetch all pending property listings waiting for review
  const { data: pendingListings, error: pendingError } = await supabase
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

  // Fetch approved properties for duplicate detection
  const { data: existingProperties, error: propertiesError } = await supabase
    .from("properties")
    .select("id, code, address_text, total_lease_area_m2, price_amount, created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  const queryErrorMessage = pendingError
    ? `Lỗi truy vấn danh sách chờ duyệt: ${pendingError.message}`
    : propertiesError
    ? `Lỗi truy vấn danh sách kho BĐS: ${propertiesError.message}`
    : null;

  return (
    <InboxView
      initialListings={pendingListings || []}
      existingProperties={existingProperties || []}
      initialError={queryErrorMessage}
    />
  );
}
