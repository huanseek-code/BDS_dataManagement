import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { propertyId, propertyData } = body;

    if (!propertyId || !propertyData) {
      return NextResponse.json(
        { error: "Thiếu propertyId hoặc dữ liệu cập nhật" },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient();

    // 1. Lấy dữ liệu cũ để lưu lịch sử chỉnh sửa
    const { data: currentProp, error: fetchErr } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("id", propertyId)
      .single();

    if (fetchErr || !currentProp) {
      return NextResponse.json(
        { error: "Không tìm thấy BĐS cần chỉnh sửa" },
        { status: 404 }
      );
    }

    // 2. Cập nhật các trường
    const updatePayload: any = {
      address_text: propertyData.address_text ?? currentProp.address_text,
      house_number: propertyData.house_number ?? currentProp.house_number,
      street_name: propertyData.street_name ?? currentProp.street_name,
      ward: propertyData.ward ?? currentProp.ward,
      district_legacy: propertyData.district_legacy ?? currentProp.district_legacy,
      province: propertyData.province ?? currentProp.province,
      property_types: Array.isArray(propertyData.property_types)
        ? propertyData.property_types
        : currentProp.property_types,
      floor_area_m2: propertyData.floor_area_m2 ? Number(propertyData.floor_area_m2) : null,
      total_lease_area_m2: propertyData.total_lease_area_m2 ? Number(propertyData.total_lease_area_m2) : null,
      price_amount: propertyData.price_amount ? Number(propertyData.price_amount) : null,
      price_currency: propertyData.price_currency || currentProp.price_currency || "VND",
      price_period: propertyData.price_period || currentProp.price_period || "month",
      price_basis: propertyData.price_basis || currentProp.price_basis || "total",
      price_text: propertyData.price_text ?? currentProp.price_text,
      landlord_commission_text: propertyData.landlord_commission_text ?? currentProp.landlord_commission_text,
      our_share_percent: propertyData.our_share_percent !== undefined
        ? (propertyData.our_share_percent ? Number(propertyData.our_share_percent) : null)
        : currentProp.our_share_percent,
      our_share_text: propertyData.our_share_text ?? currentProp.our_share_text,
      key_details: propertyData.key_details || currentProp.key_details,
      attachments: Array.isArray(propertyData.attachments) ? propertyData.attachments : currentProp.attachments,
      updated_at: new Date().toISOString(),
    };

    // Nếu có rental_options
    if (Array.isArray(propertyData.rental_options)) {
      updatePayload.rental_options = propertyData.rental_options;
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("properties")
      .update(updatePayload)
      .eq("id", propertyId)
      .select()
      .single();

    if (updateErr) {
      console.error("Update property error:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    revalidatePath("/properties");
    return NextResponse.json({
      success: true,
      message: "Đã cập nhật BĐS thành công!",
      property: updated,
    });
  } catch (err: any) {
    console.error("Property update handler error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
