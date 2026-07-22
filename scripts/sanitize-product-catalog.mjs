import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = JSON.parse(fs.readFileSync(path.join(root, "data/admin/product-library.private.json"), "utf8"));
const safe = source.map((item) => ({
  id: item.id,
  publicName: item.publicName,
  category: item.category,
  publicImage: item.publicImage,
  readyForGame: Boolean(item.readyForGame),
  imageStatus: item.publicImageStatus
}));
fs.writeFileSync(path.join(root, "data/public/product-catalog.stub.json"), JSON.stringify(safe, null, 2) + "\n");
console.log(`Wrote ${safe.length} sanitized public records.`);
