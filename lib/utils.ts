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
 * Định dạng số tiền VND/USD/CNY theo ngôn ngữ hiển thị và cơ sở tính giá (theo m2 hoặc trọn gói)
 */
export function formatPrice(
  amount: number | null,
  currency: string = "VND",
  locale: string = "vi",
  priceBasis?: string | null,
  pricePeriod?: string | null
): string {
  if (amount === null || amount === undefined || isNaN(amount)) return "—";

  let baseFormatted = "";

  if (currency === "VND") {
    // Nếu là giá theo m2 (VD: 85.000 đ/m2), hiển thị rõ số nghìn thay vì viết tắt
    if (priceBasis === "per_m2" && amount < 1_000_000) {
      baseFormatted = new Intl.NumberFormat(locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "vi-VN").format(amount) + " ₫";
    } else if (amount >= 1_000_000_000) {
      const billions = amount / 1_000_000_000;
      baseFormatted = locale === "zh"
        ? `${billions.toFixed(2)} 十亿 ₫`
        : `${billions.toFixed(2)} tỷ`;
    } else if (amount >= 1_000_000) {
      const millions = amount / 1_000_000;
      baseFormatted = locale === "zh"
        ? `${millions.toFixed(1)} 百万 ₫`
        : `${millions.toFixed(1)} tr`;
    } else {
      baseFormatted = new Intl.NumberFormat(locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "vi-VN").format(amount) + " ₫";
    }
  } else {
    baseFormatted = new Intl.NumberFormat(locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "vi-VN", {
      style: "currency",
      currency: currency,
    }).format(amount);
  }

  // Thêm hậu tố theo m2 và chu kỳ
  let suffix = "";
  if (priceBasis === "per_m2") {
    suffix += locale === "zh" ? "/㎡" : "/m²";
  }

  const periodNormalized = pricePeriod === "monthly" ? "month" : pricePeriod;
  if (periodNormalized === "month") {
    suffix += locale === "zh" ? "/月" : locale === "en" ? "/month" : "/tháng";
  } else if (periodNormalized === "year") {
    suffix += locale === "zh" ? "/年" : locale === "en" ? "/year" : "/năm";
  }

  return `${baseFormatted}${suffix}`;
}
