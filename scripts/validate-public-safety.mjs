import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const forbiddenStoreTerms = [/Target/, /HomeGoods/, /TJ\s*Maxx/, /Starbucks/];
const scanRoots = [
  "public",
  "data/public",
  "app/display",
  "app/team",
  "app/join",
  "components"
];
const textExtensions = new Set([".json", ".js", ".mjs", ".ts", ".tsx", ".css", ".md", ".svg"]);
const errors = [];

function walk(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return;
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    const childRelative = path.join(relativePath, entry.name);
    if (entry.isDirectory()) walk(childRelative);
    else inspect(childRelative);
  }
}

function inspect(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  const basename = path.basename(relativePath);
  if (/receipt|source-products|reference-only/i.test(relativePath)) {
    errors.push(`${relativePath}: private material is inside a publishable path`);
  }
  if (/^\d+(?:\.\d{1,2})?\.(?:jpg|jpeg|png|webp)$/i.test(basename)) {
    errors.push(`${relativePath}: price-like source filename must not be public`);
  }
  if (!textExtensions.has(extension)) return;
  const content = fs.readFileSync(path.join(root, relativePath), "utf8");
  for (const term of forbiddenStoreTerms) {
    if (term.test(content)) errors.push(`${relativePath}: contains forbidden store reference ${term}`);
  }
}

for (const scanRoot of scanRoots) walk(scanRoot);

const publicCatalogPath = path.join(root, "data/public/product-catalog.stub.json");
const publicCatalog = JSON.parse(fs.readFileSync(publicCatalogPath, "utf8"));
for (const item of publicCatalog) {
  for (const key of Object.keys(item)) {
    if (/price|retailer|store|benchmark|fob|cost/i.test(key)) errors.push(`public product ${item.id}: forbidden field ${key}`);
  }
}

if (errors.length) {
  console.error("Public-safety validation failed:\n" + errors.map((entry) => `- ${entry}`).join("\n"));
  process.exit(1);
}
console.log("Public-safety validation passed.");
