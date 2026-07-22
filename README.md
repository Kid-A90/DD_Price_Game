# Designs Direct Live Price Game — Claude One-Shot Kit

This folder is a production-oriented starter for a live four-team pricing game hosted on **Vercel** with **Supabase** providing anonymous authentication, durable state, and realtime updates.

## Start here

1. Read `docs/00_TONIGHT_HANDOFF.md`, then open this folder as the project root in Claude Code.
2. Let Claude read `CLAUDE.md` automatically.
3. Paste `ONE_SHOT_PROMPT.md` as the first instruction.
4. Do not move anything from `private/` into `public/`.
5. Build and verify the gameplay shell before spending time on final visual polish.

## Non-negotiable rules already encoded

- Four team laptops, one projector display, and one admin computer work at the same time.
- No visible player login. Devices use Supabase anonymous auth behind the scenes.
- Each team laptop claims one available color, enters up to five names, and remains that team all game.
- Normal questions ask for **retail guesses only**.
- The answer is the **exact amount paid**, not MSRP or regular retail.
- No store name, receipt, or retailer metadata appears on team or public screens.
- Answer prices are hidden until admin reveal.
- At the deadline, the server finalizes the latest valid draft saved before time expired. Blank means no submission.
- A benchmark/average-cost guess appears only when an equal retail guess affects a point-bearing position.
- Routine points are automatic; admin score entry is emergency-only and audited.
- Existing product photos are private source material. Only approved exact clean product shots may be published.

## Included

- Next.js 16.2 rolling shell with team, display, and admin routes.
- Supabase schema, RLS policies, team-claim and submission RPCs.
- Deterministic paid-price scoring code and tests.
- 35 source product photos and three receipts in a private folder.
- Paid-price corrections for the known sale electronics.
- Five tomorrow-ready everyday placeholders: eggs, milk, matcha latte, bread, and cereal.
- Designs Direct logo.
- Uploaded vintage Price Is Right references, isolated as reference-only.
- Original deployable SVG UI assets inspired by broad 1970s game-show motifs.
- Product safety validation script.
- Tomorrow-ready warm-up CSV and exact-product image cleanup tracker.
- Vercel and Supabase deployment runbook.
- Honest build-status handoff in `BUILD_STATUS.md`.

## Quick local shell

```bash
npm install
cp .env.example .env.local
npm run dev
```

With `NEXT_PUBLIC_DEMO_MODE=true`, the visual shell can be reviewed before Supabase is connected. Realtime multiplayer is not complete until the SQL migrations are applied and all six browser sessions pass the acceptance tests.
