# Acceptance Tests

## Build and safety

- `npm run validate:data` passes.
- Unit tests pass.
- Production build passes.
- No private folder is included in build output.
- Team/display network payloads contain no retailer name or unrevealed price.

## Six-session test

Open:

- Team Red browser
- Team Blue browser
- Team Yellow browser
- Team Green browser
- Public Display browser
- Admin browser

Use separate browser profiles or incognito windows so each has a distinct anonymous user.

## Team claim

- Each color can be claimed once.
- Same device cannot own two colors.
- Claimed team persists after refresh.
- Names persist after refresh.
- Admin can release and reassign a team.
- Lobby lock prevents new claims and name edits.

## Timer and drafts

- All screens show the same deadline within normal network latency.
- Draft saves while typing.
- Early lock works.
- Last valid draft is finalized at zero.
- Blank at zero becomes no submission.
- Late write is rejected.
- Pause/resume preserves the correct remaining time.
- Force-close finalizes all on-time drafts.

## Privacy

- Public display shows only status before reveal.
- Team cannot query another team's guess.
- Source images and receipts are inaccessible by public URL.
- Retailer names never appear on team or public screens.
- Paid price is absent from HTML/JSON before reveal.

## Scoring

- Closest without going over gets 3.
- Second closest gets 1.
- Exact paid price gets an additional 1.
- All-over case gets 1 to closest overall.
- No submission gets 0.
- Duplicate admin click does not duplicate points.
- Score totals match the score-event ledger.

## Tie-break

- No benchmark field appears during normal play.
- Equal non-scoring guesses do not trigger a tie-break.
- Equal point-bearing guesses trigger only eligible teams.
- Retail price stays hidden during tie-break.
- Closest benchmark guess receives the tied slot.
- Missing benchmark guess loses eligibility at timeout.
- Exact benchmark tie presents the admin fallback choice.

## Recovery

- Team refresh reconnects to its team.
- Display refresh restores current stage.
- Admin refresh restores current phase.
- Temporary network loss catches up from durable state.
- Stale admin action is rejected by state version.
