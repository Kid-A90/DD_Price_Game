# Product, Price, and Privacy Rules

## Authoritative answer

The answer shown at reveal and used by scoring is the **exact paid price** for the purchased item.

Default treatment:

- Use the item subtotal price before sales tax.
- Use the sale price actually charged when an item was discounted.
- Do not use MSRP, regular retail, compare-at price, or the number originally typed into a filename when a receipt proves a different paid amount.
- Keep regular price only as a private audit field.

Known corrections already reflected in `data/admin/product-library.private.json`:

- Beats Pill: paid price $99.99; regular price $149.99.
- Beats Solo Buds: paid price $69.99; regular price $79.99.

Products whose paid price is not confirmed remain `readyForGame: false`.

## Store privacy

The team and public routes must never render:

- retailer name;
- store logo;
- receipt image;
- store address;
- receipt SKU or transaction data;
- private-label clue that unnecessarily reveals the store;
- a visible store price sticker.

Retailer data is permitted only inside admin-only views and server-side records.

The public product name should describe the product neutrally. Product brands such as Beats, Owala, or Keurig may remain when they are intrinsic to the product, but store identity must not.

## Answer privacy

Before reveal, the public/team payload must not contain:

- paid price;
- regular price;
- candidate price;
- benchmark cost;
- retailer metadata;
- other teams' guesses.

Do not merely hide these values with CSS. Do not send them to the browser.

## Three data zones

### Private source zone

`private/` contains receipts, raw product photos, and design references. It is never deployed and never imported by Client Components.

### Admin data zone

`data/admin/` contains paid prices and private retailer fields. It may be used by server-only seed/import scripts and admin server routes.

### Public zone

`public/` and `data/public/` contain only approved product cutouts, neutral names, placeholders, and original UI art.

## Product readiness gate

A product may become active only when all are true:

1. `priceStatus` is `confirmed_paid_price` and `gamePricePaid` is present.
2. `benchmarkCost` is present if the item can be used for a tie-break.
3. The approved public image is an exact match to the purchased item.
4. No store or price clue remains in the image.
5. Public name and category are confirmed.
6. Admin has selected a round and position.

The admin UI should show a red blocker and prevent activation when any required field is missing.
