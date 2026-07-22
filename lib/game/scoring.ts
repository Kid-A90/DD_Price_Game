import type { RetailSubmission, ScoreAward, ScorePlan, TieGroup, TieResolution } from "./types";

const EPSILON = 0.00001;

function isValidMoney(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function sameMoney(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

function makeTieGroup(slot: TieGroup["slot"], points: number, retailGuess: number, teamIds: string[]): TieGroup {
  return {
    id: `${slot}:${retailGuess.toFixed(2)}:${teamIds.slice().sort().join("-")}`,
    slot,
    points,
    retailGuess,
    eligibleTeamIds: teamIds.slice().sort()
  };
}

/**
 * Builds a deterministic scoring plan without exposing the answer to clients.
 * The game answer is always the exact paid price configured by the admin.
 * A benchmark-cost tie-break is requested only when an equal retail guess
 * affects a point-bearing slot.
 */
export function buildScorePlan(submissions: RetailSubmission[], answerPaidPrice: number): ScorePlan {
  if (!isValidMoney(answerPaidPrice)) throw new Error("answerPaidPrice must be a valid non-negative number");

  const valid = submissions.filter((entry) => isValidMoney(entry.retailGuess)) as Array<RetailSubmission & { retailGuess: number }>;
  const noSubmissionTeamIds = submissions.filter((entry) => !isValidMoney(entry.retailGuess)).map((entry) => entry.teamId);
  const awards: ScoreAward[] = [];
  const tieGroups: TieGroup[] = [];

  // Exact paid-price bonus applies independently from the point-bearing slot.
  for (const entry of valid) {
    if (sameMoney(entry.retailGuess, answerPaidPrice)) {
      awards.push({ teamId: entry.teamId, points: 1, reason: "exact_paid_price" });
    }
  }

  const atOrUnder = valid.filter((entry) => entry.retailGuess <= answerPaidPrice + EPSILON);

  if (atOrUnder.length > 0) {
    const distinctValues = Array.from(new Set(atOrUnder.map((entry) => entry.retailGuess.toFixed(2))))
      .map(Number)
      .sort((a, b) => b - a);

    const firstValue = distinctValues[0];
    const first = atOrUnder.filter((entry) => sameMoney(entry.retailGuess, firstValue));
    if (first.length === 1) {
      awards.push({ teamId: first[0].teamId, points: 3, reason: "closest_without_going_over" });
    } else {
      tieGroups.push(makeTieGroup("first", 3, firstValue, first.map((entry) => entry.teamId)));
    }

    const secondValue = distinctValues[1];
    if (typeof secondValue === "number") {
      const second = atOrUnder.filter((entry) => sameMoney(entry.retailGuess, secondValue));
      if (second.length === 1) {
        awards.push({ teamId: second[0].teamId, points: 1, reason: "second_closest" });
      } else {
        tieGroups.push(makeTieGroup("second", 1, secondValue, second.map((entry) => entry.teamId)));
      }
    }
  } else if (valid.length > 0) {
    const closestDistance = Math.min(...valid.map((entry) => Math.abs(entry.retailGuess - answerPaidPrice)));
    const closest = valid.filter((entry) => sameMoney(Math.abs(entry.retailGuess - answerPaidPrice), closestDistance));
    if (closest.length === 1) {
      awards.push({ teamId: closest[0].teamId, points: 1, reason: "all_over_closest" });
    } else {
      tieGroups.push(makeTieGroup("all_over", 1, closest[0].retailGuess, closest.map((entry) => entry.teamId)));
    }
  }

  return {
    status: tieGroups.length ? "needs_tie_break" : "resolved",
    answerPaidPrice,
    awards,
    tieGroups,
    noSubmissionTeamIds
  };
}

/** Resolve only the tied point-bearing slots using the admin-provided benchmark cost. */
export function resolveTieGroups(plan: ScorePlan, submissions: RetailSubmission[], benchmarkCost: number): TieResolution {
  if (!isValidMoney(benchmarkCost)) throw new Error("benchmarkCost must be a valid non-negative number");

  const byTeam = new Map(submissions.map((entry) => [entry.teamId, entry]));
  const awards = [...plan.awards];
  const unresolvedGroups: TieGroup[] = [];

  for (const group of plan.tieGroups) {
    const eligible = group.eligibleTeamIds
      .map((teamId) => byTeam.get(teamId))
      .filter((entry): entry is RetailSubmission => Boolean(entry) && isValidMoney(entry?.benchmarkGuess));

    if (eligible.length === 0) {
      unresolvedGroups.push(group);
      continue;
    }

    const bestDistance = Math.min(...eligible.map((entry) => Math.abs((entry.benchmarkGuess as number) - benchmarkCost)));
    const winners = eligible.filter((entry) => sameMoney(Math.abs((entry.benchmarkGuess as number) - benchmarkCost), bestDistance));

    if (winners.length !== 1) {
      unresolvedGroups.push(group);
      continue;
    }

    awards.push({ teamId: winners[0].teamId, points: group.points, reason: "tie_break_winner" });
  }

  return {
    status: unresolvedGroups.length ? "still_tied" : "resolved",
    awards,
    unresolvedGroups
  };
}

export function totalAwards(awards: ScoreAward[]): Record<string, number> {
  return awards.reduce<Record<string, number>>((totals, award) => {
    totals[award.teamId] = (totals[award.teamId] ?? 0) + award.points;
    return totals;
  }, {});
}

export function topScoreTie(scores: Record<string, number>): string[] {
  const entries = Object.entries(scores);
  if (!entries.length) return [];
  const top = Math.max(...entries.map(([, score]) => score));
  return entries.filter(([, score]) => score === top).map(([teamId]) => teamId).sort();
}
