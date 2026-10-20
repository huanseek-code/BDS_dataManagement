import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { Users } from "lucide-react";

export const revalidate = 0;

export default async function PartnersPage() {
  const t = await getTranslations("partners");
  const supabase = await createClient();

  const { data: partners } = await supabase
    .from("partners")
    .select("*")
    .order("total_submissions", { ascending: false });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          {t("title")}
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {t("subtitle")}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="table-header-navy">
              <tr>
                <th className="p-3">{t("name")}</th>
                <th className="p-3">{t("phone")}</th>
                <th className="p-3">{t("zaloId")}</th>
                <th className="p-3 text-center">{t("totalSubmissions")}</th>
                <th className="p-3">{t("firstSeen")}</th>
                <th className="p-3">{t("lastSeen")}</th>
                <th className="p-3">{t("notes")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(!partners || partners.length === 0) ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    {t("empty")}
                  </td>
                </tr>
              ) : (
                partners.map((partner: any) => (
                  <tr key={partner.id} className="hover:bg-slate-50">
                    {/* Dữ liệu đối tác giữ nguyên gốc */}
                    <td className="p-3 font-semibold text-slate-900">
                      {partner.display_name || t("unnamed")}
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
                      {partner.first_seen_at ? new Date(partner.first_seen_at).toLocaleDateString("vi-VN") : "—"}
                    </td>
                    <td className="p-3 text-slate-500">
                      {partner.last_seen_at ? new Date(partner.last_seen_at).toLocaleString("vi-VN") : "—"}
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
