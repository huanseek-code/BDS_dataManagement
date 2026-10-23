import { createAdminClient } from "@/lib/supabase/admin";
import { PropertyTable, PropertyRow } from "@/components/PropertyTable";

export const revalidate = 10;

export default async function PropertiesPage() {
  const supabase = createAdminClient();

  // Query properties from Supabase
  const { data: properties, error } = await supabase
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
      attachments,
      primary_partner:partners(
        display_name,
        phone,
        first_seen_at
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

  // Fallback demo data if DB is initially empty so user can immediately preview the 15 columns
  const demoData: PropertyRow[] = [
    {
      id: "demo-1",
      code: "BDS-000001",
      address_text: "Đường số 7, KCN VSIP 1, TP. Thuận An",
      ward: "An Phú",
      district_legacy: "Thuận An",
      province: "Bình Dương",
      property_types: ["factory", "warehouse"],
      floor_area_m2: 2500,
      total_lease_area_m2: 5000,
      price_amount: 112500000,
      price_currency: "VND",
      price_period: "month",
      price_basis: "total",
      price_text: "4.5 USD/m²/tháng",
      key_details: {
        vi: "Nhà xưởng đạt chuẩn PCCC tự động, trạm biến áp 560kVA, nền epoxy chịu tải 3 tấn/m².",
        en: "Factory with automatic fire protection system, 560kVA substation, epoxy floor 3 tons/m².",
        zh: "标准厂房，自动消防系统，560kVA变电站，环氧地坪承重3吨/㎡。",
      },
      primary_partner: {
        display_name: "Anh Tuấn (Môi giới BD)",
        phone: "0908 123 456",
        first_seen_at: "2026-10-10T08:30:00Z",
      },
      zalo_sender_name: "Anh Tuấn (Môi giới BD)",
      zalo_msg_time: "2026-10-10T08:30:00Z",
      zalo_sender_time: "Anh Tuấn • 10/10/2026 08:30",
      entry_time: "2026-10-10T08:35:12Z",
      landlord_commission_text: "1 tháng tiền thuê (hợp đồng 3 năm)",
      our_share_percent: 50,
      our_share_text: "Chia đôi 50/50",
      attachments: [
        { url: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800", name: "xuong_1.jpg" },
        { url: "https://images.unsplash.com/photo-1553413077-190dd305871c?w=800", name: "pccc.jpg" },
      ],
      raw_text: "Gửi bên anh xưởng 5000m2 ở VSIP 1 Thuận An, giá 4.5$/m2, PCCC tự động, trạm điện 560kVA. Hoa hồng 1 tháng chia đôi.",
      source_msg_ids: ["msg_zalo_101", "msg_zalo_102"],
    },
    {
      id: "demo-2",
      code: "BDS-000002",
      address_text: "142 Đường Nguyễn Thị Minh Khai, Phường Bến Thành",
      district_legacy: "Quận 1",
      province: "TP. Hồ Chí Minh",
      property_types: ["office"],
      floor_area_m2: 320,
      total_lease_area_m2: 1280,
      price_amount: 320000000,
      price_currency: "VND",
      price_period: "month",
      price_basis: "total",
      price_text: "320 triệu / tháng (TL)",
      key_details: {
        vi: "Tòa nhà văn phòng 1 hầm 4 lầu, mặt tiền 8m, có thang máy tốc độ cao, thang bộ thoát hiểm.",
        en: "Office building 1 basement 4 floors, 8m frontage, high-speed elevator, fire escape stairs.",
        zh: "独栋写字楼，1层地下室4层地上，门宽8米，配高速电梯及消防通道。",
      },
      primary_partner: {
        display_name: "Chị Lan (BĐS Trung Tâm)",
        phone: "0912 345 678",
        first_seen_at: "2026-10-11T14:20:00Z",
      },
      zalo_sender_name: "Chị Lan (BĐS Trung Tâm)",
      zalo_msg_time: "2026-10-11T14:20:00Z",
      zalo_sender_time: "Chị Lan • 11/10/2026 14:20",
      entry_time: "2026-10-11T14:25:05Z",
      landlord_commission_text: "1/2 tháng tiền nhà",
      our_share_percent: 60,
      our_share_text: "Bên mình nhận 60%",
      attachments: [
        { url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800", name: "office_facade.jpg" }
      ],
      raw_text: "Căn NTMK Quận 1, 1 hầm 4 lầu DT 1280m2, giá 320tr/tháng có TL, hoa hồng nửa tháng bên mình 60%",
      source_msg_ids: ["msg_zalo_201"],
    },
    {
      id: "demo-3",
      code: "BDS-000003",
      address_text: "Mặt tiền Quốc lộ 1A, Xã Bình Chánh",
      district_legacy: "Bình Chánh",
      province: "TP. Hồ Chí Minh",
      property_types: ["warehouse", "land"],
      floor_area_m2: 3000,
      total_lease_area_m2: 3000,
      price_amount: 180000000,
      price_currency: "VND",
      price_period: "month",
      price_basis: "total",
      price_text: "60.000 đ/m²/tháng",
      key_details: {
        vi: "Kho cao ráo 9m, xe container 40 feet ra vào 24/7 không cấm giờ, có văn phòng làm việc 100m².",
        en: "Warehouse ceiling 9m, 40ft container access 24/7 without time ban, includes 100m² office.",
        zh: "大型仓库层高9米，40尺集装箱全天无禁行，附带100㎡办公区。",
      },
      primary_partner: {
        display_name: "Hoàng Nam Logistics",
        phone: "0933 999 888",
        first_seen_at: "2026-10-12T09:15:00Z",
      },
      zalo_sender_name: "Hoàng Nam Logistics",
      zalo_msg_time: "2026-10-12T09:15:00Z",
      zalo_sender_time: "Hoàng Nam • 12/10/2026 09:15",
      entry_time: "2026-10-12T09:20:44Z",
      landlord_commission_text: "1 tháng tiền thuê",
      our_share_percent: 50,
      our_share_text: "Chia 50/50",
      attachments: [
        { url: "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=800", name: "kho_bai.jpg" }
      ],
      raw_text: "Kho QL1A Bình Chánh 3000m2 cao 9m container vào 24/24, giá 60k/m2. Hoa hồng 1 tháng.",
      source_msg_ids: ["msg_zalo_301"],
    },
  ];

  const displayRows: PropertyRow[] =
    properties && properties.length > 0
      ? properties.map((p: any) => {
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
            attachments: Array.isArray(p.attachments) ? p.attachments : [],
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
        })
      : demoData;

  return <PropertyTable initialData={displayRows} />;
}
