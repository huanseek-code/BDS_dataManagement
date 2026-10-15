import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserProfile } from "@/app/auth/actions";
import { StaffManagement } from "@/components/StaffManagement";
import { Sliders, Bot, Clock, ShieldCheck, Database, Key, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const currentProfile = await getCurrentUserProfile();

  if (!currentProfile || currentProfile.role !== "admin") {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">
          Khu vực dành riêng cho Quản trị viên (Sếp)
        </h1>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          Tài khoản của bạn là <strong>Nhân viên</strong>, có toàn quyền khai thác, xử lý dữ liệu và duyệt nguồn BĐS. Bạn không thể can thiệp cài đặt kỹ thuật và quản lý nhân sự.
        </p>
      </div>
    );
  }

  const supabase = createAdminClient();
  const { data: settings } = await supabase.from("app_settings").select("*");

  const batchingSetting = settings?.find((s) => s.key === "batching")?.value as any || {
    idle_minutes: 3,
    max_window_minutes: 20,
    max_messages: 40,
    max_attachments: 30,
    keyword_delay_seconds: 20,
  };

  const aiSetting = settings?.find((s) => s.key === "ai")?.value as any || {
    enabled: true,
    model: "gemini-3.1-flash-lite",
    auto_reply: true,
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Cài đặt Quản trị & Hệ thống
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Quản lý nhân viên công ty, cấu hình thuật toán gom tin và mô hình trí tuệ nhân tạo AI
        </p>
      </div>

      {/* 1. Quản lý Nhân sự & Phân quyền (Sếp toàn quyền) */}
      <StaffManagement currentUserId={currentProfile.id} />

      {/* 2. Cấu hình Gom tin (Debounce Logic) */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 border-b pb-3">
          <Clock className="w-5 h-5 text-sky-600" />
          <h2 className="font-bold text-slate-900 text-sm">
            Thuật toán Gom tin tự động (Debounce & Batching)
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">
              Thời gian khoảng lặng (Idle Timeout)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                defaultValue={batchingSetting.idle_minutes}
                className="w-24 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
              />
              <span className="text-slate-500">phút không có tin mới</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Sau khoảng thời gian này kể từ tin nhắn cuối, phiên sẽ tự động chốt vào hàng chờ
            </p>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">
              Khung thời gian tối đa (Max Window)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                defaultValue={batchingSetting.max_window_minutes}
                className="w-24 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
              />
              <span className="text-slate-500">phút từ tin đầu tiên</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Nếu đối tác gửi liên tục quá thời gian này, hệ thống sẽ tự cắt cụm để xử lý
            </p>
          </div>
        </div>
      </div>

      {/* 3. Cấu hình AI Parser */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 border-b pb-3">
          <Bot className="w-5 h-5 text-emerald-600" />
          <h2 className="font-bold text-slate-900 text-sm">
            Trí tuệ nhân tạo AI (Google Gemini Parser)
          </h2>
        </div>

        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div>
              <div className="font-semibold text-slate-800">Kích hoạt AI bóc tách tự động</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                AI đang sử dụng model tối ưu: <strong>gemini-3.1-flash-lite</strong>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full font-bold text-xs bg-emerald-100 text-emerald-800">
              Đang hoạt động
            </span>
          </div>
        </div>
      </div>

      {/* 4. Trạng thái Kết nối Supabase & Database */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 border-b pb-3">
          <Database className="w-5 h-5 text-indigo-600" />
          <h2 className="font-bold text-slate-900 text-sm">
            Cơ sở Dữ liệu & Kết nối Cloud
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-slate-400 text-[11px]">Supabase Project</div>
            <div className="font-semibold text-slate-800 mt-0.5 font-mono">
              evszersijnxuhniwozcd (Singapore)
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-slate-400 text-[11px]">PostgreSQL Engine</div>
            <div className="font-semibold text-slate-800 mt-0.5">
              Version 17 GA • pg_trgm • RLS Active
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
