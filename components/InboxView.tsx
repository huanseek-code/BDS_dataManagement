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
} from "lucide-react";
import { formatPrice } from "@/lib/utils";

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
  const [formState, setFormState] = useState<any>(
    initialListings[0] ? extractFormData(initialListings[0]) : null
  );

  function extractFormData(listing: any) {
    return {
      province: listing.province || "",
      address_text: listing.address_text || "",
      property_types: (Array.isArray(listing.property_types) && listing.property_types.length > 0)
        ? listing.property_types
        : ["townhouse"],
      total_lease_area_m2: listing.total_lease_area_m2 || "",
      floor_area_m2: listing.floor_area_m2 || "",
      price_amount: listing.price_amount || "",
      price_currency: listing.price_currency || "VND",
      price_period: listing.price_period === "monthly" ? "month" : (listing.price_period || "month"),
      price_basis: listing.price_basis || "total",
      price_text: listing.price_text || listing.ai_extracted?.price_text || "",
      landlord_commission_text: listing.landlord_commission_text || "",
      our_share_text: listing.our_share_text || "",
      details_vi: listing.key_details?.vi || "",
      details_zh: listing.key_details?.zh || "",
      details_en: listing.key_details?.en || "",
    };
  }

  const handleSelect = (listing: any) => {
    setSelectedListing(listing);
    setFormState(extractFormData(listing));
  };

  const handleApprove = async () => {
    if (!selectedListing) return;
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
            key_details: {
              vi: formState.details_vi,
              zh: formState.details_zh,
              en: formState.details_en,
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

  const handleMerge = async (sourceId: string) => {
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

  // Tính ước tính tổng tiền nếu là giá theo m2
  const estimatedTotalPrice =
    formState &&
    formState.price_basis === "per_m2" &&
    formState.price_amount &&
    formState.total_lease_area_m2
      ? Number(formState.price_amount) * Number(formState.total_lease_area_m2)
      : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left List of Listings (4 cols) */}
      <div className="lg:col-span-4 space-y-3">
        <div className="flex items-center justify-between pb-1">
          <h2 className="font-bold text-slate-900 text-sm">
            {t("inbox.title")} ({listings.length})
          </h2>
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
                      <User className="w-3.5 h-3.5 text-sky-600" />
                      <span>{item.partner?.display_name || t("inbox.partnerZalo")}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(item.created_at).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  {/* Dữ liệu địa chỉ giữ nguyên gốc */}
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
                {listings.filter(
                  (l) => l.id !== selectedListing.id && l.partner_id === selectedListing.partner_id
                ).length > 0 && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      const sibling = listings.find(
                        (l) => l.id !== selectedListing.id && l.partner_id === selectedListing.partner_id
                      );
                      if (sibling) handleMerge(sibling.id);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow transition cursor-pointer disabled:opacity-50"
                    title={t("inbox.mergePrompt")}
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    <span>{t("inbox.merge")}</span>
                  </button>
                )}
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
              {/* Left Column: Nguyên văn tin nhắn gốc (100% RAW) */}
              <div className="space-y-3">
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

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed font-mono whitespace-pre-wrap min-h-[420px] max-h-[620px] overflow-y-auto shadow-inner space-y-3">
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

                <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-white max-h-[620px] overflow-y-auto shadow-sm">
                  {/* Tỉnh / TP */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      {t("inbox.province")}
                    </label>
                    <input
                      type="text"
                      value={formState.province}
                      onChange={(e) => setFormState({ ...formState, province: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  {/* Địa chỉ / Vị trí (Giữ nguyên gốc tiếng Việt) */}
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

                  {/* Diện tích */}
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

                  {/* Cụm Đơn giá chào & Cách tính giá */}
                  <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                        {t("inbox.priceAmount")}
                      </span>
                      {formState.price_text && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200" title={t("inbox.rawPriceSnippet")}>
                          <Tag className="w-3 h-3" />
                          <span>{t("inbox.rawPriceSnippet")}: <strong>{formState.price_text}</strong></span>
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

                  {/* Hoa hồng */}
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

                  {/* Đặc điểm Tiếng Trung (Cột duy nhất có tiếng Trung) */}
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
  );
}
