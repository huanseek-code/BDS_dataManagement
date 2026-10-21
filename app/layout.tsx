import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { I18nClientProvider } from "@/components/I18nClientProvider";
import { Navbar } from "@/components/Navbar";
import { getCurrentUserProfile } from "@/app/auth/actions";
import viMessages from "@/messages/vi.json";
import enMessages from "@/messages/en.json";
import zhMessages from "@/messages/zh.json";
import "./globals.css";

const allMessages = {
  vi: viMessages,
  en: enMessages,
  zh: zhMessages,
};

export const metadata: Metadata = {
  title: "Huanseek Real Estate - Quản lý Dữ liệu BĐS",
  description: "Hệ thống tiếp nhận, trích xuất và quản lý nguồn BĐS đối tác Zalo OA",
  other: {
    "zalo-platform-site-verification": "VVonEuAAFmm7Xh0psQSd3HcmzJlrnYvcC3aq",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const profile = await getCurrentUserProfile();

  return (
    <html lang={locale} className="h-full">
      <head>
        <meta name="zalo-platform-site-verification" content="VVonEuAAFmm7Xh0psQSd3HcmzJlrnYvcC3aq" />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <I18nClientProvider initialLocale={locale} allMessages={allMessages}>
          {profile && <Navbar currentUser={profile} />}
          <main className={profile ? "flex-1 w-full max-w-[1720px] mx-auto px-4 sm:px-6 py-6" : "flex-1 w-full"}>
            {children}
          </main>
        </I18nClientProvider>
      </body>
    </html>
  );
}
