# Deployment & Six-Session Test Guide

## Prerequisites

- Node ≥ 20.9
- Supabase project (free tier is enough for testing)
- Vercel account (or `npm run dev` for local testing)

---

## 1. Supabase Setup

### 1.1 Create project

Sign in at supabase.com → New Project. Note your:
- **Project URL**: `https://xxxx.supabase.co`
- **Anon (publishable) key**: starts with `eyJ…`
- **Service role key**: keep server-side only

### 1.2 Enable anonymous auth

Supabase Dashboard → Authentication → Providers → Enable **Anonymous sign-ins**.

### 1.3 Run migrations

In the Supabase SQL editor, run each file in order:

```
supabase/migrations/202607220001_initial_schema.sql
supabase/migrations/202607220002_rls_and_team_rpc.sql
supabase/migrations/202607220003_admin_transition_contract.sql
supabase/migrations/202607220004_admin_rpcs.sql
```

Or use the Supabase CLI:
```bash
supabase db push
```

### 1.4 Create Storage bucket

Dashboard → Storage → New bucket → Name: `product-images` → Public: yes.

### 1.5 Seed product data (optional)

```bash
node scripts/seed-supabase.mjs
```

This requires `SUPABASE_SERVICE_ROLE_KEY` in your environment.

---

## 2. Environment Variables

Copy `.env.example` to `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ADMIN_SETUP_KEY=choose-a-long-secret-key
```

**NEVER** put `SUPABASE_SERVICE_ROLE_KEY` in a `NEXT_PUBLIC_*` variable.

---

## 3. Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000

---

## 4. Vercel Deployment

1. Push repo to GitHub
2. Import into Vercel → Framework: Next.js
3. Add all four env vars in Vercel project settings
4. Deploy

---

## 5. Pre-Game Checklist

- [ ] At least one product with `price_status = confirmed_paid_price` and a valid `game_price_paid`
- [ ] That product's image approved and at a public URL
- [ ] `ready_for_game = true` on at least the products you plan to use
- [ ] Admin session created at `/admin`
- [ ] Session lineup built at `/admin/lineup`
- [ ] All four team URLs bookmarked: `/join` (teams type their code there)
- [ ] Public display URL: `/display/[CODE]` open on projector

---

## 6. Six-Session Simultaneous Test

Open **six browser windows** (use different profiles or incognito to get distinct anon UIDs):

| Window | URL | Role |
|--------|-----|------|
| 1 | `/admin/[CODE]` | Admin console |
| 2 | `/display/[CODE]` | Public projector |
| 3 | `/join` → Red | Red team laptop |
| 4 | `/join` → Blue | Blue team laptop |
| 5 | `/join` → Yellow | Yellow team laptop |
| 6 | `/join` → Green | Green team laptop |

### Test sequence

1. **Admin**: Create session at `/admin`, note CODE.
2. **Teams 3–6**: Go to `/join`, enter CODE, claim each color, add player names.
3. **Display (2)**: Verify all four teams show as claimed.
4. **Admin (1)**: Lock lobby → Load first question → Open question (set timer to 30s).
5. **Teams**: Each enters a retail price guess. One team locks early.
6. **Display**: Verify team status badges update (Thinking → Draft Saved → Locked) with NO guess values shown.
7. **Admin**: Pause timer → Resume timer → Force close when ready.
8. **Admin**: Reveal paid price.
9. **Display**: Verify price appears with animation. Verify points show.
10. **Teams**: Verify each team sees their own point awards.
11. **Admin**: Show leaderboard → Load next question. Repeat.
12. **Tie test**: Arrange two teams to have identical retail guesses (both closest). Admin closes question. Verify tie-break input appears only on eligible team windows. Submit benchmark guesses. Admin resolves tie.
13. **Refresh test**: Reload one team window mid-question. Verify it reconnects and shows last saved draft.
14. **Admin**: Emergency score correction — adjust one team's score.
15. **Admin**: Advance to Complete phase. Verify winner shown everywhere.

### Pass criteria

- [ ] All six windows stay synchronized throughout
- [ ] No retailer names appear on team or display windows
- [ ] No paid price appears before reveal phase
- [ ] Timer countdown matches across all windows (within 1s)
- [ ] Refresh/reconnect restores correct state
- [ ] Tie-break input only appears on eligible teams
- [ ] Scoring matches spec: closest ≤ paid = 3pts, second closest ≤ paid = 1pt, exact = +1pt, all-over closest = 1pt
- [ ] Score corrections appear in leaderboard immediately
- [ ] Public display never shows guess values

---

## 7. Product Library Management

- View/edit products: `/admin/products` (requires ADMIN_SETUP_KEY)
- Build lineup: `/admin/lineup`
- Import: POST JSON or CSV to `/api/admin/products/import` with `x-setup-key` header
- Upload images: POST multipart/form-data to `/api/admin/upload-image`

### CSV format

```csv
id,public_name,game_price_paid,price_status,public_image_path,ready_for_game
P001,Cream Sherpa Throw,10.00,confirmed_paid_price,/products/p001.jpg,true
```

---

## 8. Known Confirmed Paid Prices

From data/admin/product-library.private.json:

| Product | Paid Price |
|---------|-----------|
| Beats Pill | $99.99 |
| Beats Solo Buds | $69.99 |

Remaining products need receipts confirmed before `ready_for_game = true`.
