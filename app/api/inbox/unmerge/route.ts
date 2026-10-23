import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { targetListingId } = await req.json();

    if (!targetListingId) {
      return NextResponse.json(
        { error: "Vui lòng cung cấp targetListingId để hoàn tác." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient();

    // 1. Lấy target listing
    const { data: targetListing, error: e1 } = await supabaseAdmin
      .from("property_listings")
      .select("*")
      .eq("id", targetListingId)
      .single();

    if (e1 || !targetListing) {
      return NextResponse.json(
        { error: "Không tìm thấy thông tin BĐS cần hoàn tác." },
        { status: 404 }
      );
    }

    const history = Array.isArray(targetListing.change_history)
      ? targetListing.change_history
      : [];

    // Tìm snapshot merge gần nhất
    const mergeIndex = history.map((h: any) => h.event).lastIndexOf("MERGE_SNAPSHOT");
    if (mergeIndex === -1) {
      return NextResponse.json(
        { error: "BĐS này chưa từng thực hiện gộp hoặc không tìm thấy bản lưu hoàn tác." },
        { status: 400 }
      );
    }

    const mergeSnapshot = history[mergeIndex] as any;
    const targetSnapshot = mergeSnapshot.target_snapshot;
    const sourceSnapshot = mergeSnapshot.source_snapshot;

    if (!targetSnapshot || !sourceSnapshot) {
      return NextResponse.json(
        { error: "Dữ liệu bản sao lưu bị thiếu, không thể hoàn tác." },
        { status: 500 }
      );
    }

    // 2. Khôi phục target listing về snapshot ban đầu
    const updatedHistory = history.filter((_, idx) => idx !== mergeIndex);

    const { error: targetRestoreErr } = await supabaseAdmin
      .from("property_listings")
      .update({
        address_text: targetSnapshot.address_text,
        property_types: targetSnapshot.property_types,
        floor_area_m2: targetSnapshot.floor_area_m2,
        total_lease_area_m2: targetSnapshot.total_lease_area_m2,
        price_amount: targetSnapshot.price_amount,
        price_currency: targetSnapshot.price_currency,
        price_period: targetSnapshot.price_period,
        price_basis: targetSnapshot.price_basis,
        price_text: targetSnapshot.price_text,
        key_details: targetSnapshot.key_details,
        landlord_commission_text: targetSnapshot.landlord_commission_text,
        our_share_percent: targetSnapshot.our_share_percent,
        our_share_text: targetSnapshot.our_share_text,
        attachments: targetSnapshot.attachments,
        ai_extracted: targetSnapshot.ai_extracted,
        change_history: updatedHistory,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetListingId);

    if (targetRestoreErr) {
      throw targetRestoreErr;
    }

    // 3. Khôi phục source listing về trạng thái pending ban đầu
    const { error: sourceRestoreErr } = await supabaseAdmin
      .from("property_listings")
      .update({
        address_text: sourceSnapshot.address_text,
        property_types: sourceSnapshot.property_types,
        floor_area_m2: sourceSnapshot.floor_area_m2,
        total_lease_area_m2: sourceSnapshot.total_lease_area_m2,
        price_amount: sourceSnapshot.price_amount,
        price_currency: sourceSnapshot.price_currency,
        price_period: sourceSnapshot.price_period,
        price_basis: sourceSnapshot.price_basis,
        price_text: sourceSnapshot.price_text,
        key_details: sourceSnapshot.key_details,
        landlord_commission_text: sourceSnapshot.landlord_commission_text,
        our_share_percent: sourceSnapshot.our_share_percent,
        our_share_text: sourceSnapshot.our_share_text,
        attachments: sourceSnapshot.attachments,
        ai_extracted: sourceSnapshot.ai_extracted,
        review_status: "pending",
        reject_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sourceSnapshot.id);

    if (sourceRestoreErr) {
      throw sourceRestoreErr;
    }

    revalidatePath("/inbox");

    return NextResponse.json({
      success: true,
      message: "Đã hoàn tác gộp thành công! Cả 2 hồ sơ đã được khôi phục nguyên vẹn.",
    });
  } catch (err: any) {
    console.error("Unmerge error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
