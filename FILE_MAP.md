# File Map

## Claude control

- `docs/00_TONIGHT_HANDOFF.md` — fastest execution sequence for tonight

- `CLAUDE.md` — automatic project instructions
- `ONE_SHOT_PROMPT.md` — first prompt to paste
- `BUILD_STATUS.md` — exactly what is verified versus still for Claude
- `.claude/commands/build-game.md` — reusable build command
- `.claude/commands/validate-game.md` — reusable validation command

## Working app shell

- `app/` — Next.js routes
- `components/` — retro stage, team claim, price input
- `lib/game/` — scoring and state machine
- `lib/supabase/` — browser/server/admin clients
- `lib/sound/` — original synthesized audio cues
- `tests/` — scoring tests

## Backend

- `supabase/migrations/` — schema, RLS, and RPC contracts
- `scripts/seed-supabase.mjs` — private server-side product import

## Product data

- `data/admin/` — private paid prices, tomorrow warm-up template, cleanup tracker, and retailer metadata
- `data/public/` — sanitized no-price/no-store stubs
- `PRODUCT_STATUS_SUMMARY.md` — confirmed versus unresolved prices

## Assets

- `public/brand/` — Designs Direct logo
- `public/ui/` — original deployable retro SVGs
- `public/placeholders/everyday/` — five warm-up placeholders
- `public/products/approved/` — final exact product cutouts only
- `private/source-products/` — 35 raw source photos; never deploy
- `private/receipts/` — private receipt evidence
- `private/reference-only/` — visual moodboard; never deploy
- `design/REFERENCE_BOARD.html` — local reference board

## Requirements

- `docs/01_PRODUCT_PRICE_AND_PRIVACY_RULES.md`
- `docs/02_GAMEPLAY_AND_STATE_MACHINE.md`
- `docs/03_REALTIME_ARCHITECTURE.md`
- `docs/04_DATABASE_RLS_AND_PAYLOADS.md`
- `docs/05_DESIGN.md`
- `docs/06_ANIMATION_AND_AUDIO.md`
- `docs/07_EXACT_PRODUCT_IMAGE_CLEANUP.md`
- `docs/08_VERCEL_SUPABASE_DEPLOYMENT.md`
- `docs/09_ACCEPTANCE_TESTS.md`
- `docs/10_TOMORROW_WARMUP_UPDATE.md`
- `docs/11_REFERENCE_RESEARCH.md`
- `docs/12_ADMIN_PRODUCT_IMPORT.md`
- `docs/13_TECHNICAL_SOURCE_NOTES.md`
- `docs/14_ASSET_RIGHTS_AND_USAGE.md`
