import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserProfile } from "@/app/auth/actions";
import { StaffManagement } from "@/components/StaffManagement";
import { getKeyPoolStatus } from "@/lib/ai/key-manager";
import { Sliders, Bot, Clock, ShieldCheck, Database, Key, AlertTriangle, CheckCircle2, RotateCw } from "lucide-react";

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
    model: "gemini-flash-latest",
    auto_reply: true,
  };

  const keyPool = getKeyPoolStatus();

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

      {/* 3. Cấu hình AI Parser & Multi-Key Pool */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2.5">
            <Bot className="w-5 h-5 text-emerald-600" />
            <h2 className="font-bold text-slate-900 text-sm">
              Trí tuệ nhân tạo AI (Google Gemini 3.x Multi-Key Pool)
            </h2>
          </div>
          <span className="px-2.5 py-1 rounded-full font-bold text-[11px] bg-emerald-100 text-emerald-800">
            {keyPool.activeKeys}/{keyPool.totalKeys} Key hoạt động
          </span>
        </div>

        <div className="space-y-4 text-xs">
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-800">Mô hình AI: </span>
                <span className="font-mono font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                  {process.env.GEMINI_MODEL || "gemini-flash-latest"}
                </span>
              </div>
              <span className="text-[11px] text-slate-400">Tự động Fallback 3.x khi quá tải</span>
            </div>
            <div className="text-[11px] text-slate-500">
              Chuỗi tự động chuyển đổi: <code>gemini-flash-latest</code> &rarr; <code>gemini-3.8-flash</code> &rarr; <code>gemini-3.5-flash</code> &rarr; <code>gemini-3.5-flash-lite</code>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-semibold text-slate-700 block text-xs">
                Danh sách Pool API Key ({keyPool.totalKeys} khóa)
              </label>
              <span className="text-[10px] text-slate-400">
                Cấu hình qua GEMINI_API_KEYS trên Vercel / .env.local
              </span>
            </div>

            <div className="space-y-2">
              {keyPool.details.map((k, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-slate-200 shadow-xs"
                >
                  <div className="flex items-center gap-2">
                    <Key className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-mono text-xs text-slate-700 font-semibold">{k.maskedKey}</span>
                    <span className="text-[10px] text-slate-400">
                      ({k.successCount} thành công / {k.failCount} lỗi)
                    </span>
                  </div>
                  <div>
                    {k.status === "active" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Sẵn sàng
                      </span>
                    ) : k.status === "cooling_down" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                        <RotateCw className="w-3 h-3 text-amber-600 animate-spin" />
                        Tạm nghỉ ({k.cooldownSecondsRemaining}s)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                        Khóa lỗi
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-slate-400 mt-2">
              💡 <strong>Mẹo tối ưu chi phí:</strong> Bạn có thể tạo nhiều tài khoản Google AI Studio miễn phí và thêm các key vào biến <code>GEMINI_API_KEYS=&quot;key1,key2,key3&quot;</code> trên Vercel. Khi một key chạm hạn mức (429), hệ thống sẽ tự động xoay tua sang key kế tiếp ngay lập tức!
            </p>
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
