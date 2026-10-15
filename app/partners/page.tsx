import { createClient } from "@/lib/supabase/server";
import { Users, Phone, Calendar, Clock, MessageSquare } from "lucide-react";

export const revalidate = 0;

export default async function PartnersPage() {
  const supabase = await createClient();

  const { data: partners } = await supabase
    .from("partners")
    .select("*")
    .order("total_submissions", { ascending: false });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Danh sách Đối tác Cung cấp (External Partners)
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Quản lý thông tin các bên môi giới và chủ nguồn gửi tin qua Zalo OA
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="table-header-navy">
              <tr>
                <th className="p-3">Tên đối tác</th>
                <th className="p-3">Số điện thoại</th>
                <th className="p-3">Zalo User ID</th>
                <th className="p-3 text-center">Tổng nguồn gửi</th>
                <th className="p-3">Lần đầu gửi tin</th>
                <th className="p-3">Gần nhất gửi tin</th>
                <th className="p-3">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(!partners || partners.length === 0) ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    Chưa có đối tác nào gửi tin
                  </td>
                </tr>
              ) : (
                partners.map((partner: any) => (
                  <tr key={partner.id} className="hover:bg-slate-50">
                    <td className="p-3 font-semibold text-slate-900">
                      {partner.display_name || "Chưa đặt tên"}
                    </td>
                    <td className="p-3 text-slate-600">
                      {partner.phone || "—"}
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-500">
                      {partner.zalo_user_id}
                    </td>
                    <td className="p-3 text-center font-bold text-sky-700">
                      {partner.total_submissions}
                    </td>
                    <td className="p-3 text-slate-500">
                      {new Date(partner.first_seen_at).toLocaleDateString("vi-VN")}
                    </td>
                    <td className="p-3 text-slate-500">
                      {new Date(partner.last_seen_at).toLocaleString("vi-VN")}
                    </td>
                    <td className="p-3 text-slate-500">
                      {partner.note || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
