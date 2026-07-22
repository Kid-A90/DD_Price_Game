# Claude Project Instructions

You are working on the production Designs Direct Live Price Game. Read the entire repository before changing code, including every file under `docs/`, `data/game-config.json`, the Supabase migrations, and the reference manifest.

## Product and privacy truth

1. The scoring answer is `gamePricePaid`: what Designs Direct actually paid for the item, excluding sales tax unless the admin explicitly configures otherwise.
2. Never use MSRP or regular retail as the answer.
3. Never show store names or retailer metadata on team or public routes.
4. Never expose a price before the reveal phase.
5. Never import private product JSON, receipts, source photos, or reference-only art into a Client Component.
6. Never copy `private/source-products` directly into `public`.
7. A product cannot enter the active lineup until `priceStatus` is `confirmed_paid_price` and its cleaned exact product shot is approved.

## Gameplay truth

- Four team laptops claim red, blue, yellow, or green.
- Each team enters one to five names and keeps that assignment for the session.
- No visible login; use Supabase anonymous auth.
- Retail-only during normal questions.
- Save drafts server-side while the timer runs.
- At zero, finalize the last valid server-saved draft before the deadline. Blank is no submission.
- Closest without going over: 3 points.
- Second closest without going over: 1 point.
- Exact paid price: +1 point.
- If everyone goes over: closest overall gets 1 point.
- Benchmark/average-cost input appears only to teams tied for a point-bearing retail position.
- Benchmark guesses create no routine bonus points.
- Public display is read-only and never receives unrevealed guesses.
- Admin controls pace and can force close, reveal, advance, recover devices, and make audited emergency corrections.

## Technical direction

- Use the supplied Next.js App Router project; do not replace it with another framework.
- Deploy the web app to Vercel.
- Use Supabase Auth, Postgres, Realtime, and Storage.
- Use Postgres Changes for durable state and optional Broadcast only for transient animation cues.
- Use RLS everywhere. Keep service-role access server-only.
- Use server-authoritative timestamps and idempotent state transitions.
- Make critical scoring/phase changes transactional or RPC-backed.
- Keep the source of truth in Supabase, not localStorage. localStorage may only remember non-authoritative device convenience data.

## Visual direction

Build an original Designs Direct game-show system, not a pixel copy of a television set. Study `docs/05_DESIGN.md` and the images in `private/reference-only`. Reuse the supplied original SVGs in `public/ui` where useful. The visual language should feel like a 1972-era American game show: saturated primary color bays, warm cream frames, walnut scenic texture, thick black outlines, dot-matrix/mechanical numbers, incandescent chasing bulbs, price tags, starbursts, rounded scenic architecture, and decisive reveal animation.

Do not deploy the reference-only television images or logo files. They are moodboard inputs only.

## Work order

1. Audit the repo and list unresolved paid prices/images.
2. Get the shell building and running.
3. Finish Supabase session creation and anonymous device flow.
4. Finish question lifecycle and server-authoritative timing.
5. Finish scoring and conditional tie-break RPCs.
6. Connect all three routes to realtime state.
7. Build admin product/lineup editing and JSON/CSV import.
8. Apply the visual system and animation.
9. Run tests, public-safety validation, and the six-session acceptance test.
10. Deploy to Vercel and document the exact setup.

Do not claim multiplayer is finished until four team windows, one public display, and one admin window have been tested simultaneously.
