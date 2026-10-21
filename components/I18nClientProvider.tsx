"use client";

import React, { createContext, useContext, useState } from "react";
import { NextIntlClientProvider } from "next-intl";

interface I18nContextType {
  locale: string;
  setLocale: (newLocale: string) => void;
}

const I18nContext = createContext<I18nContextType>({
  locale: "vi",
  setLocale: () => {},
});

export function useAppLocale() {
  return useContext(I18nContext);
}

export function I18nClientProvider({
  initialLocale,
  allMessages,
  children,
}: {
  initialLocale: string;
  allMessages: Record<string, any>;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState(initialLocale);

  const setLocale = (newLocale: string) => {
    // 1. Cập nhật state tức thì trong React (0ms) -> Toàn bộ UI đổi ngôn ngữ ngay lập tức!
    setLocaleState(newLocale);
    if (typeof document !== "undefined") {
      document.documentElement.lang = newLocale;
      // 2. Ghi cookie ngầm để các request server kế tiếp ghi nhận đúng ngôn ngữ
      document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    }
  };

  const activeMessages =
    allMessages[locale] || allMessages[initialLocale] || allMessages["vi"] || {};

  return (
    <I18nContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider locale={locale} messages={activeMessages}>
        {children}
      </NextIntlClientProvider>
    </I18nContext.Provider>
  );
}
