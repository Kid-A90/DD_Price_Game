# Technical Source Notes

These official sources were checked when preparing the architecture:

- Next.js App Router: https://nextjs.org/docs/app
- Next.js 16 release: https://nextjs.org/blog/next-16
- Next.js 16 upgrade requirements: https://nextjs.org/docs/app/guides/upgrading/version-16
- Next.js on Vercel: https://vercel.com/docs/frameworks/full-stack/nextjs
- Vercel deployments: https://vercel.com/docs/deployments
- Supabase Anonymous Sign-Ins: https://supabase.com/docs/guides/auth/auth-anonymous
- Supabase Realtime: https://supabase.com/docs/guides/realtime
- Supabase database change subscriptions: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase secure data guidance: https://supabase.com/docs/guides/database/secure-data

Implementation notes:

- Next.js 16 requires Node.js 20.9 or newer.
- Supabase anonymous users use the authenticated role and can be governed by RLS.
- Supabase recommends abuse protection for public anonymous sign-ins.
- Broadcast is recommended for scalable/private realtime events, while Postgres Changes is simpler for this six-client event. This project uses Postgres Changes for durable state and optional Broadcast for ephemeral animation cues.
- The Supabase service-role/secret key must never be exposed to browser code.
