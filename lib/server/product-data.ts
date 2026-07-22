import "server-only";
import { readFileSync } from "fs";
import { resolve } from "path";

export interface AdminProduct {
  id: string;
  public_name: string;
  paid_price?: number;
  benchmark_cost?: number;
  category?: string;
  brand_public?: string;
  image_status?: string;
  ready_for_game?: boolean;
  price_status?: string;
  [key: string]: unknown;
}

function loadPrivateJson(filename: string): AdminProduct[] {
  try {
    const content = readFileSync(resolve(process.cwd(), filename), "utf-8");
    return JSON.parse(content) as AdminProduct[];
  } catch {
    return [];
  }
}

export function getAdminProductLibrary(): AdminProduct[] {
  return loadPrivateJson("data/admin/product-library.private.json");
}

export function getWarmupPlaceholders(): AdminProduct[] {
  return loadPrivateJson("data/admin/warmup-products.private.json");
}
