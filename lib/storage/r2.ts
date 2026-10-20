import "server-only";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function cleanEnv(val?: string): string {
  if (!val) return "";
  return val.trim().replace(/^['"]|['"]$/g, "");
}

const accountId = cleanEnv(process.env.CLOUDFLARE_R2_ACCOUNT_ID);
const accessKeyId = cleanEnv(process.env.CLOUDFLARE_R2_ACCESS_KEY_ID);
const secretAccessKey = cleanEnv(process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY);
const bucketName = cleanEnv(process.env.CLOUDFLARE_R2_BUCKET_NAME) || "huanseek-properties";
const publicUrl = cleanEnv(process.env.CLOUDFLARE_R2_PUBLIC_URL);

/**
 * Kiểm tra xem các biến môi trường của Cloudflare R2 đã được cấu hình đầy đủ chưa
 */
export function isR2Configured(): boolean {
  return Boolean(accountId && accessKeyId && secretAccessKey && bucketName);
}

/**
 * Khởi tạo S3 Client cho Cloudflare R2
 */
function getR2Client(): S3Client | null {
  if (!isR2Configured()) return null;

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * Tải file Buffer trực tiếp lên Cloudflare R2
 * @param buffer Dữ liệu nhị phân của file
 * @param key Đường dẫn file trên R2 (vd: properties/2026/img_123.webp)
 * @param contentType Định dạng MIME (vd: image/webp, image/jpeg)
 * @returns Đường dẫn CDN URL vĩnh viễn
 */
export async function uploadToR2(
  buffer: Buffer | Uint8Array,
  key: string,
  contentType: string = "image/webp"
): Promise<string | null> {
  const client = getR2Client();
  if (!client) {
    console.warn("⚠️ Cloudflare R2 chưa được cấu hình biến môi trường. Bỏ qua upload.");
    return null;
  }

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await client.send(command);

    if (publicUrl) {
      const cleanBase = publicUrl.replace(/\/+$/, "");
      return `${cleanBase}/${key}`;
    }

    // Mặc định định dạng URL public r2.dev hoặc cloudflarestorage
    return `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/${key}`;
  } catch (error: any) {
    console.error("❌ Lỗi upload file lên Cloudflare R2:", error?.message || error);
    return null;
  }
}

/**
 * Tải ảnh từ URL tạm thời của Zalo, tối ưu hóa (nén WebP) và lưu trữ vĩnh viễn lên Cloudflare R2
 * @param zaloUrl URL ảnh tạm thời do Zalo OA webhook cung cấp
 * @returns URL vĩnh viễn từ Cloudflare R2 (hoặc trả lại URL gốc nếu R2 chưa cấu hình)
 */
export async function downloadAndPersistZaloImage(zaloUrl: string): Promise<string> {
  if (!zaloUrl || !zaloUrl.startsWith("http")) return zaloUrl;

  // Nếu R2 chưa được cấu hình, giữ nguyên URL gốc để hệ thống không bị gián đoạn
  if (!isR2Configured()) {
    return zaloUrl;
  }

  try {
    const response = await fetch(zaloUrl, {
      headers: {
        "User-Agent": "Huanseek-Bot/1.0",
      },
    });

    if (!response.ok) {
      console.warn(`Không thể tải ảnh từ Zalo (${response.status}): ${zaloUrl.slice(0, 60)}`);
      return zaloUrl;
    }

    const arrayBuffer = await response.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    let finalBuffer: Buffer = inputBuffer;
    let extension = "webp";
    let mimeType = "image/webp";

    try {
      // Tối ưu hóa dung lượng với sharp (nén WebP chất lượng 82% siêu nhẹ)
      const sharp = (await import("sharp")).default;
      finalBuffer = await sharp(inputBuffer)
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      // Fallback nếu sharp gặp lỗi format
      extension = "jpg";
      mimeType = "image/jpeg";
    }

    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
    const uniqueId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${extension}`;
    const r2Key = `properties/${datePrefix}/${uniqueId}`;

    const permanentUrl = await uploadToR2(finalBuffer, r2Key, mimeType);
    return permanentUrl || zaloUrl;
  } catch (err: any) {
    console.error("Lỗi trong quá trình persist ảnh Zalo sang R2:", err?.message || err);
    return zaloUrl;
  }
}
