# Gameplay and State Machine

## Devices

- Four team laptops
- One public projector computer
- One admin computer

All six connect to the same session code.

## Lobby

1. Admin creates a session and receives a short code.
2. Team laptop enters the code.
3. Device signs in anonymously behind the scenes.
4. Team chooses one unclaimed color: red, blue, yellow, or green.
5. Team enters one to five names.
6. A transactional claim prevents duplicate ownership.
7. The device remains tied to that team across refresh.
8. Admin can release or reassign a device when necessary.
9. Public display shows the claimed teams and player names.
10. Admin locks the lobby before play.

## Normal question

1. Admin selects `Open Question`.
2. Server sets `opened_at` and authoritative `deadline_at`.
3. Public display shows neutral product name, approved image, timer, and team status.
4. Each team sees a very large currency input.
5. Valid drafts save to the server while typing.
6. Team may lock early.
7. At deadline, the server finalizes the last valid draft saved on time.
8. Blank or invalid means no submission.
9. Public display never shows guess values before reveal.
10. Admin may force-close early.

## Retail scoring

- Closest without going over: 3 points
- Second closest without going over: 1 point
- Exact paid price: +1 point
- If all teams go over: closest overall gets 1 point
- No submission: 0 points

## Conditional average-cost tie-break

A tie-break opens only when equal retail guesses affect a point-bearing slot.

1. Server computes the retail score plan privately.
2. If no point-bearing tie exists, skip directly to ready-to-reveal.
3. If a point-bearing tie exists, set phase to `tie_break_open`.
4. Only eligible tied teams receive an `Average Cost Guess` field.
5. Other teams see a waiting state.
6. Retail answer remains hidden.
7. Server compares tied guesses to the admin-provided `benchmarkCost`.
8. Closest absolute difference receives the tied retail points.
9. No routine benchmark bonus exists.
10. If still exactly tied, admin explicitly chooses equal points or sudden death.

## Reveal

1. Admin triggers reveal only after scoring is resolved.
2. Public state receives the paid price, point awards, and animation cue.
3. Public display animates the paid price, team result, and score change.
4. Team screens show their guess, result, and updated total.
5. Admin advances to leaderboard or next question.

## Final tie

If two or more teams share the highest final score, launch a separate mystery-item average-cost tie-break for only the tied leaders. Closest benchmark guess wins the game.

## Required phase sequence

```text
lobby
  -> question_ready
  -> question_open
  -> question_locked
  -> tie_break_open      (only when needed)
  -> tie_break_locked    (only when needed)
  -> reveal
  -> leaderboard
  -> question_ready | showcase | complete
```

Every admin action must include the expected `state_version`. Reject stale or duplicate transitions.
