import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data: partners } = await supabase
    .from("partners")
    .select(`
      *,
      properties:properties(count)
    `)
    .order("created_at", { ascending: true });

  const formattedPartners = (partners || []).map((p: any) => ({
    ...p,
    total_submissions: p.properties?.[0]?.count ?? p.total_submissions ?? 0,
  }));

  formattedPartners.sort(
    (a: any, b: any) => (b.total_submissions || 0) - (a.total_submissions || 0)
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Huanseek Admin";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Danh sách Đối tác", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  worksheet.columns = [
    { header: "合作伙伴名称\nTên đối tác", key: "name", width: 28 },
    { header: "联系电话\nSố điện thoại", key: "phone", width: 18 },
    { header: "Zalo 用户ID\nZalo User ID", key: "zalo_id", width: 26 },
    { header: "已审核入库房源数\nTổng căn đã duyệt", key: "total_submissions", width: 22 },
    { header: "首次提供时间\nLần đầu gửi tin", key: "first_seen", width: 20 },
    { header: "最近提供时间\nGần nhất gửi tin", key: "last_seen", width: 22 },
    { header: "备注\nGhi chú", key: "notes", width: 35 },
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
      top: { style: "thin", color: { argb: "FF1E3A8A" } },
      bottom: { style: "medium", color: { argb: "FF1E3A8A" } },
      left: { style: "thin", color: { argb: "FF1E3A8A" } },
      right: { style: "thin", color: { argb: "FF1E3A8A" } },
    };
  });

  // Populate data
  (formattedPartners || []).forEach((partner, index) => {
    const row = worksheet.addRow({
      name: partner.display_name || "Chưa đặt tên",
      phone: partner.phone || "—",
      zalo_id: partner.zalo_user_id || "—",
      total_submissions: partner.total_submissions || 0,
      first_seen: partner.first_seen_at
        ? new Date(partner.first_seen_at).toLocaleDateString("vi-VN")
        : "—",
      last_seen: partner.last_seen_at
        ? new Date(partner.last_seen_at).toLocaleString("vi-VN")
        : "—",
      notes: partner.note || "—",
    });

    row.height = 28;
    const isEven = index % 2 === 0;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: "Arial", size: 9 };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      if (!isEven) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      }
      if (colNumber === 4) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.font = { name: "Arial", size: 9.5, bold: true, color: { argb: "FF0369A1" } };
      } else {
        cell.alignment = { vertical: "middle", horizontal: "left" };
      }
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `Doi_tac_cung_cap_Huanseek_${dateStr}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
