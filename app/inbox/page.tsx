import { createAdminClient } from "@/lib/supabase/admin";
import { InboxView } from "@/components/InboxView";
import { processBatchSubmission } from "@/lib/zalo/batch-processor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InboxPage() {
  const supabase = createAdminClient();

  // Tự động quét và xử lý bất kỳ submission nào đã qua thời gian gom tin (25s) mà chưa xử lý
  try {
    const nowIso = new Date().toISOString();
    const { data: expiredSubs } = await supabase
      .from("submissions")
      .select("id")
      .eq("status", "queued")
      .neq("ai_status", "processing")
      .neq("ai_status", "done")
      .lte("close_at", nowIso)
      .limit(5);

    if (expiredSubs && expiredSubs.length > 0) {
      for (const sub of expiredSubs) {
        await processBatchSubmission(sub.id);
      }
    }
  } catch (sweepErr) {
    console.error("[Inbox Auto-Sweep Error]:", sweepErr);
  }

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

  // Fetch approved properties for duplicate detection
  const { data: existingProperties } = await supabase
    .from("properties")
    .select("id, code, address_text, total_lease_area_m2, price_amount, created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  return (
    <InboxView
      initialListings={pendingListings || []}
      existingProperties={existingProperties || []}
    />
  );
}
