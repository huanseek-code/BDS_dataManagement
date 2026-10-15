import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Chuẩn hoá chuỗi tiếng Việt thành key không dấu, viết thường, loại bỏ ký tự đặc biệt
 * Ví dụ: "Đường Nguyễn Văn Trỗi, Q. Phú Nhuận" -> "nguyen van troi"
 */
export function normalizeVietnameseKey(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Định dạng số tiền VND/USD/CNY theo ngôn ngữ hiển thị
 */
export function formatPrice(amount: number | null, currency: string = "VND", locale: string = "vi"): string {
  if (amount === null || amount === undefined || isNaN(amount)) return "—";

  if (currency === "VND") {
    if (amount >= 1_000_000_000) {
      const billions = amount / 1_000_000_000;
      return locale === "zh"
        ? `${billions.toFixed(2)} 十亿 ₫`
        : `${billions.toFixed(2)} tỷ`;
    }
    if (amount >= 1_000_000) {
      const millions = amount / 1_000_000;
      return locale === "zh"
        ? `${millions.toFixed(1)} 百万 ₫`
        : `${millions.toFixed(1)} tr`;
    }
    return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "vi-VN").format(amount) + " ₫";
  }

  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "vi-VN", {
    style: "currency",
    currency: currency,
  }).format(amount);
}
