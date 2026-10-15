"use client";

import { useState } from "react";
import { login } from "@/app/auth/actions";
import { Building2, Lock, Mail, ArrowRight, Loader2, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await login(formData);

    if (result?.error) {
      setError(result.error);
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#071324] via-[#0b1f3a] to-[#0f2d52] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-500 text-white font-extrabold text-2xl shadow-lg shadow-sky-500/30 mb-3">
            H
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Huanseek Real Estate
          </h1>
          <p className="text-xs text-sky-300/80 mt-1 uppercase tracking-wider font-medium">
            Hệ thống Quản lý Dữ liệu Nguồn BĐS
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 p-8 space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900">
              Đăng nhập hệ thống
            </h2>
            <p className="text-xs text-slate-500">
              Vui lòng nhập tài khoản được cấp để truy cập dữ liệu
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Email tài khoản
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  name="email"
                  required
                  defaultValue="admin@huanseek.com"
                  placeholder="admin@huanseek.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition bg-slate-50 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Mật khẩu
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  name="password"
                  required
                  defaultValue="Admin@123456"
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition bg-slate-50 focus:bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm shadow-md shadow-sky-600/30 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang xác thực...</span>
                </>
              ) : (
                <>
                  <span>Đăng nhập</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Info Box */}
          <div className="pt-4 border-t border-slate-100 flex items-start gap-2.5 text-[11px] text-slate-400 leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-sky-600 flex-shrink-0 mt-0.5" />
            <div>
              Hệ thống phân quyền 2 cấp: <strong>Admin (Sếp)</strong> quản lý nhân sự & cấu hình; <strong>Nhân viên</strong> trực tiếp tiếp nhận và duyệt nguồn BĐS.
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-sky-200/50 mt-6">
          © 2026 Huanseek Real Estate. Bảo mật dữ liệu nội bộ.
        </p>
      </div>
    </div>
  );
}
