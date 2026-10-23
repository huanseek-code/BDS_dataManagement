"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  Edit3,
  Layers,
  FileText,
  Clock,
  User,
  Check,
  X,
  DollarSign,
  Copy,
  Save,
  Loader2,
  Calendar,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
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
  rental_options?: any[];
  key_details: { vi?: string; en?: string; zh?: string; handover_condition?: string } | any;
  primary_partner?: {
    display_name?: string | null;
    phone?: string | null;
    first_seen_at?: string | null;
    note?: string | null;
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

const AVAILABLE_PROPERTY_TYPES = [
  { key: "factory", vi: "Nhà xưởng", en: "Factory", zh: "厂房" },
  { key: "warehouse", vi: "Kho bãi", en: "Warehouse", zh: "仓库" },
  { key: "office", vi: "Văn phòng", en: "Office", zh: "写字楼" },
  { key: "retail", vi: "Mặt bằng", en: "Retail", zh: "商铺" },
  { key: "townhouse", vi: "Nhà phố", en: "Townhouse", zh: "临街排屋" },
  { key: "villa", vi: "Biệt thự", en: "Villa", zh: "别墅" },
  { key: "apartment", vi: "Chung cư", en: "Apartment", zh: "公寓" },
  { key: "land", vi: "Đất", en: "Land", zh: "土地" },
  { key: "hotel", vi: "Khách sạn", en: "Hotel", zh: "酒店" },
];

export function PropertyTable({ initialData }: { initialData: PropertyRow[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();

  const [tableData, setTableData] = useState<PropertyRow[]>(initialData);
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [showBilingual, setShowBilingual] = useState<boolean>(true);
  const [previewImages, setPreviewImages] = useState<string[] | null>(null);

  // Phân trang & kích thước trang
  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Modal 2: Rental Options & Fee Matrix
  const [selectedOptionModal, setSelectedOptionModal] = useState<PropertyRow | null>(null);

  // Modal 3: Source Audit & Full Edit Form
  const [editingRow, setEditingRow] = useState<PropertyRow | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);

  // Filter properties
  const filteredData = tableData.filter((item) => {
    const matchesSearch =
      !search ||
      item.code.toLowerCase().includes(search.toLowerCase()) ||
      item.address_text.toLowerCase().includes(search.toLowerCase()) ||
      (item.primary_partner?.display_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (item.province || "").toLowerCase().includes(search.toLowerCase());

    const matchesType =
      selectedType === "all" || item.property_types.includes(selectedType);

    return matchesSearch && matchesType;
  });

  // Tính toán phân trang
  const totalItems = filteredData.length;
  const effectivePageSize = pageSize === -1 ? (totalItems || 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(totalItems / effectivePageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * effectivePageSize;
  const endIndex = Math.min(startIndex + effectivePageSize, totalItems);
  const paginatedData = pageSize === -1 ? filteredData : filteredData.slice(startIndex, endIndex);

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

  const openEditModal = (row: PropertyRow) => {
    setEditingRow(row);
    setEditForm({
      province: row.province || "",
      address_text: row.address_text || "",
      district_legacy: row.district_legacy || "",
      ward: row.ward || "",
      property_types: Array.isArray(row.property_types) ? [...row.property_types] : ["townhouse"],
      total_lease_area_m2: row.total_lease_area_m2 ?? "",
      floor_area_m2: row.floor_area_m2 ?? "",
      price_amount: row.price_amount ?? "",
      price_currency: row.price_currency || "VND",
      price_period: row.price_period || "month",
      price_basis: row.price_basis || "total",
      price_text: row.price_text || "",
      landlord_commission_text: row.landlord_commission_text || "",
      our_share_percent: row.our_share_percent ?? "",
      our_share_text: row.our_share_text || "",
      handover_condition: row.key_details?.handover_condition || "basic_unfurnished",
      details_vi: row.key_details?.vi || "",
      details_zh: row.key_details?.zh || "",
      details_en: row.key_details?.en || "",
      rental_options: Array.isArray(row.rental_options) ? row.rental_options : [],
    });
  };

  const toggleEditPropertyType = (typeKey: string) => {
    if (!editForm) return;
    const currentTypes = Array.isArray(editForm.property_types) ? [...editForm.property_types] : [];
    const index = currentTypes.indexOf(typeKey);
    if (index > -1) {
      if (currentTypes.length > 1) {
        currentTypes.splice(index, 1);
      }
    } else {
      currentTypes.push(typeKey);
    }
    setEditForm({ ...editForm, property_types: currentTypes });
  };

  const handleSaveProperty = async () => {
    if (!editingRow || !editForm) return;

    if (!editForm.province?.trim() || !editForm.property_types || editForm.property_types.length === 0) {
      alert("Vui lòng chọn ít nhất một Loại hình BĐS và điền Tỉnh/Thành phố!");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/properties/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: editingRow.id,
          propertyData: {
            ...editForm,
            floor_area_m2: editForm.floor_area_m2 ? Number(editForm.floor_area_m2) : null,
            total_lease_area_m2: editForm.total_lease_area_m2 ? Number(editForm.total_lease_area_m2) : null,
            price_amount: editForm.price_amount ? Number(editForm.price_amount) : null,
            our_share_percent: editForm.our_share_percent ? Number(editForm.our_share_percent) : null,
            key_details: {
              ...editingRow.key_details,
              vi: editForm.details_vi,
              zh: editForm.details_zh,
              en: editForm.details_en,
              handover_condition: editForm.handover_condition,
              rental_options: editForm.rental_options,
            },
            rental_options: editForm.rental_options,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(t("inbox.errorOccurred") + ": " + (data.error || ""));
        return;
      }

      alert(t("properties.saveSuccess"));

      // Cập nhật state bảng trực tiếp
      const updatedTable = tableData.map((item) =>
        item.id === editingRow.id
          ? {
              ...item,
              ...editForm,
              property_types: editForm.property_types,
              floor_area_m2: editForm.floor_area_m2 ? Number(editForm.floor_area_m2) : null,
              total_lease_area_m2: editForm.total_lease_area_m2 ? Number(editForm.total_lease_area_m2) : null,
              price_amount: editForm.price_amount ? Number(editForm.price_amount) : null,
              key_details: {
                ...item.key_details,
                vi: editForm.details_vi,
                zh: editForm.details_zh,
                en: editForm.details_en,
                handover_condition: editForm.handover_condition,
                rental_options: editForm.rental_options,
              },
              rental_options: editForm.rental_options,
            }
          : item
      );

      setTableData(updatedTable);
      setEditingRow(null);
      router.refresh();
    } catch (err: any) {
      alert(t("inbox.errorOccurred") + ": " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyRaw = () => {
    if (editingRow?.raw_text) {
      navigator.clipboard.writeText(editingRow.raw_text);
      setCopiedRaw(true);
      setTimeout(() => setCopiedRaw(false), 2000);
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
            {tableData.length} {t("properties.unit")}
          </span>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Search box */}
          <div className="relative min-w-[260px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t("common.search")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
            />
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
            >
              {propertyTypesList.map((pt) => (
                <option key={pt.key} value={pt.key}>
                  {pt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Page size selector */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium pl-1 border-l border-slate-200">
            <span>{t("common.rowsPerPage")}</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={-1}>{t("common.all")}</option>
            </select>
            <span>{t("common.perPage")}</span>
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
                <th className="table-header-cell w-[110px]">{getColHeader("code")}</th>
                <th className="table-header-cell min-w-[200px]">{getColHeader("address")}</th>
                <th className="table-header-cell min-w-[130px]">{getColHeader("types")}</th>
                <th className="table-header-cell min-w-[110px]">{getColHeader("floorArea")}</th>
                <th className="table-header-cell min-w-[120px]">{getColHeader("totalLeaseArea")}</th>
                <th className="table-header-cell min-w-[150px]">{getColHeader("price")}</th>
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
              {totalItems === 0 ? (
                <tr>
                  <td colSpan={15} className="py-16 text-center text-slate-400">
                    <Building className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <div>{t("common.noData")}</div>
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, idx) => {
                  const keyDetailsText =
                    typeof row.key_details === "object"
                      ? row.key_details?.[locale] || row.key_details?.vi || JSON.stringify(row.key_details)
                      : String(row.key_details || "—");

                  const attachmentList = Array.isArray(row.attachments) ? row.attachments : [];
                  const hasMultiOptions = Array.isArray(row.rental_options) && row.rental_options.length > 0;

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-sky-50/50 transition-colors ${
                        idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"
                      }`}
                    >
                      {/* 1. Mã BĐS + Nút Sửa/Nguồn */}
                      <td className="p-3 whitespace-nowrap">
                        <div className="font-mono font-bold text-sky-700">{row.code}</div>
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-[10px] font-semibold transition cursor-pointer shadow-xs"
                          title={t("properties.editSourceTitle")}
                        >
                          <Edit3 className="w-3 h-3 text-sky-600" />
                          <span>{t("properties.edit")}</span>
                        </button>
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
                          {row.property_types && row.property_types.length > 0 ? (
                            row.property_types.map((type) => (
                              <span
                                key={type}
                                className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200"
                              >
                                {t(`types.${type}`) || type}
                              </span>
                            ))
                          ) : (
                            <span className="text-rose-500 text-[10px] italic">Chưa phân loại</span>
                          )}
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

                      {/* 6. Giá chào (TRỤ CỘT 7: Hỗ trợ Đa phương án) */}
                      <td className="p-3 font-semibold text-emerald-700">
                        {hasMultiOptions ? (
                          <div className="space-y-1">
                            <button
                              type="button"
                              onClick={() => setSelectedOptionModal(row)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold border border-emerald-300 transition cursor-pointer shadow-xs"
                            >
                              <Layers className="w-3 h-3 text-emerald-700" />
                              <span>{t("properties.rentalOptionsBadge")} ({row.rental_options!.length})</span>
                            </button>
                            <div className="text-[11px]">
                              {formatPrice(row.price_amount ?? null, row.price_currency, locale, row.price_basis, row.price_period)}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div>{formatPrice(row.price_amount ?? null, row.price_currency, locale, row.price_basis, row.price_period)}</div>
                            {row.price_text && (
                              <div className="text-[11px] text-slate-500 font-normal">
                                {row.price_text}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 7. Chi tiết chính */}
                      <td className="p-3 text-slate-600 line-clamp-3 max-w-[240px]">
                        {keyDetailsText || "—"}
                      </td>

                      {/* 8. Đối tác cung cấp */}
                      <td className="p-3 font-medium text-slate-800">
                        <div className="flex items-center gap-1.5">
                          {row.primary_partner?.note?.startsWith("avatar:") && (
                            <img
                              src={row.primary_partner.note.slice(7)}
                              alt=""
                              className="w-5 h-5 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                          )}
                          <div>{row.primary_partner?.display_name || "—"}</div>
                        </div>
                        {row.primary_partner?.phone && (
                          <div className="text-[11px] text-slate-500 pl-6.5">{row.primary_partner.phone}</div>
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
                            onClick={() =>
                              setPreviewImages(
                                attachmentList
                                  .map((a: any) => (typeof a === "string" ? a : a?.url || a?.path || ""))
                                  .filter(Boolean)
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 font-semibold border border-sky-200 transition cursor-pointer text-[11px] shadow-sm"
                          >
                            <ImageIcon className="w-3.5 h-3.5 text-sky-600" />
                            <span>{attachmentList.length} ảnh</span>
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* 15. Nội dung gốc */}
                      <td className="p-3 text-slate-500 max-w-[220px]">
                        <div
                          className="truncate cursor-pointer hover:text-sky-700"
                          title={row.raw_text || ""}
                          onClick={() => openEditModal(row)}
                        >
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

      {/* Pagination Controls */}
      {totalItems > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white rounded-xl border border-slate-200 shadow-sm text-xs text-slate-600">
          <div className="font-medium text-slate-600">
            <span>{t("common.showing")} </span>
            <strong className="text-slate-900 font-bold">{totalItems === 0 ? 0 : startIndex + 1}</strong>
            <span> - </span>
            <strong className="text-slate-900 font-bold">{endIndex}</strong>
            <span> {t("common.of")} </span>
            <strong className="text-sky-700 font-bold">{totalItems}</strong>
            <span> {t("common.propertiesUnit")}</span>
            {pageSize !== -1 && (
              <span className="text-slate-400 ml-2">
                ({t("common.page")} {safeCurrentPage} / {totalPages})
              </span>
            )}
          </div>

          {pageSize !== -1 && totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage(1)}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Trang đầu"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer font-semibold"
                title="Trang trước"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>{t("common.prevPage")}</span>
              </button>

              <div className="flex items-center gap-1 px-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - safeCurrentPage) <= 2)
                  .map((p, idx, arr) => {
                    const prev = arr[idx - 1];
                    const showEllipsis = prev && p - prev > 1;
                    return (
                      <span key={p} className="flex items-center">
                        {showEllipsis && <span className="px-1 text-slate-400 font-bold">...</span>}
                        <button
                          type="button"
                          onClick={() => setCurrentPage(p)}
                          className={`w-7 h-7 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center ${
                            safeCurrentPage === p
                              ? "bg-sky-600 text-white shadow-xs"
                              : "text-slate-700 hover:bg-slate-100 border border-slate-200"
                          }`}
                        >
                          {p}
                        </button>
                      </span>
                    );
                  })}
              </div>

              <button
                type="button"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer font-semibold"
                title="Trang sau"
              >
                <span>{t("common.nextPage")}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Trang cuối"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: LIGHTBOX ZOOM XEM ẢNH */}
      {previewImages && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm">
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

      {/* MODAL 2: TRỤ CỘT 7 - MA TRẬN PHƯƠNG ÁN THUÊ & PHÂN TÁCH CHI PHÍ */}
      {selectedOptionModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-bold text-slate-900 text-base">
                    {t("properties.rentalOptionsTitle")}
                  </h3>
                  <span className="font-mono text-xs font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded">
                    {selectedOptionModal.code}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{selectedOptionModal.address_text}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOptionModal(null)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {selectedOptionModal.rental_options?.map((opt: any, idx: number) => (
                <div
                  key={opt.id || idx}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 transition space-y-3"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      <span>{opt.name || `Phương án ${idx + 1}`}</span>
                      {opt.floors_included && (
                        <span className="text-[11px] font-medium text-slate-500 bg-white border px-2 py-0.5 rounded">
                          {opt.floors_included}
                        </span>
                      )}
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      {opt.status === "available" ? "Đang trống" : opt.status === "negotiating" ? "Đang thương lượng" : "Đã thuê"}
                    </span>
                  </div>

                  {/* Bảng phân tách chi tiết */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase block mb-1">
                        1. Tiền thuê mặt bằng
                      </span>
                      <div className="font-bold text-emerald-700 text-sm">
                        {opt.base_rent?.amount ? Number(opt.base_rent.amount).toLocaleString() : "—"}{" "}
                        {opt.base_rent?.currency || "USD"}{" "}
                        <span className="text-[10px] text-slate-500 font-normal">
                          / {opt.base_rent?.basis === "per_m2" ? "m²/" : ""}{opt.base_rent?.period || "tháng"}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Diện tích tính tiền: <strong>{opt.rentable_area_m2 || "—"} m²</strong>
                      </div>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase block mb-1">
                        2. Phí quản lý & Dịch vụ
                      </span>
                      <div className="font-semibold text-slate-800">
                        {opt.fee_schedule?.management_fee?.amount
                          ? `${Number(opt.fee_schedule.management_fee.amount).toLocaleString()} ${opt.fee_schedule.management_fee.currency || "USD"}`
                          : "Đã bao gồm trong tiền thuê"}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                        <div>Điện: <strong>{opt.fee_schedule?.electricity?.rate_text || "chưa xác nhận"}</strong></div>
                        <div>Nước: <strong>{opt.fee_schedule?.water?.rate_text || "chưa xác nhận"}</strong></div>
                      </div>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase block mb-1">
                        3. Đặt cọc & Thanh toán
                      </span>
                      <div className="font-semibold text-slate-800">
                        Cọc: <strong>{opt.lease_terms?.deposit_months || 3} tháng</strong>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Kỳ hạn thanh toán: <strong>{opt.lease_terms?.payment_cycle || "Hàng quý"}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Dòng tổng hợp cố định */}
                  {opt.monthly_fixed_summary && (
                    <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-emerald-900">
                      <span className="font-semibold">
                        Tổng cố định hàng tháng (Thuê + Quản lý):
                      </span>
                      <span className="font-bold text-sm font-mono">
                        {Number(opt.monthly_fixed_summary.total_amount).toLocaleString()} {opt.monthly_fixed_summary.currency}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: TRỤ CỘT 6 - ĐỐI SOÁT NGUỒN GỐC ZALO & CHỈNH SỬA TOÀN DIỆN */}
      {editingRow && editForm && (
        <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-sky-600" />
                  <h3 className="font-bold text-slate-900 text-base">
                    {t("properties.editSourceTitle")}
                  </h3>
                  <span className="font-mono text-xs font-bold text-sky-800 bg-sky-100 px-2 py-0.5 rounded">
                    {editingRow.code}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Đối soát nguyên văn nguồn tin nhắn Zalo và cập nhật trường dữ liệu vào kho lưu trữ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Split Screen: Left (Source Audit) vs Right (Edit Form) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Nguồn gốc đối soát Zalo */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                    <FileText className="w-4 h-4 text-sky-600" />
                    <span>Nguồn tin Zalo gốc</span>
                  </div>
                  {editingRow.raw_text && (
                    <button
                      type="button"
                      onClick={handleCopyRaw}
                      className="text-[11px] text-sky-600 hover:text-sky-800 font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      {copiedRaw ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedRaw ? "Đã copy" : "Copy tin gốc"}</span>
                    </button>
                  )}
                </div>

                {/* Info Card */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Người gửi:</span>
                    <span className="font-semibold text-slate-800">{editingRow.zalo_sender_name || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Số điện thoại:</span>
                    <span className="font-semibold text-slate-800">{editingRow.primary_partner?.phone || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Thời điểm nhận tin:</span>
                    <span className="font-mono text-slate-700">{formatDate(editingRow.zalo_msg_time)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Thời điểm duyệt vào kho:</span>
                    <span className="font-mono text-slate-700">{formatDate(editingRow.entry_time)}</span>
                  </div>
                </div>

                {/* Tin nhắn text gốc */}
                <div className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap shadow-inner">
                  {editingRow.raw_text || "(Không có nội dung text gốc)"}
                </div>

                {/* Ảnh đính kèm từ Zalo */}
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                  <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-sky-600" />
                    <span>Ảnh đính kèm ({editingRow.attachments?.length || 0})</span>
                  </div>
                  {editingRow.attachments && editingRow.attachments.length > 0 ? (
                    <div className="grid grid-cols-4 gap-2">
                      {editingRow.attachments.map((a: any, i: number) => {
                        const url = typeof a === "string" ? a : a?.url || "";
                        return (
                          <div
                            key={i}
                            className="aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-200 cursor-pointer hover:scale-105 transition"
                            onClick={() => setPreviewImages([url])}
                          >
                            <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 italic">Không có ảnh nào</div>
                  )}
                </div>
              </div>

              {/* Right Column: Form chỉnh sửa BĐS */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                    <Edit3 className="w-4 h-4 text-emerald-600" />
                    <span>Chỉnh sửa thông tin BĐS</span>
                  </div>
                </div>

                <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-white max-h-[580px] overflow-y-auto shadow-sm">
                  {/* Loại hình BĐS */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      {t("inbox.propertyTypes")} <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {AVAILABLE_PROPERTY_TYPES.map((pt) => {
                        const isSelected = editForm.property_types?.includes(pt.key);
                        const label = locale === "zh" ? pt.zh : locale === "en" ? pt.en : pt.vi;
                        return (
                          <button
                            key={pt.key}
                            type="button"
                            onClick={() => toggleEditPropertyType(pt.key)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition border cursor-pointer ${
                              isSelected
                                ? "bg-sky-600 text-white border-sky-600 shadow-sm"
                                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tỉnh / TP & Địa chỉ */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Tỉnh / TP <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={editForm.province}
                        onChange={(e) => setEditForm({ ...editForm, province: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Quận / Huyện
                      </label>
                      <input
                        type="text"
                        value={editForm.district_legacy}
                        onChange={(e) => setEditForm({ ...editForm, district_legacy: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Địa chỉ chi tiết
                    </label>
                    <input
                      type="text"
                      value={editForm.address_text}
                      onChange={(e) => setEditForm({ ...editForm, address_text: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                    />
                  </div>

                  {/* Diện tích */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Tổng DT cho thuê (m²)
                      </label>
                      <input
                        type="number"
                        value={editForm.total_lease_area_m2}
                        onChange={(e) => setEditForm({ ...editForm, total_lease_area_m2: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        DT 1 tầng (m²)
                      </label>
                      <input
                        type="number"
                        value={editForm.floor_area_m2}
                        onChange={(e) => setEditForm({ ...editForm, floor_area_m2: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      />
                    </div>
                  </div>

                  {/* Giá tiền */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Đơn giá chào
                      </label>
                      <input
                        type="number"
                        value={editForm.price_amount}
                        onChange={(e) => setEditForm({ ...editForm, price_amount: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-semibold text-emerald-700"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Tiền tệ
                      </label>
                      <select
                        value={editForm.price_currency}
                        onChange={(e) => setEditForm({ ...editForm, price_currency: e.target.value })}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-semibold"
                      >
                        <option value="VND">VND (₫)</option>
                        <option value="USD">USD ($)</option>
                      </select>
                    </div>
                  </div>

                  {/* Hoa hồng */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Hoa hồng chủ nhà trả
                      </label>
                      <input
                        type="text"
                        value={editForm.landlord_commission_text}
                        onChange={(e) => setEditForm({ ...editForm, landlord_commission_text: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Phần bên mình nhận (%)
                      </label>
                      <input
                        type="number"
                        value={editForm.our_share_percent}
                        onChange={(e) => setEditForm({ ...editForm, our_share_percent: e.target.value })}
                        placeholder="50"
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      />
                    </div>
                  </div>

                  {/* Hiện trạng bàn giao */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Hiện trạng bàn giao
                    </label>
                    <select
                      value={editForm.handover_condition}
                      onChange={(e) => setEditForm({ ...editForm, handover_condition: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-medium"
                    >
                      <option value="bare_shell">Bàn giao thô (Chưa hoàn thiện)</option>
                      <option value="basic_unfurnished">Hoàn thiện cơ bản (Không đồ)</option>
                      <option value="partially_furnished">Nội thất cơ bản (Bếp, điều hòa)</option>
                      <option value="fully_furnished">Đầy đủ nội thất (Full đồ)</option>
                    </select>
                  </div>

                  {/* Chi tiết Tiếng Việt */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Mô tả đặc điểm (Tiếng Việt)
                    </label>
                    <textarea
                      rows={2}
                      value={editForm.details_vi}
                      onChange={(e) => setEditForm({ ...editForm, details_vi: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                    />
                  </div>

                  {/* Chi tiết Tiếng Trung */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Mô tả đặc điểm (Tiếng Trung - 中文)
                    </label>
                    <textarea
                      rows={2}
                      value={editForm.details_zh}
                      onChange={(e) => setEditForm({ ...editForm, details_zh: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-sans"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingRow(null)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleSaveProperty}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{t("properties.saveChanges")}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
