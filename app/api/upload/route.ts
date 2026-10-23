import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/storage/r2";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      const singleFile = formData.get("file") as File;
      if (singleFile) files.push(singleFile);
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const uploadedUrls: string[] = [];

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const rand = Math.random().toString(36).substring(2, 7);
      const ext = file.name.split(".").pop() || "jpg";
      const key = `properties/${year}/${month}/${day}/manual_${Date.now()}_${rand}.${ext}`;

      const r2Url = await uploadToR2(buffer, key, file.type || "image/jpeg");
      if (r2Url) {
        uploadedUrls.push(r2Url);
      }
    }

    return NextResponse.json({
      success: true,
      urls: uploadedUrls,
    });
  } catch (error: any) {
    console.error("[Manual Upload Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to upload file" },
      { status: 500 }
    );
  }
}
