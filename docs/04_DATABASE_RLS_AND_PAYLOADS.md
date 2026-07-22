# Database, RLS, and Payload Contracts

## Tables

### `game_sessions`
Private authoritative phase, admin owner, state version, and current question.

### `teams`
Color, team names, anonymous device owner, and total score.

### `products`
Private product library including retailer, paid price, regular price, benchmark cost, source path, and approval status.

### `session_questions`
Ordered snapshot of the exact product name, approved image, paid-price answer, benchmark cost, deadline, score plan, and awards for one session.

### `submissions`
Team-owned retail draft/final answer, lock state, tie eligibility, and benchmark guess.

### `score_events`
Append-only idempotent score ledger. Team totals can be checked against this ledger.

### `admin_audit_log`
Emergency corrections, reopens, device releases, and other privileged actions.

### `session_public_state`
Sanitized realtime state for team/public screens.

## RLS principles

- Enable RLS on every public-schema table.
- Anonymous signed-in devices use the `authenticated` role.
- Public/team clients can read safe state and roster.
- A team can read/write only its own submission row.
- Products, questions, receipts, score ledger, and audit log are never broadly client-readable.
- Admin mutations happen through checked RPCs or server routes.
- Service-role access is used only by server-side import/seed jobs.

## Safe public payload before reveal

```json
{
  "phase": "question_open",
  "currentQuestionId": "...",
  "productName": "Cream botanical pillow",
  "publicImagePath": "/products/approved/P015.png",
  "deadlineAt": "2026-07-23T14:30:30Z",
  "teamStatuses": [
    { "color": "red", "status": "locked" },
    { "color": "blue", "status": "draft_saved" }
  ],
  "revealPaidPrice": null,
  "pointAwards": null
}
```

## Fields forbidden before reveal

```text
paid_price
regular_price_private
candidate_paid_price
benchmark_cost
retailer_private
retail_draft
retail_final
benchmark_guess
receipt path
source image path
```

## Idempotency

Every score event must have a deterministic key such as:

```text
session:{sessionId}:question:{questionId}:team:{teamId}:reason:{reason}
```

Unique keys prevent double points if the admin clicks twice or a request retries.
