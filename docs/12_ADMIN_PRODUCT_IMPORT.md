# Admin Product Import and Lineup Editing

## Product library fields

```text
id
publicName
category
retailerPrivate
gamePricePaid
candidatePaidPrice
regularPricePrivate
priceStatus
benchmarkCost
sourceImagePrivate
publicImage
publicImageStatus
readyForGame
roundRole
active
notesPrivate
```

## Import behavior

- Accept JSON and CSV.
- Validate money as non-negative decimal values.
- Keep retailer and regular price private.
- Reject active status when `priceStatus` is not `confirmed_paid_price`, paid price is missing, or the approved image is missing.
- Preview all changes before commit.
- Use stable product IDs so image replacement does not break lineup references.
- Export the final library and active lineup before the event.

## Active lineup

Admin should be able to:

- drag to reorder;
- assign warm-up, main, showcase, mystery, or backup;
- choose timer duration;
- mark tie-break benchmark available;
- duplicate a product into a separate session question snapshot;
- keep unused items in the library;
- replace images without code changes.

## Price reconciliation

Show three separate values in admin only:

- paid price: authoritative game answer;
- candidate paid price: filename or provisional value;
- regular price: audit/reference only.

Require an explicit paid-price confirmation before a product can become ready.
