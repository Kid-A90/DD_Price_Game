import { describe, expect, it } from "vitest";
import { buildScorePlan, resolveTieGroups, topScoreTie, totalAwards } from "../lib/game/scoring";

const S = (teamId: string, retailGuess: number | null, benchmarkGuess?: number | null) => ({ teamId, retailGuess, benchmarkGuess });

describe("paid-price scoring", () => {
  it("scores closest and second closest without going over", () => {
    const plan = buildScorePlan([S("red", 20), S("blue", 24), S("yellow", 23), S("green", 30)], 25);
    expect(plan.status).toBe("resolved");
    expect(totalAwards(plan.awards)).toEqual({ blue: 3, yellow: 1 });
  });

  it("adds the exact paid-price bonus", () => {
    const plan = buildScorePlan([S("red", 25), S("blue", 24), S("yellow", 20), S("green", null)], 25);
    expect(totalAwards(plan.awards)).toEqual({ red: 4, blue: 1 });
    expect(plan.noSubmissionTeamIds).toEqual(["green"]);
  });

  it("awards one point to the closest overall when everyone goes over", () => {
    const plan = buildScorePlan([S("red", 26), S("blue", 30), S("yellow", 40), S("green", null)], 25);
    expect(totalAwards(plan.awards)).toEqual({ red: 1 });
  });

  it("opens a benchmark tie-break only for the tied point-bearing teams", () => {
    const plan = buildScorePlan([S("red", 24), S("blue", 24), S("yellow", 20), S("green", 18)], 25);
    expect(plan.status).toBe("needs_tie_break");
    expect(plan.tieGroups).toHaveLength(1);
    expect(plan.tieGroups[0].eligibleTeamIds).toEqual(["blue", "red"]);
    expect(plan.tieGroups[0].points).toBe(3);
  });

  it("resolves the tied slot using the closest benchmark-cost guess", () => {
    const submissions = [S("red", 24, 4.5), S("blue", 24, 5.8), S("yellow", 20), S("green", 18)];
    const plan = buildScorePlan(submissions, 25);
    const result = resolveTieGroups(plan, submissions, 5);
    expect(result.status).toBe("resolved");
    expect(totalAwards(result.awards)).toEqual({ yellow: 1, red: 3 });
  });

  it("leaves an exact benchmark tie unresolved for admin fallback", () => {
    const submissions = [S("red", 24, 4), S("blue", 24, 6), S("yellow", 20), S("green", 18)];
    const plan = buildScorePlan(submissions, 25);
    const result = resolveTieGroups(plan, submissions, 5);
    expect(result.status).toBe("still_tied");
    expect(result.unresolvedGroups).toHaveLength(1);
  });

  it("detects a final top-score tie", () => {
    expect(topScoreTie({ red: 12, blue: 18, yellow: 18, green: 9 })).toEqual(["blue", "yellow"]);
  });
});
