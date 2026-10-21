"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  Building2,
  Inbox,
  Users,
  Settings,
  Globe,
  Download,
  LogOut,
  Shield,
  User as UserIcon,
} from "lucide-react";
import { logout } from "@/app/auth/actions";

export function Navbar({
  pendingCount = 0,
  currentUser,
}: {
  pendingCount?: number;
  currentUser?: {
    id: string;
    email: string;
    full_name: string;
    role: "admin" | "staff" | string;
  } | null;
}) {
  const t = useTranslations();
  const currentLocale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const handleLanguageChange = (newLocale: string) => {
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  };

  const navItems = [
    {
      href: "/inbox",
      label: t("nav.inbox"),
      icon: Inbox,
      badge: pendingCount > 0 ? pendingCount : null,
    },
    {
      href: "/properties",
      label: t("nav.properties"),
      icon: Building2,
    },
    {
      href: "/partners",
      label: t("nav.partners"),
      icon: Users,
    },
    ...(currentUser?.role === "admin"
      ? [
          {
            href: "/settings",
            label: t("nav.settings"),
            icon: Settings,
          },
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-50 w-full bg-[#0b1f3a] text-white shadow-md border-b border-slate-800">
      <div className="max-w-[1720px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-8">
          <Link
            href="/inbox"
            className="flex items-center gap-2.5 font-bold text-lg tracking-tight hover:opacity-90 transition"
          >
            <div className="w-9 h-9 rounded-lg bg-sky-500 flex items-center justify-center text-white shadow-sm font-extrabold text-xl">
              H
            </div>
            <div>
              <div className="leading-tight text-white font-semibold">Huanseek</div>
              <div className="text-[11px] text-sky-300 font-normal tracking-wider uppercase">
                Real Estate Admin
              </div>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium transition ${
                    isActive
                      ? "bg-sky-600/30 text-sky-200 border border-sky-400/30 shadow-inner"
                      : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {item.badge !== null && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500 text-slate-950">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Section: Language Switcher, User Profile & Actions */}
        <div className="flex items-center gap-3">
          {/* Quick Export Excel */}
          <Link
            href="/api/export/properties"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t("common.exportExcel")}</span>
          </Link>

          {/* Language Switcher */}
          <div className="flex items-center bg-slate-800/80 rounded-lg p-1 border border-slate-700/80 text-xs">
            <Globe className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-1" />
            {[
              { code: "vi", label: "VI" },
              { code: "en", label: "EN" },
              { code: "zh", label: "中文" },
            ].map((lang) => {
              const isSelected = currentLocale === lang.code;
              return (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`px-2 py-1 rounded font-medium transition cursor-pointer ${
                    isSelected
                      ? "bg-sky-500 text-white shadow-sm font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {lang.label}
                </button>
              );
            })}
          </div>

          {/* User Profile Badge & Logout */}
          {currentUser && (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-700/80">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-slate-200 leading-tight">
                  {currentUser.full_name}
                </div>
                <div className="text-[10px] text-slate-400 flex items-center justify-end gap-1">
                  {currentUser.role === "admin" ? (
                    <span className="text-amber-400 font-bold flex items-center gap-0.5">
                      <Shield className="w-2.5 h-2.5" /> {t("common.adminRole")}
                    </span>
                  ) : (
                    <span className="text-sky-300 font-medium">{t("common.staffRole")}</span>
                  )}
                </div>
              </div>

              <form action={logout}>
                <button
                  type="submit"
                  title={t("common.logout")}
                  className="p-2 rounded-lg bg-slate-800/80 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 border border-slate-700/80 transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
