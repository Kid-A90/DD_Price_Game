/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PublicState, SessionQuestion } from "./types";

/**
 * session_public_state stores flat snake_case columns; realtime payloads and
 * selects deliver them as-is. Numeric columns arrive as strings from Postgres.
 */
export function rowToPublicState(row: any): PublicState {
  return {
    sessionId: row.session_id,
    code: row.code,
    phase: row.phase,
    currentQuestionId: row.current_question_id ?? null,
    roundLabel: row.round_label ?? null,
    questionLabel: row.question_label ?? null,
    productName: row.product_name ?? null,
    publicImagePath: row.public_image_path ?? null,
    deadlineAt: row.deadline_at ?? null,
    teamStatuses: row.team_statuses ?? [],
    tieBreakEligibleColors: row.tie_break_eligible_colors ?? [],
    revealPaidPrice: row.reveal_paid_price == null ? null : Number(row.reveal_paid_price),
    pointAwards: row.point_awards ?? null,
    leaderboard: row.leaderboard ?? [],
    animationCue: row.animation_cue ?? null,
    stateVersion: Number(row.state_version ?? 0),
    showcase: row.showcase ?? null,
  };
}

/** admin_get_session_questions returns snake_case columns. */
export function rowToSessionQuestion(row: any): SessionQuestion {
  return {
    id: row.id,
    position: row.position,
    roundKey: row.round_key,
    timerSeconds: row.timer_seconds,
    publicNameSnapshot: row.public_name_snapshot,
    publicImagePathSnapshot: row.public_image_path_snapshot ?? null,
    answerPaidPrice: row.answer_paid_price == null ? 0 : Number(row.answer_paid_price),
    benchmarkCost: row.benchmark_cost == null ? null : Number(row.benchmark_cost),
    openedAt: row.opened_at ?? null,
    closedAt: row.closed_at ?? null,
    revealedAt: row.revealed_at ?? null,
    finalAwards: row.final_awards ?? null,
    pendingScorePlan: row.pending_score_plan ?? null,
  };
}
