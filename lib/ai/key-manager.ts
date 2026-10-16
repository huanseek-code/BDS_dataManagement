import { GoogleGenAI } from "@google/genai";

export interface KeyHealth {
  status: "active" | "cooling_down" | "invalid";
  cooldownUntil: number;
  failCount: number;
  successCount: number;
  lastError?: string;
}

// In-memory health map across invocations within the node process
const keyHealthMap = new Map<string, KeyHealth>();
let currentKeyIndex = 0;

/**
 * Lấy danh sách toàn bộ Gemini API Keys được cấu hình từ biến môi trường
 * Hỗ trợ GEMINI_API_KEYS (phân tách bởi dấu phẩy, chấm phẩy hoặc xuống dòng)
 * và GEMINI_API_KEY (tương thích ngược cho 1 key đơn)
 */
export function getGeminiApiKeys(): string[] {
  const rawMultiKeys = process.env.GEMINI_API_KEYS || "";
  const singleKey = process.env.GEMINI_API_KEY || "";

  const keysFromMulti = rawMultiKeys
    .split(/[,\n;]/)
    .map((k) => k.trim())
    .filter((k) => k.length > 5);

  const combined = [...keysFromMulti];
  if (singleKey && singleKey.trim().length > 5 && !combined.includes(singleKey.trim())) {
    combined.push(singleKey.trim());
  }

  // Khởi tạo trạng thái cho key mới phát hiện
  for (const k of combined) {
    if (!keyHealthMap.has(k)) {
      keyHealthMap.set(k, {
        status: "active",
        cooldownUntil: 0,
        failCount: 0,
        successCount: 0,
      });
    }
  }

  return combined;
}

/**
 * Mặt nạ bảo mật để in log an toàn (VD: AIzaSy...4pbQ)
 */
export function maskApiKey(key: string): string {
  if (!key || key.length < 10) return "***";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

/**
 * Lấy báo cáo chi tiết về tình trạng của toàn bộ Pool Key (dùng cho UI / Dashboard)
 */
export function getKeyPoolStatus() {
  const keys = getGeminiApiKeys();
  const now = Date.now();

  const details = keys.map((key) => {
    const health = keyHealthMap.get(key) || {
      status: "active",
      cooldownUntil: 0,
      failCount: 0,
      successCount: 0,
    };

    let effectiveStatus = health.status;
    let secondsLeft = 0;

    if (health.cooldownUntil > now) {
      effectiveStatus = health.status === "invalid" ? "invalid" : "cooling_down";
      secondsLeft = Math.ceil((health.cooldownUntil - now) / 1000);
    } else if (health.status === "cooling_down") {
      effectiveStatus = "active";
    }

    return {
      maskedKey: maskApiKey(key),
      status: effectiveStatus,
      cooldownSecondsRemaining: secondsLeft,
      failCount: health.failCount,
      successCount: health.successCount,
      lastError: health.lastError,
    };
  });

  const activeCount = details.filter((d) => d.status === "active").length;

  return {
    totalKeys: keys.length,
    activeKeys: activeCount,
    coolingDownKeys: details.filter((d) => d.status === "cooling_down").length,
    invalidKeys: details.filter((d) => d.status === "invalid").length,
    details,
  };
}

/**
 * Danh sách các Model Gemini 3.x ưu tiên theo thứ tự hiện đại nhất (Hoàn toàn loại bỏ 2.5)
 */
export const GEMINI_3X_MODELS = Array.from(
  new Set([
    process.env.GEMINI_MODEL || "gemini-flash-latest",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.1-flash-lite",
  ])
).filter(Boolean);

/**
 * Thực thi gọi Gemini API với cơ chế Xoay tua Đa Key & Thử lại Model Fallback
 */
export async function executeWithKeyRotation<T>(
  action: (ai: GoogleGenAI, apiKey: string, modelId: string) => Promise<T>
): Promise<T> {
  const allKeys = getGeminiApiKeys();
  if (allKeys.length === 0) {
    throw new Error("Chưa có GEMINI_API_KEY hoặc GEMINI_API_KEYS nào được cấu hình.");
  }

  const now = Date.now();

  // Reset các key đã hết thời gian cooldown
  for (const k of allKeys) {
    const h = keyHealthMap.get(k);
    if (h && h.cooldownUntil <= now && h.status === "cooling_down") {
      h.status = "active";
    }
  }

  // Sắp xếp các key ưu tiên: Active trước, sau đó là key sắp hết hạn cooldown
  const availableKeys = allKeys.filter((k) => {
    const h = keyHealthMap.get(k);
    return !h || h.status === "active" || h.cooldownUntil <= now;
  });

  const candidateKeys = availableKeys.length > 0 ? availableKeys : allKeys;

  let lastError: any = null;

  // Thử lần lượt từng key trong pool (bắt đầu từ vị trí vòng tròn hiện tại)
  for (let attempt = 0; attempt < candidateKeys.length; attempt++) {
    const selectedKey = candidateKeys[(currentKeyIndex + attempt) % candidateKeys.length];
    const masked = maskApiKey(selectedKey);
    const health = keyHealthMap.get(selectedKey) || {
      status: "active",
      cooldownUntil: 0,
      failCount: 0,
      successCount: 0,
    };

    const ai = new GoogleGenAI({ apiKey: selectedKey });

    // Thử qua chuỗi Model Gemini 3.x
    for (const modelToTry of GEMINI_3X_MODELS) {
      try {
        const result = await action(ai, selectedKey, modelToTry);

        // Thành công: ghi nhận trạng thái tích cực
        health.status = "active";
        health.successCount++;
        health.failCount = 0;
        keyHealthMap.set(selectedKey, health);

        // Chuyển vòng tròn sang key tiếp theo cho lần gọi sau (Round-Robin cân bằng tải)
        currentKeyIndex = (currentKeyIndex + 1) % candidateKeys.length;
        return result;
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || "");
        const status = err?.status || err?.code;

        const isQuotaOrRateLimit =
          status === 429 ||
          msg.includes("429") ||
          msg.includes("RESOURCE_EXHAUSTED") ||
          msg.includes("quota") ||
          msg.includes("rate limit");

        const isInvalidKey =
          status === 403 ||
          msg.includes("API key not valid") ||
          msg.includes("PERMISSION_DENIED");

        const isModelDemandSpike =
          status === 503 ||
          msg.includes("503") ||
          msg.includes("high demand") ||
          msg.includes("UNAVAILABLE");

        if (isQuotaOrRateLimit) {
          const isPerModelQuota = msg.includes("PerModel") || msg.includes("quotaId");
          if (isPerModelQuota) {
            console.warn(
              `⚠️ [Gemini Model Limit] Model ${modelToTry} trên key ${masked} đã hết quota ngày. Đang trượt xuống model Gemini 3.x tiếp theo...`
            );
            continue; // Trượt xuống model 3.x tiếp theo!
          }

          if (candidateKeys.length > 1) {
            console.warn(
              `⚠️ [Gemini Key Manager] Key ${masked} chạm hạn mức (429 Rate Limit). Tạm nghỉ 60s và xoay tua sang key tiếp theo...`
            );
            health.status = "cooling_down";
            health.cooldownUntil = Date.now() + 60 * 1000; // Cooldown 1 phút
            health.failCount++;
            health.lastError = "429 Quota / Rate limit reached";
            keyHealthMap.set(selectedKey, health);
            break;
          } else {
            console.warn(
              `⚠️ [Gemini Key Manager] Key ${masked} chạm 429 trên ${modelToTry}. Thử trượt xuống model Gemini 3.x tiếp theo...`
            );
            continue;
          }
        } else if (isInvalidKey) {
          console.error(`❌ [Gemini Key Manager] Key ${masked} không hợp lệ (403). Cách ly trong 1 giờ.`);
          health.status = "invalid";
          health.cooldownUntil = Date.now() + 60 * 60 * 1000;
          health.failCount++;
          health.lastError = "403 Invalid or revoked key";
          keyHealthMap.set(selectedKey, health);
          break;
        } else if (isModelDemandSpike) {
          console.warn(
            `🔄 [Gemini Model Fallback] Model ${modelToTry} đang quá tải spike (503). Đợi 1.5s và chuyển sang model Gemini 3.x tiếp theo...`
          );
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        } else {
          // Lỗi khác: thử model tiếp theo hoặc key tiếp theo
          console.warn(`[Gemini Attempt] Key ${masked} với model ${modelToTry} gặp lỗi: ${msg.slice(0, 80)}`);
        }
      }
    }
  }

  throw lastError || new Error("Tất cả các Gemini API Keys trong pool đều không khả dụng hoặc đã hết hạn mức.");
}
