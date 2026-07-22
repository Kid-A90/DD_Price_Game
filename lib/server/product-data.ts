import "server-only";
import products from "@/data/admin/product-library.private.json";
import warmups from "@/data/admin/warmup-products.private.json";

export type AdminProduct = (typeof products)[number];

export function getAdminProductLibrary() {
  return products;
}

export function getWarmupPlaceholders() {
  return warmups;
}
