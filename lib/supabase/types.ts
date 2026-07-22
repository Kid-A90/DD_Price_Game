export type TeamColor = "red" | "blue" | "yellow" | "green";
export type GamePhase =
  | "lobby"
  | "question_ready"
  | "question_open"
  | "question_locked"
  | "tie_break_open"
  | "tie_break_locked"
  | "reveal"
  | "leaderboard"
  | "showcase"
  | "complete";

export type SubmissionStatus = "draft" | "locked" | "auto_locked" | "no_submission" | "late";

export type TeamStatus =
  | "waiting"
  | "thinking"
  | "draft_saved"
  | "locked"
  | "no_submission";

export interface TeamInfo {
  color: TeamColor;
  displayName: string;
  playerNames: string[];
  score: number;
  claimed: boolean;
  status: TeamStatus;
  tieEligible: boolean;
}

export interface LeaderboardEntry {
  color: TeamColor;
  displayName: string;
  playerNames: string[];
  score: number;
}

export interface PointAward {
  teamId: string;
  color: TeamColor;
  points: number;
  reason: string;
}

export interface PublicState {
  sessionId: string;
  code: string;
  phase: GamePhase;
  currentQuestionId: string | null;
  roundLabel: string | null;
  questionLabel: string | null;
  productName: string | null;
  publicImagePath: string | null;
  deadlineAt: string | null;
  teamStatuses: TeamInfo[];
  tieBreakEligibleColors: TeamColor[];
  revealPaidPrice: number | null;
  pointAwards: PointAward[] | null;
  leaderboard: LeaderboardEntry[];
  animationCue: string | null;
  stateVersion: number;
}

export interface SessionQuestion {
  id: string;
  position: number;
  roundKey: string;
  timerSeconds: number;
  publicNameSnapshot: string;
  publicImagePathSnapshot: string | null;
  answerPaidPrice: number;
  benchmarkCost: number | null;
  openedAt: string | null;
  closedAt: string | null;
  revealedAt: string | null;
  finalAwards: PointAward[] | null;
  pendingScorePlan: unknown | null;
}

export interface ClaimedTeam {
  teamId: string;
  sessionId: string;
  color: TeamColor;
  displayName: string;
  playerNames: string[];
}

export interface OwnSubmission {
  questionId: string;
  retailDraft: number | null;
  retailFinal: number | null;
  benchmarkGuess: number | null;
  status: SubmissionStatus;
  tieEligible: boolean;
  draftUpdatedAt: string | null;
  lockedAt: string | null;
}
