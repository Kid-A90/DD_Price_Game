# Tonight: Claude Handoff Sequence

## Fastest path

1. Unzip this folder and open the extracted root in Claude Code.
2. Paste the full contents of `ONE_SHOT_PROMPT.md`.
3. Tell Claude to work through the repository in stages and run checks after each stage.
4. Create a Supabase project, enable anonymous sign-ins, and provide only the environment values requested in `.env.example`.
5. Run the SQL migrations in order.
6. Deploy the Next.js project to Vercel after local team, display, and admin routes work.

## What Claude should build first

1. Session creation and session-code join flow.
2. Atomic team claiming with one to five player names.
3. Server-synchronized question timer and draft saving.
4. Automatic close at zero, including blank = no submission.
5. Server-side paid-price scoring.
6. Conditional average-cost tie-break for eligible tied teams only.
7. Sanitized realtime projector state.
8. Admin pace controls.
9. Product library and lineup editor.
10. Final visual, animation, and sound pass.

## Do not spend time on these tonight

- Do not guess missing paid prices.
- Do not publish source photos or receipts.
- Do not treat filename prices as confirmed answers.
- Do not recreate the supplied television references pixel for pixel.
- Do not make the public projector responsible for calculating scores.

## Tomorrow's update

Fill in `data/admin/tomorrow-warmup-entry-template.csv`, add exact source photos privately, create approved store-free product images, and import the five warm-up rows through the admin product editor.
