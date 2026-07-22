import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// POST /api/admin/upload-image
// Accepts: multipart/form-data with fields: productId, file
// Uploads to Supabase Storage bucket "product-images" and returns public URL
export async function POST(req: NextRequest) {
  const setupKey = req.headers.get("x-setup-key");
  if (!setupKey || setupKey !== process.env.ADMIN_SETUP_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const productId = formData.get("productId");
  const file = formData.get("file") as File | null;

  if (!productId || !file) {
    return NextResponse.json({ error: "productId and file are required" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  if (!["jpg", "jpeg", "png", "webp", "svg"].includes(ext)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
  }

  // 5MB limit
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 400 });
  }

  const storagePath = `products/${String(productId)}.${ext}`;
  const bytes = await file.arrayBuffer();

  const sb = createSupabaseAdminClient();
  const { error: uploadErr } = await sb.storage
    .from("product-images")
    .upload(storagePath, bytes, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const { data: { publicUrl } } = sb.storage
    .from("product-images")
    .getPublicUrl(storagePath);

  // Update the product record's public_image_path
  await sb.from("products").update({
    public_image_path: publicUrl,
    public_image_status: "pending_approval",
  }).eq("id", String(productId));

  return NextResponse.json({ publicUrl, storagePath });
}
