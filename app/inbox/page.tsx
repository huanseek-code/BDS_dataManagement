import { createAdminClient } from "@/lib/supabase/admin";
import { InboxView } from "@/components/InboxView";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const t = await getTranslations("inbox");
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
          {t("pageTitle")}
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {t("pageSubtitle")}
        </p>
      </div>

      <InboxView initialListings={pendingListings || []} />
    </div>
  );
}


