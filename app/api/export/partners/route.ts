import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data: partners } = await supabase
    .from("partners")
    .select("*")
    .order("total_submissions", { ascending: false });

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
    { header: "提供房源总数\nTổng nguồn gửi", key: "total_submissions", width: 18 },
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
      top: { style: "thin", color: { argb: "FF203A5A" } },
      left: { style: "thin", color: { argb: "FF203A5A" } },
      bottom: { style: "medium", color: { argb: "FF203A5A" } },
      right: { style: "thin", color: { argb: "FF203A5A" } },
    };
  });

  const rows = partners || [];
  rows.forEach((p: any) => {
    worksheet.addRow({
      name: p.display_name || "Chưa đặt tên",
      phone: p.phone || "—",
      zalo_id: p.zalo_user_id || "",
      total_submissions: p.total_submissions || 0,
      first_seen: p.first_seen_at ? new Date(p.first_seen_at).toLocaleDateString("vi-VN") : "—",
      last_seen: p.last_seen_at ? new Date(p.last_seen_at).toLocaleString("vi-VN") : "—",
      notes: p.note || "",
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=huanseek_partners_${new Date().toISOString().slice(0, 10)}.xlsx`,
    },
  });
}
