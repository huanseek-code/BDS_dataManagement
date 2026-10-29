import { createAdminClient } from "@/lib/supabase/admin";
import { PropertyTable, PropertyRow } from "@/components/PropertyTable";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PropertiesPage() {
  const supabase = createAdminClient();

  // Query properties from Supabase
  const { data: properties } = await supabase
    .from("properties")
    .select(`
      id,
      code,
      address_text,
      house_number,
      street_name,
      ward,
      district_legacy,
      province,
      property_types,
      floor_area_m2,
      total_lease_area_m2,
      price_amount,
      price_currency,
      price_period,
      price_basis,
      price_text,
      key_details,
      created_at,
      landlord_commission_text,
      our_share_percent,
      our_share_text,
      primary_partner:partners(
        display_name,
        phone,
        first_seen_at,
        note
      ),
      property_listings(
        id,
        created_at,
        reviewed_at,
        location_note,
        change_history,
        submissions(
          first_msg_at,
          last_msg_at,
          raw_text
        ),
        partners(
          display_name,
          phone,
          zalo_user_id
        )
      )
    `)
    .order("created_at", { ascending: false });

  const displayRows: PropertyRow[] = (properties || []).map((p: any) => {
    const listing = p.property_listings?.[0];
    const senderName =
      listing?.partners?.display_name ||
      p.primary_partner?.display_name ||
      (listing?.partners?.phone ? `SĐT: ${listing.partners.phone}` : null) ||
      (listing?.partners?.zalo_user_id && listing.partners.zalo_user_id !== "unknown_user"
        ? `Zalo: ${listing.partners.zalo_user_id.slice(-6)}`
        : null);

    // Giờ tin nhắn Zalo: lấy từ submission first_msg_at hoặc listing created_at
    const zaloMsgTime =
      listing?.submissions?.first_msg_at ||
      listing?.submissions?.last_msg_at ||
      listing?.created_at ||
      null;

    // Thời điểm duyệt đơn: reviewed_at hoặc p.created_at
    const approvalTime = listing?.reviewed_at || p.created_at;

    return {
      id: p.id,
      code: p.code,
      address_text: p.address_text,
      house_number: p.house_number,
      street_name: p.street_name,
      ward: p.ward,
      district_legacy: p.district_legacy,
      province: p.province,
      property_types: p.property_types || [],
      floor_area_m2: p.floor_area_m2,
      total_lease_area_m2: p.total_lease_area_m2,
      price_amount: p.price_amount,
      price_currency: p.price_currency || "VND",
      price_period: p.price_period || "month",
      price_basis: p.price_basis || "total",
      price_text: p.price_text,
      key_details: p.key_details || {},
      primary_partner: p.primary_partner,
      zalo_sender_name: senderName,
      zalo_msg_time: zaloMsgTime,
      entry_time: approvalTime,
      landlord_commission_text: p.landlord_commission_text,
      our_share_percent: p.our_share_percent,
      our_share_text: p.our_share_text,
      rental_options: Array.isArray(p.rental_options)
        ? p.rental_options
        : Array.isArray(p.key_details?.rental_options)
        ? p.key_details.rental_options
        : [],
      raw_text:
        listing?.location_note ||
        listing?.submissions?.raw_text ||
        (Array.isArray(listing?.change_history) && listing.change_history[0]?.text) ||
        null,
    };
  });

  return <PropertyTable initialData={displayRows} />;
}
