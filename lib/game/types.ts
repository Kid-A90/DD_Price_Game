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

export type RetailSubmission = {
  teamId: string;
  retailGuess: number | null;
  benchmarkGuess?: number | null;
};

export type ScoreAward = {
  teamId: string;
  points: number;
  reason: "closest_without_going_over" | "second_closest" | "exact_paid_price" | "all_over_closest" | "tie_break_winner";
};

export type TieGroup = {
  id: string;
  slot: "first" | "second" | "all_over";
  points: number;
  retailGuess: number;
  eligibleTeamIds: string[];
};

export type ScorePlan = {
  status: "resolved" | "needs_tie_break";
  answerPaidPrice: number;
  awards: ScoreAward[];
  tieGroups: TieGroup[];
  noSubmissionTeamIds: string[];
};

export type TieResolution = {
  status: "resolved" | "still_tied";
  awards: ScoreAward[];
  unresolvedGroups: TieGroup[];
};
