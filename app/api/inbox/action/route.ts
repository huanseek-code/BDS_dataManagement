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

      // Tự động học từ các ca nhân viên sửa (Continuous Learning Feedback Loop)
      try {
        const { data: curListing } = await supabase
          .from("property_listings")
          .select("ai_extracted, location_note, address_text")
          .eq("id", listingId)
          .single();

        const rawSnippet = curListing?.location_note || propertyData?.address_text;
        const aiOriginal = (curListing?.ai_extracted || {}) as any;

        const isModified =
          String(propertyData?.floor_area_m2 || "").trim() !== String(aiOriginal?.floor_area_m2 || "").trim() ||
          Number(propertyData?.price_amount || 0) !== Number(aiOriginal?.price_amount || 0) ||
          Number(propertyData?.total_lease_area_m2 || 0) !== Number(aiOriginal?.total_lease_area_m2 || 0) ||
          String(propertyData?.furniture_status || "").trim() !== String(aiOriginal?.furniture_status || "").trim();

        if (isModified && rawSnippet && rawSnippet.length >= 20) {
          await (supabase as any).from("ai_golden_samples").insert({
            pattern_type: "human_reviewer_correction",
            raw_message: rawSnippet,
            expected_extraction: {
              address_text: propertyData.address_text,
              floor_area_m2: propertyData.floor_area_m2 || null,
              total_lease_area_m2: propertyData.total_lease_area_m2 || null,
              price_amount: propertyData.price_amount || null,
              price_text: propertyData.price_text || null,
              price_period: propertyData.price_period || null,
              price_basis: propertyData.price_basis || "total",
              property_types: propertyData.property_types || ["Nhà phố"],
              furniture_status: propertyData.furniture_status || null,
              furniture_list: propertyData.furniture_list || null,
              key_details: propertyData.key_details || { vi: propertyData.address_text, en: "", zh: "" },
            },
            description: `Học tự động từ chỉnh sửa thực tế của nhân viên duyệt cho căn [${propertyData.address_text}]`,
          });
          console.log(`[Continuous Learning] Đã tự động lưu 1 mẫu sửa của nhân viên cho căn ${propertyData.address_text}`);
        }
      } catch (learnErr) {
        console.warn("[Continuous Learning Error]:", learnErr);
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
