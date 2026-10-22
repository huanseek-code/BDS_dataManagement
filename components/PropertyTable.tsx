"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatPrice } from "@/lib/utils";
import {
  Search,
  SlidersHorizontal,
  FileSpreadsheet,
  ExternalLink,
  Image as ImageIcon,
  MessageSquare,
  Building,
} from "lucide-react";

export interface PropertyRow {
  id: string;
  code: string;
  address_text: string;
  house_number?: string | null;
  street_name?: string | null;
  ward?: string | null;
  district_legacy?: string | null;
  province?: string | null;
  property_types: string[];
  floor_area_m2?: number | null;
  total_lease_area_m2?: number | null;
  price_amount?: number | null;
  price_currency: string;
  price_period: string;
  price_basis: string;
  price_text?: string | null;
  key_details: { vi?: string; en?: string; zh?: string } | any;
  primary_partner?: {
    display_name?: string | null;
    phone?: string | null;
    first_seen_at?: string | null;
  } | null;
  zalo_sender_name?: string | null;
  zalo_msg_time?: string | null;
  zalo_sender_time?: string | null;
  entry_time: string;
  landlord_commission_text?: string | null;
  our_share_percent?: number | null;
  our_share_text?: string | null;
  attachments?: any[];
  raw_text?: string | null;
  source_msg_ids?: string[];
}

export function PropertyTable({ initialData }: { initialData: PropertyRow[] }) {
  const t = useTranslations();
  const locale = useLocale();

  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [showBilingual, setShowBilingual] = useState<boolean>(true);
  const [previewImages, setPreviewImages] = useState<string[] | null>(null);

  // Filter properties
  const filteredData = initialData.filter((item) => {
    const matchesSearch =
      !search ||
      item.code.toLowerCase().includes(search.toLowerCase()) ||
      item.address_text.toLowerCase().includes(search.toLowerCase()) ||
      (item.primary_partner?.display_name || "").toLowerCase().includes(search.toLowerCase());

    const matchesType =
      selectedType === "all" || item.property_types.includes(selectedType);

    return matchesSearch && matchesType;
  });

  const propertyTypesList = [
    { key: "all", label: t("common.all") },
    { key: "factory", label: t("types.factory") },
    { key: "warehouse", label: t("types.warehouse") },
    { key: "office", label: t("types.office") },
    { key: "retail", label: t("types.retail") },
    { key: "townhouse", label: t("types.townhouse") },
    { key: "villa", label: t("types.villa") },
    { key: "apartment", label: t("types.apartment") },
    { key: "land", label: t("types.land") },
    { key: "hotel", label: t("types.hotel") },
  ];

  const getColHeader = (key: string) => {
    if (showBilingual) {
      return t(`bilingualColumns.${key}`);
    }
    return t(`columns.${key}`);
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    try {
      return new Date(dateStr).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      {/* Page Title & Counter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            {t("properties.title")}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {t("properties.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <span>{t("properties.total")}:</span>
          <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-bold">
            {initialData.length} {t("properties.unit")}
          </span>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Search box */}
          <div className="relative min-w-[280px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t("common.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
            />
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
            >
              {propertyTypesList.map((pt) => (
                <option key={pt.key} value={pt.key}>
                  {pt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right side toggles */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showBilingual}
              onChange={(e) => setShowBilingual(e.target.checked)}
              className="rounded text-sky-600 focus:ring-sky-500"
            />
            <span>{t("common.showBilingualLabel")}</span>
          </label>

          <a
            href="/api/export/properties"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{t("common.exportExcel")}</span>
          </a>
        </div>
      </div>

      {/* Main 15-Column Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-md overflow-hidden">
        <div className="overflow-x-auto max-h-[750px]">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="table-header-navy sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="table-header-cell w-[100px]">{getColHeader("code")}</th>
                <th className="table-header-cell min-w-[200px]">{getColHeader("address")}</th>
                <th className="table-header-cell min-w-[130px]">{getColHeader("types")}</th>
                <th className="table-header-cell min-w-[110px]">{getColHeader("floorArea")}</th>
                <th className="table-header-cell min-w-[120px]">{getColHeader("totalLeaseArea")}</th>
                <th className="table-header-cell min-w-[140px]">{getColHeader("price")}</th>
                <th className="table-header-cell min-w-[220px]">{getColHeader("keyDetails")}</th>
                <th className="table-header-cell min-w-[150px]">{getColHeader("partner")}</th>
                <th className="table-header-cell min-w-[130px]">{getColHeader("partnerFirstSeen")}</th>
                <th className="table-header-cell min-w-[140px]">{getColHeader("zaloSenderTime")}</th>
                <th className="table-header-cell min-w-[120px]">{getColHeader("entryTime")}</th>
                <th className="table-header-cell min-w-[130px]">{getColHeader("landlordCommission")}</th>
                <th className="table-header-cell min-w-[110px]">{getColHeader("ourShare")}</th>
                <th className="table-header-cell min-w-[110px]">{getColHeader("attachments")}</th>
                <th className="table-header-cell min-w-[200px]">{getColHeader("originalMessage")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-16 text-center text-slate-400">
                    <Building className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <div>{t("common.noData")}</div>
                  </td>
                </tr>
              ) : (
                filteredData.map((row, idx) => {
                  const keyDetailsText =
                    typeof row.key_details === "object"
                      ? row.key_details?.[locale] || row.key_details?.vi || JSON.stringify(row.key_details)
                      : String(row.key_details || "—");

                  const attachmentList = Array.isArray(row.attachments) ? row.attachments : [];

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-sky-50/50 transition-colors ${
                        idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"
                      }`}
                    >
                      {/* 1. Mã BĐS */}
                      <td className="p-3 font-mono font-bold text-sky-700 whitespace-nowrap">
                        {row.code}
                      </td>

                      {/* 2. Địa chỉ */}
                      <td className="p-3 font-medium text-slate-900">
                        <div>{row.address_text}</div>
                        {row.district_legacy && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {row.district_legacy}, {row.province}
                          </div>
                        )}
                      </td>

                      {/* 3. Loại hình */}
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {row.property_types.map((type) => (
                            <span
                              key={type}
                              className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200"
                            >
                              {t(`types.${type}`) || type}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* 4. Diện tích 1 tầng */}
                      <td className="p-3 text-right font-semibold text-slate-800">
                        {row.floor_area_m2 ? `${row.floor_area_m2.toLocaleString()} m²` : "—"}
                      </td>

                      {/* 5. Tổng diện tích */}
                      <td className="p-3 text-right font-semibold text-slate-900">
                        {row.total_lease_area_m2 ? `${row.total_lease_area_m2.toLocaleString()} m²` : "—"}
                      </td>

                      {/* 6. Giá chào */}
                      <td className="p-3 font-semibold text-emerald-700">
                        <div>{formatPrice(row.price_amount ?? null, row.price_currency, locale, row.price_basis, row.price_period)}</div>
                        {row.price_text && (
                          <div className="text-[11px] text-slate-500 font-normal">
                            {row.price_text}
                          </div>
                        )}
                      </td>

                      {/* 7. Chi tiết chính */}
                      <td className="p-3 text-slate-600 line-clamp-3 max-w-[240px]">
                        {keyDetailsText || "—"}
                      </td>

                      {/* 8. Đối tác cung cấp */}
                      <td className="p-3 font-medium text-slate-800">
                        <div>{row.primary_partner?.display_name || "—"}</div>
                        {row.primary_partner?.phone && (
                          <div className="text-[11px] text-slate-500">{row.primary_partner.phone}</div>
                        )}
                      </td>

                      {/* 9. Thời điểm cung cấp lần đầu */}
                      <td className="p-3 text-slate-500 text-[11px]">
                        {formatDate(row.primary_partner?.first_seen_at)}
                      </td>

                      {/* 10. Người gửi và giờ tin Zalo */}
                      <td className="p-3 text-slate-600 text-[11px]">
                        {row.zalo_sender_name && (
                          <div className="font-medium text-slate-800 truncate max-w-[150px]" title={row.zalo_sender_name}>
                            {row.zalo_sender_name}
                          </div>
                        )}
                        <div className={row.zalo_sender_name ? "text-slate-500" : "font-medium text-slate-700"}>
                          {row.zalo_msg_time
                            ? formatDate(row.zalo_msg_time)
                            : row.zalo_sender_time || "—"}
                        </div>
                      </td>

                      {/* 11. Thời điểm duyệt đơn */}
                      <td className="p-3 text-slate-600 text-[11px] whitespace-nowrap">
                        <div className="font-medium text-slate-800">
                          {formatDate(row.entry_time)}
                        </div>
                      </td>

                      {/* 12. Hoa hồng chủ nhà */}
                      <td className="p-3 text-slate-700">
                        {row.landlord_commission_text || "—"}
                      </td>

                      {/* 13. Phần hoa hồng bên mình */}
                      <td className="p-3 text-slate-700 font-medium">
                        {row.our_share_percent ? `${row.our_share_percent}%` : row.our_share_text || "—"}
                      </td>

                      {/* 14. Link ảnh/tệp */}
                      <td className="p-3 text-center">
                        {attachmentList.length > 0 ? (
                          <button
                            onClick={() => setPreviewImages(attachmentList.map((a: any) => a.url || a.path))}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-sky-50 text-sky-700 hover:bg-sky-100 font-medium transition cursor-pointer text-[11px]"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span>{attachmentList.length} tệp</span>
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* 15. Nội dung gốc */}
                      <td className="p-3 text-slate-500 max-w-[220px]">
                        <div className="truncate" title={row.raw_text || ""}>
                          {row.raw_text || "—"}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lightbox Modal for Attachments */}
      {previewImages && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-base">Hình ảnh đính kèm</h3>
              <button
                onClick={() => setPreviewImages(null)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto p-1">
              {previewImages.map((src, i) => (
                <div key={i} className="aspect-video bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                  <img
                    src={src}
                    alt={`Attachment ${i + 1}`}
                    className="w-full h-full object-cover hover:scale-105 transition"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
