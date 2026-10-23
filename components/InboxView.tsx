"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  CheckCircle2,
  XCircle,
  Building,
  User,
  Clock,
  FileText,
  DollarSign,
  MapPin,
  Maximize2,
  Percent,
  Layers,
  Sparkles,
  Loader2,
  GitMerge,
  Calculator,
  Tag,
  Image as ImageIcon,
  AlertTriangle,
  Undo2,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Upload,
  RefreshCw,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";

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

export function InboxView({
  initialListings,
}: {
  initialListings: any[];
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();

  const [listings, setListings] = useState<any[]>(initialListings);
  const [selectedListing, setSelectedListing] = useState<any>(
    initialListings[0] || null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFullChat, setShowFullChat] = useState(false);
  const [activeLightboxImg, setActiveLightboxImg] = useState<string | null>(null);
  const [mergeModalSibling, setMergeModalSibling] = useState<any | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const [formState, setFormState] = useState<any>(
    initialListings[0] ? extractFormData(initialListings[0]) : null
  );

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const handleUploadPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhotos(true);
    try {
      const fd = new FormData();
      for (let i = 0; i < files.length; i++) {
        fd.append("files", files[i]);
      }

      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();
      if (res.ok && Array.isArray(data.urls) && data.urls.length > 0) {
        const currentAtt = Array.isArray(formState.attachments) ? formState.attachments : [];
        const updated = [...currentAtt, ...data.urls];
        setFormState({
          ...formState,
          attachments: updated,
        });

        if (selectedListing?.id) {
          fetch("/api/inbox/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "update_attachments",
              listingId: selectedListing.id,
              attachments: updated,
            }),
          }).catch(() => {});
        }
      } else {
        alert("Upload error: " + (data.error || "Failed to upload"));
      }
    } catch (err: any) {
      alert("Upload failed: " + err.message);
    } finally {
      setUploadingPhotos(false);
      e.target.value = "";
    }
  };

  function normalizeHandoverCondition(val?: string | null): string {
    if (!val) return "basic_unfurnished";
    const s = String(val).toLowerCase().trim();
    if (s === "bare_shell" || s.includes("thô") || s.includes("毛坯")) return "bare_shell";
    if (s === "fully_furnished" || s.includes("full") || s.includes("đầy đủ") || s.includes("精装") || s.includes("furnished")) return "fully_furnished";
    if (s === "partially_furnished" || s.includes("liền tường") || s.includes("cơ bản") || s.includes("bán hoàn thiện")) return "partially_furnished";
    if (s === "basic_unfurnished" || s.includes("không đồ") || s.includes("nhà trống") || s.includes("chưa đồ") || s.includes("简装")) return "basic_unfurnished";
    return "basic_unfurnished";
  }

  function extractFormData(listing: any) {
    const rawAttachments = Array.isArray(listing.attachments)
      ? listing.attachments
      : Array.isArray(listing.submission?.attachments)
      ? listing.submission.attachments
      : [];

    const stringUrls: string[] = rawAttachments
      .map((a: any) => (typeof a === "string" ? a : a?.url || a?.path || ""))
      .filter(Boolean);

    return {
      province: listing.province || "",
      address_text: listing.address_text || "",
      property_types:
        Array.isArray(listing.property_types) && listing.property_types.length > 0
          ? listing.property_types
          : ["townhouse"],
      total_lease_area_m2: listing.total_lease_area_m2 || "",
      floor_area_m2: listing.floor_area_m2 || "",
      price_amount: listing.price_amount || "",
      price_currency: listing.price_currency || "VND",
      price_period:
        listing.price_period === "monthly" ? "month" : listing.price_period || "month",
      price_basis: listing.price_basis || "total",
      price_text: listing.price_text || listing.ai_extracted?.price_text || "",
      landlord_commission_text: listing.landlord_commission_text || "",
      our_share_text: listing.our_share_text || "",
      handover_condition: normalizeHandoverCondition(
        listing.handover_condition || listing.ai_extracted?.handover_condition
      ),
      details_vi: listing.key_details?.vi || "",
      details_zh: listing.key_details?.zh || "",
      details_en: listing.key_details?.en || "",
      attachments: stringUrls,
    };
  }

  const handleSelect = (listing: any) => {
    setSelectedListing(listing);
    setFormState(extractFormData(listing));
  };

  const togglePropertyType = (typeKey: string) => {
    const currentTypes = Array.isArray(formState.property_types) ? [...formState.property_types] : [];
    const index = currentTypes.indexOf(typeKey);
    if (index > -1) {
      if (currentTypes.length > 1) {
        currentTypes.splice(index, 1);
      }
    } else {
      currentTypes.push(typeKey);
    }
    setFormState({ ...formState, property_types: currentTypes });
  };

  const handleApprove = async () => {
    if (!selectedListing || !formState) return;

    // PRE-APPROVAL VALIDATION GATE
    if (!formState.province?.trim() || !Array.isArray(formState.property_types) || formState.property_types.length === 0) {
      alert(t("inbox.validationRequired"));
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/inbox/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          listingId: selectedListing.id,
          propertyData: {
            ...formState,
            total_lease_area_m2: formState.total_lease_area_m2 ? Number(formState.total_lease_area_m2) : null,
            floor_area_m2: formState.floor_area_m2 ? Number(formState.floor_area_m2) : null,
            price_amount: formState.price_amount ? Number(formState.price_amount) : null,
            price_basis: formState.price_basis || "total",
            price_period: formState.price_period || "month",
            price_text: formState.price_text || null,
            attachments: formState.attachments || [],
            key_details: {
              vi: formState.details_vi,
              zh: formState.details_zh,
              en: formState.details_en,
              handover_condition: formState.handover_condition,
            },
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(t("inbox.errorOccurred") + ": " + (data.error || ""));
        return;
      }

      alert(t("inbox.approveSuccess"));
      const nextList = listings.filter((l) => l.id !== selectedListing.id);
      setListings(nextList);
      setSelectedListing(nextList[0] || null);
      if (nextList[0]) setFormState(extractFormData(nextList[0]));
      router.refresh();
    } catch (err: any) {
      alert(t("inbox.errorOccurred") + ": " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedListing) return;
    if (!confirm(t("common.confirm") + " " + t("inbox.reject") + "?")) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/inbox/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          listingId: selectedListing.id,
        }),
      });

      if (!res.ok) {
        alert(t("inbox.errorOccurred"));
        return;
      }

      alert(t("inbox.rejectSuccess"));
      const nextList = listings.filter((l) => l.id !== selectedListing.id);
      setListings(nextList);
      setSelectedListing(nextList[0] || null);
      if (nextList[0]) setFormState(extractFormData(nextList[0]));
      router.refresh();
    } catch (err: any) {
      alert(t("inbox.errorOccurred") + ": " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Mở modal kiểm tra trước khi gộp
  const openMergePreview = () => {
    if (!selectedListing) return;
    const sibling = listings.find(
      (l) => l.id !== selectedListing.id && l.partner_id === selectedListing.partner_id
    );
    if (!sibling) {
      alert("Không tìm thấy tin nhắn khác của đối tác này để gộp.");
      return;
    }
    setMergeModalSibling(sibling);
  };

  // Thực hiện gộp an toàn sau khi xác nhận trên modal
  const executeMerge = async (sourceId: string) => {
    if (!selectedListing) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/inbox/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceListingId: sourceId,
          targetListingId: selectedListing.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(t("inbox.errorOccurred") + ": " + (data.error || ""));
        return;
      }

      alert(t("inbox.mergeSuccess"));
      setMergeModalSibling(null);

      const updatedList = listings
        .filter((l) => l.id !== sourceId)
        .map((l) => (l.id === selectedListing.id ? { ...l, ...data.updatedListing } : l));
      setListings(updatedList);
      const newSelected = updatedList.find((l) => l.id === selectedListing.id) || updatedList[0];
      setSelectedListing(newSelected);
      if (newSelected) setFormState(extractFormData(newSelected));
      router.refresh();
    } catch (err: any) {
      alert(t("inbox.errorOccurred") + ": " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Hoàn tác gộp 1 chạm
  const handleUndoMerge = async () => {
    if (!selectedListing) return;
    if (!confirm(t("inbox.undoMergeConfirm"))) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/inbox/unmerge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetListingId: selectedListing.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(t("inbox.errorOccurred") + ": " + (data.error || ""));
        return;
      }

      alert(t("inbox.undoMergeSuccess"));
      router.refresh();
      window.location.reload();
    } catch (err: any) {
      alert(t("inbox.errorOccurred") + ": " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Kiểm tra xem listing hiện tại có snapshot merge để hoàn tác không
  const hasMergeSnapshot =
    Array.isArray(selectedListing?.change_history) &&
    selectedListing.change_history.some((h: any) => h.event === "MERGE_SNAPSHOT");

  // Kiểm tra xem có cảnh báo khác địa chỉ khi gộp không
  const isAddressMismatch =
    mergeModalSibling &&
    selectedListing &&
    (
      (selectedListing.province && mergeModalSibling.province && selectedListing.province !== mergeModalSibling.province) ||
      (selectedListing.district_legacy && mergeModalSibling.district_legacy && selectedListing.district_legacy !== mergeModalSibling.district_legacy) ||
      (selectedListing.address_text && mergeModalSibling.address_text &&
        !selectedListing.address_text.toLowerCase().includes(mergeModalSibling.address_text.toLowerCase().slice(0, 10)) &&
        !mergeModalSibling.address_text.toLowerCase().includes(selectedListing.address_text.toLowerCase().slice(0, 10)))
    );

  // Tính ước tính tổng tiền nếu là giá theo m2
  const estimatedTotalPrice =
    formState &&
    formState.price_basis === "per_m2" &&
    formState.price_amount &&
    formState.total_lease_area_m2
      ? Number(formState.price_amount) * Number(formState.total_lease_area_m2)
      : null;

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          {t("inbox.pageTitle")}
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {t("inbox.pageSubtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left List of Listings (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between pb-1">
            <h2 className="font-bold text-slate-900 text-sm">
              {t("inbox.title")} ({listings.length})
            </h2>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-sky-700 bg-slate-100 hover:bg-sky-50 rounded-lg transition border border-slate-200 cursor-pointer disabled:opacity-50"
              title={t("common.refresh")}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-sky-600" : ""}`} />
              <span>{t("common.refresh")}</span>
            </button>
          </div>

          <div className="space-y-2.5 max-h-[780px] overflow-y-auto pr-1">
            {listings.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <div className="text-sm font-medium">{t("inbox.noPending")}</div>
              </div>
            ) : (
              listings.map((item) => {
                const isSelected = selectedListing?.id === item.id;
                const attCount = Array.isArray(item.attachments) ? item.attachments.length : 0;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className={`p-4 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? "bg-sky-50 border-sky-400 shadow-sm ring-1 ring-sky-300"
                        : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                        {item.partner?.note?.startsWith("avatar:") ? (
                          <img
                            src={item.partner.note.slice(7)}
                            alt=""
                            className="w-4 h-4 rounded-full object-cover border border-slate-200"
                          />
                        ) : (
                          <User className="w-3.5 h-3.5 text-sky-600" />
                        )}
                        <span>{item.partner?.display_name || t("inbox.partnerZalo")}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(item.created_at).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    {/* Dữ liệu địa chỉ */}
                    <p className="text-xs font-medium text-slate-800 line-clamp-2 mt-2">
                      {item.address_text || item.submission?.raw_text || "(Chưa có địa chỉ)"}
                    </p>

                    <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                      {item.total_lease_area_m2 && (
                        <span className="flex items-center gap-1 font-semibold text-slate-700">
                          <Maximize2 className="w-3 h-3 text-slate-400" />
                          {Number(item.total_lease_area_m2).toLocaleString()} m²
                        </span>
                      )}
                      {attCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded">
                          <ImageIcon className="w-3 h-3" />
                          {attCount}
                        </span>
                      )}
                      <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                        {t("reviewStatus.pending")}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Diff & Review Panel (8 cols) */}
        <div className="lg:col-span-8">
          {selectedListing && formState ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 space-y-6">
              {/* Header info */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    {selectedListing.partner?.note?.startsWith("avatar:") ? (
                      <img
                        src={selectedListing.partner.note.slice(7)}
                        alt=""
                        className="w-7 h-7 rounded-full object-cover border border-slate-200 shadow-xs"
                      />
                    ) : (
                      <User className="w-5 h-5 text-sky-600" />
                    )}
                    <h3 className="font-bold text-slate-900 text-base">
                      {selectedListing.partner?.display_name || t("inbox.partnerZalo")}
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-100 text-sky-800 font-mono">
                      Zalo ID: {selectedListing.partner?.zalo_user_id}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {t("inbox.receivedAt")}: {new Date(selectedListing.created_at).toLocaleString("vi-VN")}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  {/* Nút Hoàn tác gộp nếu từng gộp */}
                  {hasMergeSnapshot && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleUndoMerge}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold shadow-sm transition cursor-pointer disabled:opacity-50"
                      title={t("inbox.undoMerge")}
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>{t("inbox.undoMerge")}</span>
                    </button>
                  )}

                  {/* Nút Gộp tin đối tác với Modal so sánh */}
                  {listings.filter(
                    (l) => l.id !== selectedListing.id && l.partner_id === selectedListing.partner_id
                  ).length > 0 && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={openMergePreview}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow transition cursor-pointer disabled:opacity-50"
                      title={t("inbox.mergePrompt")}
                    >
                      <GitMerge className="w-3.5 h-3.5" />
                      <span>{t("inbox.merge")}</span>
                    </button>
                  )}

                  {/* Nút Duyệt BĐS (với Validation Gate) */}
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleApprove}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow transition cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>{t("inbox.approve")}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleReject}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{t("inbox.reject")}</span>
                  </button>
                </div>
              </div>

              {/* Split Screen Diff: Left Original Text vs Right Structured Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column: Nguyên văn tin nhắn gốc & Media Gallery */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                      <FileText className="w-4 h-4 text-sky-600" />
                      <span>{t("inbox.originalSnippetTitle")}</span>
                    </div>
                    {selectedListing.submission?.raw_text && (
                      <button
                        type="button"
                        onClick={() => setShowFullChat(!showFullChat)}
                        className="text-[10px] text-sky-600 hover:text-sky-800 underline font-medium cursor-pointer"
                      >
                        {showFullChat ? t("inbox.collapseChat") : t("inbox.viewFullChat")}
                      </button>
                    )}
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed font-mono whitespace-pre-wrap min-h-[300px] max-h-[460px] overflow-y-auto shadow-inner space-y-3">
                    {showFullChat ? (
                      <div>
                        <div className="text-[11px] font-bold text-slate-500 mb-2 pb-1 border-b border-slate-200">
                          {t("inbox.allChatTitle")} ({selectedListing.submission?.msg_count || 1} tin)
                        </div>
                        {selectedListing.submission?.raw_text || "(Không có nội dung text)"}
                      </div>
                    ) : (
                      <div>
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-700 mb-2">
                          <span>{t("inbox.thisSnippetBadge")}</span>
                        </div>
                        <div className="text-slate-800">
                          {selectedListing.ai_extracted?.source_text_snippet ||
                            selectedListing.location_note ||
                            selectedListing.change_history?.[0]?.text ||
                            selectedListing.submission?.raw_text ||
                            "(Không có nội dung text)"}
                        </div>

                        {Array.isArray(selectedListing.change_history) &&
                          selectedListing.change_history.length > 1 && (
                            <div className="mt-4 pt-3 border-t border-slate-200 space-y-2">
                              <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">
                                {t("inbox.appendedHistory")} ({selectedListing.change_history.length} tin):
                              </div>
                              {selectedListing.change_history.map((h: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="p-2 rounded bg-white border border-slate-200 text-[11px] text-slate-600"
                                >
                                  <span className="text-[9px] text-slate-400 font-mono block">
                                    {h.created_at
                                      ? `${t("inbox.createdMsg")}: ${new Date(h.created_at).toLocaleTimeString("vi-VN")}`
                                      : `${t("inbox.appendedMsg")}: ${new Date(h.appended_at).toLocaleTimeString("vi-VN")}`}
                                  </span>
                                  {h.text}
                                </div>
                              ))}
                            </div>
                          )}
                      </div>
                    )}
                  </div>

                  {/* Trụ cột 1: ImageGalleryStrip dưới tin nhắn Zalo */}
                  <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4 text-sky-600" />
                        <span>{t("inbox.attachedImages")}</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700">
                          {formState.attachments?.length || 0}
                        </span>
                      </span>

                      {/* Nút tải thêm ảnh thủ công từ máy tính */}
                      <label className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-sky-700 bg-white hover:bg-sky-50 border border-sky-200 rounded-lg shadow-2xs cursor-pointer transition">
                        {uploadingPhotos ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                        ) : (
                          <Upload className="w-3.5 h-3.5 text-sky-600" />
                        )}
                        <span>{uploadingPhotos ? t("inbox.uploading") : t("inbox.uploadMorePhotos")}</span>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          disabled={uploadingPhotos}
                          onChange={handleUploadPhotos}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {formState.attachments && formState.attachments.length > 0 ? (
                      <div className="grid grid-cols-4 gap-2 pt-1">
                        {formState.attachments.map((url: string, idx: number) => (
                          <div
                            key={idx}
                            className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-200 shadow-sm"
                          >
                            <img
                              src={url}
                              alt={`Zalo attachment ${idx + 1}`}
                              onClick={() => setActiveLightboxImg(url)}
                              onError={(e) => {
                                const target = e.currentTarget;
                                target.style.display = "none";
                                if (target.parentElement && !target.parentElement.querySelector(".img-err-fallback")) {
                                  target.parentElement.classList.add("bg-slate-100", "flex", "items-center", "justify-center");
                                  const span = document.createElement("span");
                                  span.className = "img-err-fallback text-[10px] text-slate-400 font-medium text-center px-1 select-none";
                                  span.innerText = "⚠️ Ảnh hỏng";
                                  target.parentElement.appendChild(span);
                                }
                              }}
                              className="w-full h-full object-cover cursor-pointer hover:scale-105 transition"
                            />
                            {/* Nút gỡ ảnh rác */}
                            <button
                              type="button"
                              onClick={() => {
                                setFormState({
                                  ...formState,
                                  attachments: formState.attachments.filter((_: any, i: number) => i !== idx),
                                });
                              }}
                              className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-rose-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
                              title={t("inbox.removeImage")}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 italic py-2 text-center">
                        {t("inbox.noImages")}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Trường dữ liệu chuẩn hóa AI đã trích xuất */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span>{t("inbox.aiNormalizedTitle")}</span>
                    </div>
                    <span className="text-[10px] text-slate-400">{t("inbox.editableHint")}</span>
                  </div>

                  <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-white max-h-[660px] overflow-y-auto shadow-sm">
                    {/* TRỤ CỘT 6: Loại hình BĐS (Multi-select) */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-semibold text-slate-700 block">
                          {t("inbox.propertyTypes")} <span className="text-rose-500">*</span>
                        </label>
                        {(!formState.property_types || formState.property_types.length === 0) && (
                          <span className="text-[10px] text-rose-600 font-bold flex items-center gap-0.5">
                            <AlertTriangle className="w-3 h-3" /> Bắt buộc chọn
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {AVAILABLE_PROPERTY_TYPES.map((pt) => {
                          const isSelected = formState.property_types?.includes(pt.key);
                          const label = locale === "zh" ? pt.zh : locale === "en" ? pt.en : pt.vi;
                          return (
                            <button
                              key={pt.key}
                              type="button"
                              onClick={() => togglePropertyType(pt.key)}
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

                    {/* Tỉnh / TP (Bắt buộc) */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-slate-600 block">
                          {t("inbox.province")} <span className="text-rose-500">*</span>
                        </label>
                        {!formState.province?.trim() && (
                          <span className="text-[10px] text-rose-600 font-bold">Bắt buộc</span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={formState.province}
                        onChange={(e) => setFormState({ ...formState, province: e.target.value })}
                        className={`w-full px-3 py-1.5 text-xs rounded-lg border bg-slate-50 focus:bg-white focus:ring-2 focus:ring-sky-500 ${
                          !formState.province?.trim() ? "border-rose-300 ring-1 ring-rose-200" : "border-slate-200"
                        }`}
                      />
                    </div>

                    {/* Địa chỉ / Vị trí */}
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        {t("inbox.address")}
                      </label>
                      <input
                        type="text"
                        value={formState.address_text}
                        onChange={(e) => setFormState({ ...formState, address_text: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-sky-500"
                      />
                    </div>

                    {/* TRỤ CỘT 2: Phân tách Diện tích Đa tầng */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                          {t("inbox.totalLeaseArea")}
                        </label>
                        <input
                          type="number"
                          value={formState.total_lease_area_m2}
                          onChange={(e) => setFormState({ ...formState, total_lease_area_m2: e.target.value })}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                          {t("inbox.floorArea")}
                        </label>
                        <input
                          type="number"
                          value={formState.floor_area_m2}
                          onChange={(e) => setFormState({ ...formState, floor_area_m2: e.target.value })}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                        />
                      </div>
                    </div>

                    {/* TRỤ CỘT 3: Hiện trạng bàn giao (Strict Handover Enum) */}
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        {t("inbox.handoverCondition")}
                      </label>
                      <select
                        value={formState.handover_condition}
                        onChange={(e) => setFormState({ ...formState, handover_condition: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-medium text-slate-800"
                      >
                        <option value="bare_shell">{t("inbox.handoverBareShell")}</option>
                        <option value="basic_unfurnished">{t("inbox.handoverBasicUnfurnished")}</option>
                        <option value="partially_furnished">{t("inbox.handoverPartiallyFurnished")}</option>
                        <option value="fully_furnished">{t("inbox.handoverFullyFurnished")}</option>
                      </select>
                    </div>

                    {/* Cụm Đơn giá chào & Cách tính giá */}
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                          <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                          {t("inbox.priceAmount")}
                        </span>
                        {formState.price_text && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200"
                            title={t("inbox.rawPriceSnippet")}
                          >
                            <Tag className="w-3 h-3" />
                            <span>
                              {t("inbox.rawPriceSnippet")}: <strong>{formState.price_text}</strong>
                            </span>
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <input
                            type="number"
                            step="any"
                            value={formState.price_amount}
                            onChange={(e) => setFormState({ ...formState, price_amount: e.target.value })}
                            placeholder={t("inbox.placeholderPrice")}
                            className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div>
                          <select
                            value={formState.price_currency}
                            onChange={(e) => setFormState({ ...formState, price_currency: e.target.value })}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-semibold text-slate-800"
                          >
                            <option value="VND">VND (₫)</option>
                            <option value="USD">USD ($)</option>
                          </select>
                        </div>
                      </div>

                      {/* Cơ sở tính giá & Kỳ hạn */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">
                            {t("inbox.priceBasis")}
                          </label>
                          <select
                            value={formState.price_basis}
                            onChange={(e) => setFormState({ ...formState, price_basis: e.target.value })}
                            className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white text-slate-700"
                          >
                            <option value="total">{t("inbox.priceBasisTotal")}</option>
                            <option value="per_m2">{t("inbox.priceBasisPerM2")}</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">
                            {t("inbox.pricePeriod")}
                          </label>
                          <select
                            value={formState.price_period}
                            onChange={(e) => setFormState({ ...formState, price_period: e.target.value })}
                            className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white text-slate-700"
                          >
                            <option value="month">{t("inbox.pricePeriodMonth")}</option>
                            <option value="year">{t("inbox.pricePeriodYear")}</option>
                            <option value="one_time">{t("inbox.pricePeriodOneTime")}</option>
                          </select>
                        </div>
                      </div>

                      {/* Dòng tính nháp ước tính nếu giá theo m2 */}
                      {estimatedTotalPrice !== null && (
                        <div className="mt-1 pt-1.5 border-t border-slate-200 flex items-center justify-between text-[11px] text-emerald-700 font-medium">
                          <span className="flex items-center gap-1">
                            <Calculator className="w-3.5 h-3.5" />
                            <span>{t("inbox.estimatedTotal")}:</span>
                          </span>
                          <span className="font-bold font-mono">
                            ≈ {formatPrice(estimatedTotalPrice, formState.price_currency, locale, "total", formState.price_period)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* TRỤ CỘT 4: Hoa hồng chuẩn hóa */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                          {t("inbox.landlordCommission")}
                        </label>
                        <input
                          type="text"
                          value={formState.landlord_commission_text}
                          onChange={(e) => setFormState({ ...formState, landlord_commission_text: e.target.value })}
                          placeholder={t("inbox.placeholderCommission")}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                          {t("inbox.ourShare")}
                        </label>
                        <input
                          type="text"
                          value={formState.our_share_text}
                          onChange={(e) => setFormState({ ...formState, our_share_text: e.target.value })}
                          placeholder={t("inbox.placeholderShare")}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                        />
                      </div>
                    </div>

                    {/* Đặc điểm Tiếng Việt */}
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        {t("inbox.detailsVi")}
                      </label>
                      <textarea
                        rows={2}
                        value={formState.details_vi}
                        onChange={(e) => setFormState({ ...formState, details_vi: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      />
                    </div>

                    {/* Đặc điểm Tiếng Trung */}
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        {t("inbox.detailsZh")}
                      </label>
                      <textarea
                        rows={2}
                        value={formState.details_zh}
                        onChange={(e) => setFormState({ ...formState, details_zh: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-sans"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-12 bg-white rounded-2xl border border-slate-200 text-slate-400">
              {t("inbox.selectPrompt")}
            </div>
          )}
        </div>
      </div>

      {/* TRỤ CỘT 5: MODAL XEM TRƯỚC GỘP & CẢNH BÁO XUNG ĐỘT ĐỊA LÝ */}
      {mergeModalSibling && selectedListing && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  {t("inbox.mergePreviewTitle")}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMergeModalSibling(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Cảnh báo nếu địa chỉ / tỉnh thành khác nhau */}
            {isAddressMismatch && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-800 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold uppercase">{t("inbox.mergeWarningDiffAddress")}</div>
                  <div className="mt-1 text-[11px] text-amber-700">
                    Nếu đây là 2 căn hộ / mặt bằng hoàn toàn độc lập, bạn hãy đóng hộp thoại này và duyệt chúng thành 2 căn riêng biệt vào kho.
                  </div>
                </div>
              </div>
            )}

            {/* Bảng so sánh 2 nguồn tin */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              {/* Căn chính (Target) */}
              <div className="p-4 rounded-xl border border-sky-200 bg-sky-50/50 space-y-2">
                <div className="font-bold text-sky-800 flex items-center gap-1.5 pb-1 border-b border-sky-200">
                  <span className="w-2 h-2 rounded-full bg-sky-600"></span>
                  <span>{t("inbox.targetListing")}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-semibold block">Địa chỉ:</span>
                  <div className="font-semibold text-slate-800">{selectedListing.address_text || "—"}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-semibold block">Tỉnh/TP:</span>
                  <div className="font-medium text-slate-700">{selectedListing.province || "—"}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-semibold block">Đoạn tin nhắn:</span>
                  <div className="text-[11px] text-slate-600 bg-white p-2 rounded border border-sky-100 max-h-32 overflow-y-auto font-mono">
                    {selectedListing.ai_extracted?.source_text_snippet || selectedListing.location_note || selectedListing.submission?.raw_text || "—"}
                  </div>
                </div>
              </div>

              {/* Nguồn bổ sung (Source) */}
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-2">
                <div className="font-bold text-amber-800 flex items-center gap-1.5 pb-1 border-b border-amber-200">
                  <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                  <span>{t("inbox.sourceListing")}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-semibold block">Địa chỉ:</span>
                  <div className="font-semibold text-slate-800">{mergeModalSibling.address_text || "—"}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-semibold block">Tỉnh/TP:</span>
                  <div className="font-medium text-slate-700">{mergeModalSibling.province || "—"}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-semibold block">Đoạn tin nhắn:</span>
                  <div className="text-[11px] text-slate-600 bg-white p-2 rounded border border-amber-100 max-h-32 overflow-y-auto font-mono">
                    {mergeModalSibling.ai_extracted?.source_text_snippet || mergeModalSibling.location_note || mergeModalSibling.submission?.raw_text || "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t">
              <button
                type="button"
                onClick={() => setMergeModalSibling(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
              >
                {t("inbox.cancel")}
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => executeMerge(mergeModalSibling.id)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitMerge className="w-3.5 h-3.5" />}
                <span>{t("inbox.confirmMergeBtn")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX PREVIEW MODAL */}
      {activeLightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm cursor-pointer"
          onClick={() => setActiveLightboxImg(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl p-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setActiveLightboxImg(null)}
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black cursor-pointer font-bold"
            >
              ✕
            </button>
            <img
              src={activeLightboxImg}
              alt="Lightbox Zoom"
              className="max-h-[80vh] w-auto mx-auto object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
