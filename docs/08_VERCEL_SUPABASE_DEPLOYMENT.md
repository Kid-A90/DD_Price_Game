# Vercel + Supabase Deployment

## 1. Create Supabase project

Create a new project and record:

- project URL;
- publishable key;
- service-role key.

Enable anonymous sign-ins under Auth configuration.

## 2. Apply database migrations

Run the SQL files in `supabase/migrations` in filename order using the Supabase CLI or SQL editor.

Verify:

- RLS is enabled on all exposed tables;
- `session_public_state`, `teams`, and `submissions` are enabled for Realtime;
- team RPCs are executable only by authenticated users;
- products and private question data are not broadly readable.

## 3. Storage

Create:

- private bucket `product-sources` for source photos and receipts;
- public bucket `product-approved` for approved exact product shots, or keep approved shots in the repository.

Do not upload `private/reference-only` to the public bucket.

## 4. Local environment

```bash
cp .env.example .env.local
```

Set:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
ADMIN_SETUP_KEY
```

## 5. Install and run

```bash
npm install
npm run validate:data
npm run test
npm run dev
```

Open:

```text
/join
/team/DEMO
/display/DEMO
/admin/DEMO
```

## 6. Seed private product data

After migration and environment setup:

```bash
npm run seed:supabase
```

The seed script is server-side and reads `data/admin`.

## 7. Vercel

- Push the project to a private Git repository.
- Import it into Vercel.
- Add the same environment variables.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
- Deploy.

## 8. Production check

Before the event:

- test on the exact Wi-Fi network;
- test projector resolution and browser zoom;
- keep all six devices plugged in;
- mute browser notifications;
- verify sound after one host interaction;
- open a backup admin tab;
- export the final lineup and score settings;
- keep a printed emergency answer sheet.
