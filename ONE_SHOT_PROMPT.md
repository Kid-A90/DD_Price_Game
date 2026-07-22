# Paste this into Claude Code

Take ownership of this repository and turn it into a production-ready live multiplayer Designs Direct pricing game.

First, inspect the entire project. Read `CLAUDE.md`, every file under `docs/`, `data/game-config.json`, the private and public product manifests, the existing Next.js shell, the scoring tests, and all Supabase migrations. Do not replace the project with a generic template. Preserve the folder's safety boundaries.

## Core delivery

Build one Vercel-hosted Next.js app with three synchronized experiences:

1. **Team laptop** — four independent computers join by session code, claim an available color, enter one to five names, and remain attached to that team for the full game. There is no visible login. Supabase anonymous authentication runs behind the scenes.
2. **Public projector** — shows the lobby, team names, active product, shared timer, lock status, reveal, automatic point award, leaderboard, tie-break status, showcase, and final winner. It never shows unrevealed guesses, private prices, receipts, or retailer information.
3. **Admin control** — creates the session, locks the lobby, loads and reorders products, opens/pauses/force-closes/reopens-before-reveal questions, reveals answers, advances, handles device recovery, launches backup questions, and makes audited emergency score corrections. Routine scoring is automatic.

## Price truth and store privacy

- The authoritative game answer is the exact amount paid for the item, not MSRP or regular retail.
- Known corrections are already in the private product data, including the sale electronics.
- Do not activate any product whose `priceStatus` is not `confirmed_paid_price`, whose `gamePricePaid` is null, or whose clean image is unapproved.
- Never render store names on team or public routes.
- Never render any answer price before the admin reveal phase.
- The source photos and receipts live under `private/`; they must never be copied into the client bundle or public assets.
- The public product image must be an approved exact product cleanup with the store sticker, receipt, hands, and room removed without changing the product.

## Normal question behavior

- Team screen shows a huge laptop-friendly currency input.
- Save the current valid draft to Supabase while the timer runs.
- Allow edits until the server deadline.
- At zero, finalize the last valid draft saved before the deadline.
- Blank or invalid at zero is `no_submission`.
- A manually locked answer cannot be edited unless the admin reopens the question before reveal.
- Public display shows only status such as Thinking, Draft Saved, Locked, or No Submission.

## Scoring

Use the supplied `lib/game/scoring.ts` as the reference implementation and keep the tests passing:

- closest without going over: 3 points;
- second closest without going over: 1 point;
- exact paid price: +1 point;
- if all teams go over: closest overall gets 1 point;
- no submission: 0 points.

Authoritative scoring must run server-side or in a transactional Postgres RPC. Never trust a browser-calculated score.

## Tie behavior

Normal questions must never show an average-cost field.

After retail guesses close, detect whether equal retail guesses affect first place, second place, or the all-over point. Only then:

- open an `Average Cost Guess` field for only the tied teams;
- keep every other team in a waiting state;
- use the admin-provided `benchmarkCost` answer;
- award the tied retail slot to the closest benchmark guess;
- award no routine benchmark bonus points;
- keep the retail answer hidden until the tie is resolved;
- if benchmark guesses are still exactly tied, present the admin with two explicit choices: equal points or sudden-death backup item.

If final total scores are tied, launch a separate mystery-item average-cost tie-break for only the tied leaders.

## Realtime architecture

Use Supabase:

- anonymous Auth for each event device;
- Postgres tables and RLS as the durable source of truth;
- Postgres Changes for the six connected clients;
- optional Broadcast messages for transient animation cues only;
- a safe public-state record that contains no unrevealed answer or retailer metadata;
- RPCs/transactions for claiming teams, closing questions, applying scores, tie resolution, and phase changes;
- a server-authoritative `deadline_at` and `state_version` to reject stale admin actions;
- reconnect and refresh recovery without losing the claimed team.

Use the service-role key only in server code. Never expose it through `NEXT_PUBLIC_*`.

## Products and tomorrow's warm-up

The folder contains 35 source products and five warm-up placeholders:

1. Carton of Eggs
2. Gallon of Milk
3. Grande Matcha Latte
4. Loaf of Sandwich Bread
5. Box of Breakfast Cereal

Tomorrow, the admin needs to upload the exact photos and enter the exact paid prices without code changes. Build a straightforward product editor plus JSON/CSV import/export. Store retailer and receipt notes privately. The active lineup should be editable independently from the full library.

## Visual and motion direction

Study `docs/05_DESIGN.md`, `docs/11_REFERENCE_RESEARCH.md`, and `private/reference-only/vintage-vibe-contact-sheet.jpg`. Build an original system using:

- four colored contestant bays;
- warm cream and gold frames;
- walnut scenic texture;
- tomato red, tangerine, yellow, blue, aqua, green, and selective purple;
- thick black outlines and purposeful drop shadows;
- dot-matrix/mechanical price numerals;
- curved scenic panels, price tags, starbursts, and chasing incandescent bulbs;
- large product reveal pedestals;
- dramatic but fast win/reveal animation;
- reduced-motion support;
- original Web Audio cues from `lib/sound/synth.ts`, with hooks for licensed replacements.

Avoid generic SaaS cards, glassmorphism, cyber-neon, casino styling, and tiny inputs. Do not deploy or trace the television reference images. Use them only to understand visual grammar.

## Completion standard

- `npm run validate:data` passes.
- Unit tests pass.
- Production build passes.
- Supabase migrations are complete and idempotent.
- Four team browsers, one admin browser, and one display browser stay synchronized.
- Refresh/reconnect works.
- Duplicate team claims are prevented.
- Late guesses are rejected.
- Store names and unrevealed prices never leak to public/team payloads.
- Admin can run the event without manually typing routine scores.
- Vercel deployment and Supabase setup are documented step by step.

Work in clear stages. After each stage, run the relevant checks, report exactly what changed, and state any blocker honestly.
