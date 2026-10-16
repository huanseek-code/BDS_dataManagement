"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
} from "lucide-react";

export function InboxView({
  initialListings,
}: {
  initialListings: any[];
}) {
  const t = useTranslations();
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
      property_types: (Array.isArray(listing.property_types) && listing.property_types.length > 0) ? listing.property_types : ["townhouse"],
      total_lease_area_m2: listing.total_lease_area_m2 || "",
      floor_area_m2: listing.floor_area_m2 || "",
      price_amount: listing.price_amount || "",
      price_currency: listing.price_currency || "VND",
      price_period: listing.price_period === "monthly" ? "month" : (listing.price_period || "month"),
      price_basis: listing.price_basis || "total",
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
        alert("Lỗi khi duyệt: " + (data.error || "Không thể duyệt"));
        return;
      }

      alert("Đã duyệt BĐS thành công vào Kho BĐS!");
      const nextList = listings.filter((l) => l.id !== selectedListing.id);
      setListings(nextList);
      setSelectedListing(nextList[0] || null);
      if (nextList[0]) setFormState(extractFormData(nextList[0]));
      router.refresh();
    } catch (err: any) {
      alert("Lỗi: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedListing) return;
    if (!confirm("Bạn có chắc muốn từ chối nguồn BĐS này?")) return;
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
        alert("Lỗi khi từ chối");
        return;
      }

      const nextList = listings.filter((l) => l.id !== selectedListing.id);
      setListings(nextList);
      setSelectedListing(nextList[0] || null);
      if (nextList[0]) setFormState(extractFormData(nextList[0]));
      router.refresh();
    } catch (err: any) {
      alert("Lỗi: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMerge = async (sourceId: string) => {
    if (!selectedListing || !sourceId) return;
    if (!confirm("Bạn có chắc muốn dùng AI gộp 2 tin nhắn này của đối tác làm một?")) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/inbox/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetListingId: selectedListing.id,
          sourceListingId: sourceId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert("Lỗi khi gộp: " + (data.error || "Không thể gộp"));
        return;
      }

      alert("🎉 Đã dùng AI gộp 2 tin thành 1 căn BĐS hoàn chỉnh!");
      const updatedList = listings
        .filter((l) => l.id !== sourceId)
        .map((l) => (l.id === selectedListing.id ? { ...l, ...data.updatedListing } : l));
      setListings(updatedList);
      const newSelected = updatedList.find((l) => l.id === selectedListing.id) || updatedList[0];
      setSelectedListing(newSelected);
      if (newSelected) setFormState(extractFormData(newSelected));
      router.refresh();
    } catch (err: any) {
      alert("Lỗi: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left List of Listings (4 cols) */}
      <div className="lg:col-span-4 space-y-3">
        <div className="flex items-center justify-between pb-1">
          <h2 className="font-bold text-slate-900 text-sm">
            Danh sách chờ duyệt ({listings.length})
          </h2>
        </div>

        <div className="space-y-2.5 max-h-[780px] overflow-y-auto pr-1">
          {listings.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <div className="text-sm font-medium">Hộp thư trống</div>
              <div className="text-xs text-slate-400 mt-0.5">Tất cả nguồn đã được duyệt</div>
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
                      <span>{item.partner?.display_name || "Đối tác Zalo"}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(item.created_at).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

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
                      Chờ duyệt
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
                    {selectedListing.partner?.display_name || "Đối tác Zalo"}
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-100 text-sky-800 font-mono">
                    Zalo ID: {selectedListing.partner?.zalo_user_id}
                  </span>
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    Nhận lúc: {new Date(selectedListing.created_at).toLocaleString("vi-VN")}
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
                    title="Gộp dữ liệu với tin nhắn khác của đối tác này bằng AI"
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    <span>Gộp tin đối tác</span>
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
                  <span>Duyệt đưa vào Kho BĐS</span>
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleReject}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Từ chối</span>
                </button>
              </div>
            </div>

            {/* Split Screen Diff: Left Original Text vs Right Structured Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Nguyên văn tin nhắn gốc */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                    <FileText className="w-4 h-4 text-sky-600" />
                    <span>Tin nhắn gốc từ Zalo OA</span>
                  </div>
                  {selectedListing.submission?.raw_text && (
                    <button
                      type="button"
                      onClick={() => setShowFullChat(!showFullChat)}
                      className="text-[10px] text-sky-600 hover:text-sky-800 underline font-medium cursor-pointer"
                    >
                      {showFullChat ? "Thu gọn (Chỉ xem căn này)" : "Xem toàn bộ phiên chat"}
                    </button>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed font-mono whitespace-pre-wrap min-h-[380px] max-h-[580px] overflow-y-auto shadow-inner space-y-3">
                  {showFullChat ? (
                    <div>
                      <div className="text-[11px] font-bold text-slate-500 mb-2 pb-1 border-b border-slate-200">
                        --- TOÀN BỘ CÁC TIN NHẮN TRONG PHIÊN CHAT ({selectedListing.submission?.msg_count || 1} tin) ---
                      </div>
                      {selectedListing.submission?.raw_text || "(Không có nội dung text)"}
                    </div>
                  ) : (
                    <div>
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-700 mb-2">
                        <span>Đoạn tin nhắn ứng với căn BĐS này</span>
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
                              Lịch sử tin nhắn bồi đắp ({selectedListing.change_history.length} tin):
                            </div>
                            {selectedListing.change_history.map((h: any, idx: number) => (
                              <div
                                key={idx}
                                className="p-2 rounded bg-white border border-slate-200 text-[11px] text-slate-600"
                              >
                                <span className="text-[9px] text-slate-400 font-mono block">
                                  {h.created_at
                                    ? `Tin tạo: ${new Date(h.created_at).toLocaleTimeString("vi-VN")}`
                                    : `Tin bồi đắp: ${new Date(h.appended_at).toLocaleTimeString("vi-VN")}`}
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
                    <span>Dữ liệu AI đã chuẩn hóa</span>
                  </div>
                  <span className="text-[10px] text-slate-400">(Có thể chỉnh sửa trước khi duyệt)</span>
                </div>

                <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-white max-h-[580px] overflow-y-auto shadow-sm">
                  {/* Tỉnh / TP */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Tỉnh / Thành phố
                    </label>
                    <input
                      type="text"
                      value={formState.province}
                      onChange={(e) => setFormState({ ...formState, province: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  {/* Địa chỉ / Vị trí */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Địa chỉ / Vị trí
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
                        Tổng DT cho thuê (m²)
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
                        DT 1 tầng (m²)
                      </label>
                      <input
                        type="number"
                        value={formState.floor_area_m2}
                        onChange={(e) => setFormState({ ...formState, floor_area_m2: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      />
                    </div>
                  </div>

                  {/* Giá chào */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Đơn giá chào
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={formState.price_amount}
                        onChange={(e) => setFormState({ ...formState, price_amount: e.target.value })}
                        placeholder="VD: 4.8"
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Tiền tệ
                      </label>
                      <select
                        value={formState.price_currency}
                        onChange={(e) => setFormState({ ...formState, price_currency: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      >
                        <option value="USD">USD</option>
                        <option value="VND">VND</option>
                      </select>
                    </div>
                  </div>

                  {/* Hoa hồng */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Hoa hồng chủ nhà
                      </label>
                      <input
                        type="text"
                        value={formState.landlord_commission_text}
                        onChange={(e) => setFormState({ ...formState, landlord_commission_text: e.target.value })}
                        placeholder="VD: 1 tháng"
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Phần chia đối tác
                      </label>
                      <input
                        type="text"
                        value={formState.our_share_text}
                        onChange={(e) => setFormState({ ...formState, our_share_text: e.target.value })}
                        placeholder="VD: 50%"
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      />
                    </div>
                  </div>

                  {/* Đặc điểm Tiếng Việt */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Đặc điểm chính (Tiếng Việt)
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
                      Đặc điểm chính (Tiếng Trung - 中文)
                    </label>
                    <textarea
                      rows={2}
                      value={formState.details_zh}
                      onChange={(e) => setFormState({ ...formState, details_zh: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center p-12 bg-white rounded-2xl border border-slate-200 text-slate-400">
            Chọn một tin nhắn bên trái để xem đối chiếu
          </div>
        )}
      </div>
    </div>
  );
}
