import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getLocale } from "next-intl/server";
import { Navbar } from "@/components/Navbar";
import { getCurrentUserProfile } from "@/app/auth/actions";
import "./globals.css";

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
  const messages = await getMessages();
  const profile = await getCurrentUserProfile();

  return (
    <html lang={locale} className="h-full">
      <head>
        <meta name="zalo-platform-site-verification" content="VVonEuAAFmm7Xh0psQSd3HcmzJlrnYvcC3aq" />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <NextIntlClientProvider messages={messages} locale={locale}>
          {profile && <Navbar currentUser={profile} />}
          <main className={profile ? "flex-1 w-full max-w-[1720px] mx-auto px-4 sm:px-6 py-6" : "flex-1 w-full"}>
            {children}
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
