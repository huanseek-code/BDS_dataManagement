import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data: properties } = await supabase
    .from("properties")
    .select(`
      id,
      code,
      address_text,
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
      )
    `)
    .order("created_at", { ascending: false });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Huanseek Admin";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Danh sách BĐS", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // 15 Columns matching screenshot
  worksheet.columns = [
    { header: "房源代号\nMã BĐS", key: "code", width: 14 },
    { header: "地址/位置\nĐịa chỉ/vị trí", key: "address", width: 34 },
    { header: "类型/用途 (可选)\nLoại hình/mục đích sử dụng", key: "types", width: 22 },
    { header: "单层面积 ( ㎡ )\nDiện tích một tầng (m²)", key: "floor_area", width: 18 },
    { header: "出租总面积 ( ㎡ )\nTổng diện tích cho thuê (m²)", key: "total_area", width: 20 },
    { header: "报价 ( 含币种/期限 )\nGiá chào (tiền tệ/kỳ)", key: "price", width: 22 },
    { header: "关键细节\nChi tiết chính", key: "key_details", width: 38 },
    { header: "外部供应合作伙伴\nĐối tác cung cấp bên ngoài", key: "partner", width: 24 },
    { header: "合作伙伴首次提供时间\nThời điểm đối tác cung cấp lần đầu", key: "partner_first_seen", width: 24 },
    { header: "Zalo 发信人及时间\nNgười gửi và giờ tin Zalo", key: "zalo_sender_time", width: 22 },
    { header: "入库时间 ( 系统 )\nThời điểm nhập hệ thống", key: "entry_time", width: 20 },
    { header: "房东给的佣金\nHoa hồng do chủ nhà trả", key: "landlord_commission", width: 22 },
    { header: "我方分成\nPhần hoa hồng bên mình", key: "our_share", width: 18 },
    { header: "照片/附件链接\nLink ảnh/tệp đính kèm", key: "attachments", width: 28 },
    { header: "原始信息及消息引用\nNội dung gốc và ID/link tin nhắn", key: "raw_message", width: 35 },
  ];

  // Style Header Row (Navy Blue #0e2747)
  const headerRow = worksheet.getRow(1);
  headerRow.height = 42;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0E2747" },
    };
    cell.font = {
      name: "Arial",
      color: { argb: "FFFFFFFF" },
      bold: true,
      size: 9.5,
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF203A5A" } },
      left: { style: "thin", color: { argb: "FF203A5A" } },
      bottom: { style: "medium", color: { argb: "FF203A5A" } },
      right: { style: "thin", color: { argb: "FF203A5A" } },
    };
  });

  // Populate rows
  const rows = properties || [];
  rows.forEach((p: any) => {
    const keyDetails =
      typeof p.key_details === "object"
        ? p.key_details?.vi || JSON.stringify(p.key_details)
        : p.key_details || "";

    const attachmentUrls = Array.isArray(p.attachments)
      ? p.attachments.map((a: any) => a.url || a.path).join("\n")
      : "";

    worksheet.addRow({
      code: p.code,
      address: p.address_text,
      types: Array.isArray(p.property_types) ? p.property_types.join(", ") : "",
      floor_area: p.floor_area_m2 || "",
      total_area: p.total_lease_area_m2 || "",
      price: p.price_text || (p.price_amount ? `${p.price_amount.toLocaleString()} VND` : ""),
      key_details: keyDetails,
      partner: p.primary_partner?.display_name || "",
      partner_first_seen: p.primary_partner?.first_seen_at
        ? new Date(p.primary_partner.first_seen_at).toLocaleDateString("vi-VN")
        : "",
      zalo_sender_time: p.primary_partner?.display_name || "",
      entry_time: p.created_at ? new Date(p.created_at).toLocaleString("vi-VN") : "",
      landlord_commission: p.landlord_commission_text || "",
      our_share: p.our_share_percent ? `${p.our_share_percent}%` : p.our_share_text || "",
      attachments: attachmentUrls,
      raw_message: p.code,
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=huanseek_properties_${new Date().toISOString().slice(0, 10)}.xlsx`,
    },
  });
}
