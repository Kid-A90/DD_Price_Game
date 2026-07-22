import type { GamePhase } from "./types";

const allowed: Record<GamePhase, GamePhase[]> = {
  lobby: ["question_ready"],
  question_ready: ["question_open", "lobby"],
  question_open: ["question_locked"],
  question_locked: ["tie_break_open", "reveal"],
  tie_break_open: ["tie_break_locked"],
  tie_break_locked: ["reveal"],
  reveal: ["leaderboard"],
  leaderboard: ["question_ready", "showcase", "complete"],
  showcase: ["question_open", "complete"],
  complete: ["lobby"]
};

export function canTransition(from: GamePhase, to: GamePhase): boolean {
  return allowed[from].includes(to);
}

export function assertTransition(from: GamePhase, to: GamePhase): void {
  if (!canTransition(from, to)) throw new Error(`Invalid game transition: ${from} -> ${to}`);
}
