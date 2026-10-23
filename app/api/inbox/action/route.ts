import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, listingId, propertyData, attachments } = body;

    if (!listingId || !action) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    if (action === "approve") {
      // Đảm bảo không bao giờ bị thất lạc ảnh từ tin nhắn Zalo gốc
      let attachmentsToPersist = Array.isArray(propertyData?.attachments) ? propertyData.attachments : [];
      if (attachmentsToPersist.length === 0) {
        const { data: currentListing } = await supabase
          .from("property_listings")
          .select("attachments")
          .eq("id", listingId)
          .single();
        if (currentListing && Array.isArray(currentListing.attachments)) {
          attachmentsToPersist = currentListing.attachments;
        }
      }

      const { data, error } = await supabase.rpc("approve_listing", {
        p_listing_id: listingId,
        p_property_data: {
          ...(propertyData || {}),
          attachments: attachmentsToPersist,
        },
      });

      if (error) {
        console.error("Error approving listing:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      revalidatePath("/inbox");
      revalidatePath("/properties");
      return NextResponse.json({ success: true, result: data });
    }

    if (action === "reject") {
      const { error } = await supabase
        .from("property_listings")
        .update({
          review_status: "rejected",
          reviewed_by: null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", listingId);

      if (error) {
        console.error("Error rejecting listing:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      revalidatePath("/inbox");
      return NextResponse.json({ success: true });
    }

    if (action === "update_attachments") {
      const newAttachments = Array.isArray(attachments) ? attachments : [];
      const { error } = await supabase
        .from("property_listings")
        .update({
          attachments: newAttachments,
          updated_at: new Date().toISOString(),
        })
        .eq("id", listingId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("Inbox action handler error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
