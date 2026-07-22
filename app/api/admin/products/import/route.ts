import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

interface ProductImportRow {
  id?: string;
  public_name?: string;
  brand_public?: string | null;
  category?: string | null;
  game_price_paid?: number | null;
  benchmark_cost?: number | null;
  price_status?: string;
  public_image_path?: string | null;
  public_image_status?: string;
  ready_for_game?: boolean;
  default_round_role?: string;
  active?: boolean;
  [key: string]: unknown;
}

// POST /api/admin/products/import — bulk upsert from JSON or CSV body
export async function POST(req: NextRequest) {
  const setupKey = req.headers.get("x-setup-key");
  if (!setupKey || setupKey !== process.env.ADMIN_SETUP_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  let rows: ProductImportRow[] = [];

  if (contentType.includes("application/json")) {
    const body = await req.json();
    rows = Array.isArray(body) ? body : [body];
  } else if (contentType.includes("text/csv") || contentType.includes("text/plain")) {
    const text = await req.text();
    rows = parseCSV(text);
  } else {
    return NextResponse.json({ error: "Content-Type must be application/json or text/csv" }, { status: 415 });
  }

  const valid = rows.filter((r) => r.id && r.public_name);
  if (valid.length === 0) {
    return NextResponse.json({ error: "No valid rows (each needs id and public_name)" }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const upserts = valid.map((r) => ({
    id: String(r.id),
    public_name: String(r.public_name),
    brand_public: r.brand_public ?? null,
    category: r.category ?? null,
    game_price_paid: r.game_price_paid != null ? Number(r.game_price_paid) : null,
    benchmark_cost: r.benchmark_cost != null ? Number(r.benchmark_cost) : null,
    price_status: r.price_status ?? "needs_receipt",
    public_image_path: r.public_image_path ?? null,
    public_image_status: r.public_image_status ?? "needs_exact_product_cleanup",
    ready_for_game: r.ready_for_game === true || String(r.ready_for_game) === "true",
    default_round_role: r.default_round_role ?? "library",
    active: r.active === true || String(r.active) === "true",
  }));

  const { data, error } = await sb.from("products").upsert(upserts).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ imported: data?.length ?? 0, skipped: rows.length - valid.length });
}

function parseCSV(text: string): ProductImportRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row: ProductImportRow = {};
    headers.forEach((h, i) => {
      const v = values[i]?.trim().replace(/^"|"$/g, "") ?? "";
      row[h] = v === "" ? null : v;
    });
    return row;
  });
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === "," && !inQuote) { result.push(cur); cur = ""; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}
