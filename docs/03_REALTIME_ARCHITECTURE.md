# Realtime Architecture

## Recommended stack

- Next.js 16.2 App Router
- TypeScript
- Vercel
- Supabase Auth
- Supabase Postgres
- Supabase Realtime
- Supabase Storage or reviewed repository assets

This is a small, high-value event system with six active screens. Favor explicit durable state and simple recovery over excessive infrastructure.

## Authentication

Use Supabase anonymous sign-ins so each browser receives a stable `auth.uid()` without a visible login flow.

- Team ownership is tied to that anonymous user ID.
- Admin ownership is tied to the anonymous user that creates/claims the admin session.
- Public display also signs in anonymously but has read-only access.
- The service-role key stays server-only.

For a public internet deployment, enable abuse protection such as Turnstile. For a short internal event, the session code and admin setup key remain the primary convenience controls, but RLS is still mandatory.

## Realtime choice

Use **Postgres Changes** for durable records:

- `session_public_state`
- `teams`
- each team's own `submissions`

Use optional **Broadcast** messages only for transient cues such as `winner_burst`, `bulb_chase`, or `price_flip`. A missed animation event must never lose game state.

## Safe public-state pattern

All shared screens subscribe to one sanitized record containing:

- session code;
- phase;
- current question ID;
- product name;
- approved image path;
- deadline;
- per-team status only;
- tie-eligible colors;
- leaderboard;
- reveal price only after reveal;
- point awards only after scoring;
- animation cue.

The record must not contain private prices before reveal, retailer data, receipts, or raw guesses.

## Timer design

The server writes one `deadline_at` timestamp. Clients render remaining time from that timestamp rather than decrementing an independent authoritative counter.

To avoid losing a typed answer at zero:

- save valid drafts to Supabase while typing;
- retain `draft_updated_at`;
- when closing the question, finalize the latest draft saved no later than the deadline;
- reject late drafts;
- blank remains no submission.

Pause behavior should store the remaining milliseconds and clear the active deadline. Resume creates a new deadline from the stored remainder.

## Reconnect

On refresh:

1. Restore Supabase anonymous session.
2. Query team owned by `auth.uid()` for the session.
3. Re-subscribe to public state and own submission.
4. Rebuild UI entirely from server state.
5. Never trust local phase or score values.

## Image storage

- Private bucket: source photos and receipts; admin/server only.
- Public bucket or repository folder: approved exact product cutouts only.
- Database stores paths, not base64 image blobs.
