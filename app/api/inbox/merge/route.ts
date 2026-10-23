import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractPropertiesFromChat } from "@/lib/ai/extract";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { targetListingId, sourceListingId } = await req.json();

    if (!targetListingId || !sourceListingId || targetListingId === sourceListingId) {
      return NextResponse.json(
        { error: "Vui lòng chọn 2 nguồn BĐS hợp lệ để gộp." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient();

    // 1. Lấy dữ liệu cả 2 listing
    const { data: targetListing, error: e1 } = await supabaseAdmin
      .from("property_listings")
      .select("*")
      .eq("id", targetListingId)
      .single();

    const { data: sourceListing, error: e2 } = await supabaseAdmin
      .from("property_listings")
      .select("*")
      .eq("id", sourceListingId)
      .single();

    if (e1 || e2 || !targetListing || !sourceListing) {
      return NextResponse.json(
        { error: "Không tìm thấy thông tin một trong 2 nguồn BĐS." },
        { status: 404 }
      );
    }

    // 2. Gom toàn bộ văn bản và ảnh
    const targetText =
      (targetListing.key_details as any)?.vi ||
      targetListing.address_text ||
      "";
    const sourceText =
      (sourceListing.key_details as any)?.vi ||
      sourceListing.address_text ||
      "";

    const combinedText = `
--- NỘI DUNG 1 ---
${targetText}

--- NỘI DUNG 2 (BỔ SUNG) ---
${sourceText}
`.trim();

    const targetAtt = (Array.isArray(targetListing.attachments) ? targetListing.attachments : []) as string[];
    const sourceAtt = (Array.isArray(sourceListing.attachments) ? sourceListing.attachments : []) as string[];
    const mergedAttachments: string[] = Array.from(new Set([...targetAtt, ...sourceAtt])).filter((u): u is string => typeof u === "string");

    // 3. Gọi Gemini AI hợp nhất toàn bộ thông tin
    const aiResult = await extractPropertiesFromChat(combinedText, mergedAttachments, null);

    if (aiResult.properties.length === 0) {
      return NextResponse.json(
        { error: "AI không thể hợp nhất dữ liệu từ 2 nguồn này." },
        { status: 422 }
      );
    }

    const mergedProp = aiResult.properties[0];

    // 4. Lưu bản sao lưu snapshot trước khi gộp để hỗ trợ Hoàn tác (Undo)
    const currentHistory = Array.isArray(targetListing.change_history) ? targetListing.change_history : [];
    const mergeSnapshot = {
      event: "MERGE_SNAPSHOT",
      timestamp: new Date().toISOString(),
      source_listing_id: sourceListingId,
      target_snapshot: {
        address_text: targetListing.address_text,
        house_number: targetListing.house_number,
        street_name: targetListing.street_name,
        ward: targetListing.ward,
        district_legacy: targetListing.district_legacy,
        province: targetListing.province,
        property_types: targetListing.property_types,
        floor_area_m2: targetListing.floor_area_m2,
        total_lease_area_m2: targetListing.total_lease_area_m2,
        price_amount: targetListing.price_amount,
        price_currency: targetListing.price_currency,
        price_period: targetListing.price_period,
        price_basis: targetListing.price_basis,
        price_text: targetListing.price_text,
        key_details: targetListing.key_details,
        landlord_commission_text: targetListing.landlord_commission_text,
        our_share_percent: targetListing.our_share_percent,
        our_share_text: targetListing.our_share_text,
        attachments: targetListing.attachments,
        ai_extracted: targetListing.ai_extracted,
      },
      source_snapshot: {
        id: sourceListing.id,
        address_text: sourceListing.address_text,
        house_number: sourceListing.house_number,
        street_name: sourceListing.street_name,
        ward: sourceListing.ward,
        district_legacy: sourceListing.district_legacy,
        province: sourceListing.province,
        property_types: sourceListing.property_types,
        floor_area_m2: sourceListing.floor_area_m2,
        total_lease_area_m2: sourceListing.total_lease_area_m2,
        price_amount: sourceListing.price_amount,
        price_currency: sourceListing.price_currency,
        price_period: sourceListing.price_period,
        price_basis: sourceListing.price_basis,
        price_text: sourceListing.price_text,
        key_details: sourceListing.key_details,
        landlord_commission_text: sourceListing.landlord_commission_text,
        our_share_percent: sourceListing.our_share_percent,
        our_share_text: sourceListing.our_share_text,
        attachments: sourceListing.attachments,
        ai_extracted: sourceListing.ai_extracted,
        review_status: sourceListing.review_status,
      },
    };

    // 5. Cập nhật targetListing với dữ liệu hoàn chỉnh kèm snapshot
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("property_listings")
      .update({
        address_text: mergedProp.address_text || targetListing.address_text,
        house_number: mergedProp.house_number || targetListing.house_number,
        street_name: mergedProp.street_name || targetListing.street_name,
        ward: mergedProp.ward || targetListing.ward,
        district_legacy: mergedProp.district_legacy || targetListing.district_legacy,
        province: mergedProp.province || targetListing.province,
        property_types: (mergedProp.property_types && mergedProp.property_types.length > 0)
          ? mergedProp.property_types
          : targetListing.property_types,
        floor_area_m2: mergedProp.floor_area_m2 || targetListing.floor_area_m2,
        total_lease_area_m2: mergedProp.total_lease_area_m2 || targetListing.total_lease_area_m2,
        price_amount: mergedProp.price_amount || targetListing.price_amount,
        price_currency: mergedProp.price_currency || targetListing.price_currency,
        price_period: mergedProp.price_period || targetListing.price_period,
        price_basis: mergedProp.price_basis || targetListing.price_basis,
        price_text: mergedProp.price_text || targetListing.price_text,
        key_details: mergedProp.key_details,
        landlord_commission_text: mergedProp.landlord_commission_text || targetListing.landlord_commission_text,
        our_share_percent: mergedProp.our_share_percent || targetListing.our_share_percent,
        our_share_text: mergedProp.our_share_text || targetListing.our_share_text,
        attachments: mergedAttachments,
        ai_extracted: mergedProp as any,
        change_history: [...currentHistory, mergeSnapshot],
        needs_reply: aiResult.needs_reply,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetListingId)
      .select()
      .single();

    if (updateErr) {
      throw updateErr;
    }

    // 6. Đánh dấu sourceListing là đã gộp (status = 'merged')
    await supabaseAdmin
      .from("property_listings")
      .update({
        review_status: "merged",
        reject_reason: `Đã gộp vào nguồn BĐS ${targetListingId}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sourceListingId);

    revalidatePath("/inbox");
    return NextResponse.json({
      success: true,
      message: "Đã gộp 2 nguồn BĐS thành 1 thành công!",
      updatedListing: updated,
    });
  } catch (err: any) {
    console.error("Merge listings error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
