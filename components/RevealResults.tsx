import type { PublicState, TeamColor } from "@/lib/supabase/types";

const COLOR_HEX: Record<TeamColor, string> = {
  red: "var(--red)",
  blue: "var(--blue)",
  yellow: "var(--yellow)",
  green: "var(--green)",
};

/** Every claimed team's guess and points earned, shown at reveal. */
export function RevealResults({ pub }: { pub: PublicState }) {
  const awardsByColor: Partial<Record<TeamColor, { points: number; reasons: string[] }>> = {};
  for (const a of pub.pointAwards ?? []) {
    const entry = (awardsByColor[a.color] ??= { points: 0, reasons: [] });
    entry.points += a.points;
    entry.reasons.push(a.reason.replace(/_/g, " "));
  }
  const claimed = pub.teamStatuses.filter((t) => t.claimed);
  if (claimed.length === 0) return null;

  return (
    <div className="team-bay-strip reveal-results">
      {claimed.map((t) => {
        const award = awardsByColor[t.color];
        const yellow = t.color === "yellow" ? " yellow" : "";
        return (
          <div
            key={t.color}
            className={`team-bay-cell${award ? " winner" : ""}`}
            style={{ "--bay-color": COLOR_HEX[t.color] } as React.CSSProperties}
          >
            <span className={`tbc-name${yellow}`}>{t.displayName}</span>
            <span className={`tbc-guess${yellow}`}>
              {t.finalGuess != null ? `$${Number(t.finalGuess).toFixed(2)}` : "No guess"}
            </span>
            {award ? (
              <span className="tbc-points">+{award.points} · {award.reasons.join(" & ")}</span>
            ) : (
              <span className={`tbc-points none${yellow}`}>+0</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
