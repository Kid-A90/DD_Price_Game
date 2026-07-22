-- Add columns that the product library editor uses but were missing from migration 1.
-- All idempotent via IF NOT EXISTS.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_status text NOT NULL DEFAULT 'needs_receipt',
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_round_role text NOT NULL DEFAULT 'library';

-- Keep ready_for_game in sync: a product is active only when both flags agree.
-- (Managed by admin UI; no automatic trigger needed.)
