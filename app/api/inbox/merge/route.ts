import { NextRequest, NextResponse } from "next/server";
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

    // 4. Cập nhật targetListing với dữ liệu hoàn chỉnh
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
        needs_reply: aiResult.needs_reply,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetListingId)
      .select()
      .single();

    if (updateErr) {
      throw updateErr;
    }

    // 5. Đánh dấu sourceListing là đã gộp (đổi status = 'rejected' hoặc xóa)
    await supabaseAdmin
      .from("property_listings")
      .update({
        review_status: "rejected",
        reject_reason: `Đã gộp vào nguồn BĐS ${targetListingId}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sourceListingId);

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
