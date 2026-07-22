# Exact Product Image Cleanup

## Goal

Create a clean product shot of the exact purchased item without changing its design.

## Remove

- wall and furniture background;
- hands or people;
- receipts;
- retailer stickers;
- visible prices;
- loose tags that identify the store;
- distracting shadows and perspective distortion where practical.

## Preserve exactly

- shape and proportions;
- product color and finish;
- artwork, pattern, typography, and labels intrinsic to the product;
- packaging when the package is part of the purchased presentation;
- accessories included with the product;
- visible product brand when it is not a retailer clue.

## Forbidden cleanup behavior

- replacing the product with a similar generated object;
- changing art or words;
- inventing missing corners;
- altering lamp shades, frames, handles, patterns, or packaging;
- changing color to match the app palette;
- leaving a store or price clue in the final image.

## Output

For each product create:

```text
public/products/approved/P001.png
public/products/approved/P001-white.jpg
```

Preferred master:

- transparent PNG;
- at least 1600 px on the longest side;
- sRGB;
- clean edge mask;
- product centered with 8–12% breathing room.

## Approval

Review source and cleaned image side by side at 100%.

Approve only when:

1. It is clearly the exact same item.
2. No store or price clue remains.
3. No product detail has been regenerated incorrectly.
4. Edge cleanup is projector-safe.
5. File name matches the stable product ID.

Until approved, keep `readyForGame: false`.
