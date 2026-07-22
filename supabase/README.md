# Supabase setup

1. Create a Supabase project.
2. Enable anonymous sign-ins in Auth settings.
3. Run the migration files in order.
4. Confirm `session_public_state`, `teams`, and `submissions` are in Realtime publication.
5. Keep `SUPABASE_SERVICE_ROLE_KEY` in Vercel server environment variables only.
6. Use a private Storage bucket for source product photos and receipts.
7. Use a separate public bucket, or the repository `public/products/approved` folder, only for reviewed clean product shots.

The project intentionally uses:
- anonymous authentication for no-visible-login devices;
- Postgres Changes for six durable event clients;
- optional Broadcast messages only for ephemeral animation cues;
- RLS on every exposed table;
- a safe public-state table that never contains unrevealed answers or store metadata.
