import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAdminProductLibrary } from "@/lib/server/product-data";

// GET: return all products from DB (or JSON file if DB is empty)
export async function GET(req: NextRequest) {
  const setupKey = req.headers.get("x-setup-key");
  if (!setupKey || setupKey !== process.env.ADMIN_SETUP_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("products")
    .select("*")
    .order("public_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If DB is empty, return the private JSON library
  if (!data || data.length === 0) {
    return NextResponse.json({ products: getAdminProductLibrary(), source: "json" });
  }

  return NextResponse.json({ products: data, source: "db" });
}

// POST: upsert one product into the DB
export async function POST(req: NextRequest) {
  const setupKey = req.headers.get("x-setup-key");
  if (!setupKey || setupKey !== process.env.ADMIN_SETUP_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as Record<string, unknown>;
  if (!body.id || !body.public_name) {
    return NextResponse.json({ error: "id and public_name are required" }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("products")
    .upsert({
      external_id: body.id,
      public_name: body.public_name,
      brand_public: body.brand_public ?? null,
      category: body.category ?? null,
      paid_price: body.paid_price ?? body.game_price_paid ?? null,
      benchmark_cost: body.benchmark_cost ?? null,
      price_status: body.price_status ?? "needs_receipt",
      public_image_path: body.public_image_path ?? null,
      image_status: body.image_status ?? body.public_image_status ?? "needs_exact_product_cleanup",
      ready_for_game: body.ready_for_game ?? false,
      default_round_role: body.default_round_role ?? "library",
      active: body.active ?? false,
    }, { onConflict: "external_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data });
}
