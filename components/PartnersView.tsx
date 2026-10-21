"use client";

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";

export interface PartnerRow {
  id: string;
  display_name?: string | null;
  phone?: string | null;
  zalo_user_id?: string | null;
  total_submissions?: number | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  note?: string | null;
}

export function PartnersView({ initialPartners }: { initialPartners: PartnerRow[] }) {
  const t = useTranslations("partners");

  return (
    <div className="space-y-4">
      {/* Page Title */}
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
              {!initialPartners || initialPartners.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    {t("empty")}
                  </td>
                </tr>
              ) : (
                initialPartners.map((partner) => (
                  <tr key={partner.id} className="hover:bg-slate-50 transition-colors">
                    {/* Dữ liệu đối tác 100% giữ nguyên gốc */}
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
                      {partner.total_submissions || 0}
                    </td>
                    <td className="p-3 text-slate-500">
                      {partner.first_seen_at
                        ? new Date(partner.first_seen_at).toLocaleDateString("vi-VN")
                        : "—"}
                    </td>
                    <td className="p-3 text-slate-500">
                      {partner.last_seen_at
                        ? new Date(partner.last_seen_at).toLocaleString("vi-VN")
                        : "—"}
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
