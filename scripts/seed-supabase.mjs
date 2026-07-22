import fs from "node:fs";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first");

const products = JSON.parse(fs.readFileSync(new URL("../data/admin/product-library.private.json", import.meta.url), "utf8"));
const warmups = JSON.parse(fs.readFileSync(new URL("../data/admin/warmup-products.private.json", import.meta.url), "utf8"));
const client = createClient(url, serviceRole, { auth: { persistSession: false } });

const rows = [...products, ...warmups].map((item) => ({
  external_id: item.id,
  public_name: item.publicName,
  category: item.category,
  retailer_private: item.retailerPrivate ?? item.privateSourceHint ?? null,
  paid_price: item.gamePricePaid ?? null,
  regular_price_private: item.regularPricePrivate ?? null,
  benchmark_cost: item.benchmarkCost ?? null,
  candidate_paid_price: item.candidatePaidPrice ?? null,
  public_image_path: item.publicImage ?? null,
  source_image_path_private: item.sourceImagePrivate ?? null,
  image_status: item.publicImageStatus ?? "placeholder",
  ready_for_game: Boolean(item.readyForGame),
  metadata: item
}));

const { error } = await client.from("products").upsert(rows, { onConflict: "external_id" });
if (error) throw error;
console.log(`Seeded ${rows.length} product records.`);
