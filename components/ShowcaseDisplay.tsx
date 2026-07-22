"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { MarqueeBulbs } from "./MarqueeBulbs";
import { WinBurst } from "./WinBurst";
import { DoorReveal } from "./DoorReveal";
import type { ShowcasePublic, TeamColor } from "@/lib/supabase/types";

const COLOR_HEX: Record<TeamColor, string> = {
  red: "var(--red)",
  blue: "var(--blue)",
  yellow: "var(--yellow)",
  green: "var(--green)",
};

/** Animates a number toward its target with an ease-out ramp. */
function useCountUp(target: number, ms = 900): number {
  const [val, setVal] = useState(target);
  const prevTarget = useRef(target);
  useEffect(() => {
    const from = prevTarget.current;
    prevTarget.current = target;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      setVal(from + (target - from) * eased);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}

export function ShowcaseDisplay({ sc, compact = false }: { sc: ShowcasePublic; compact?: boolean }) {
  const showTotals = ["revealing", "total", "result", "drawing", "done"].includes(sc.phase);
  const totalKnown = sc.actualTotal !== null;
  const running = useCountUp(totalKnown ? sc.actualTotal! : sc.runningTotal);

  // ── PTO grand prize ──
  if (sc.phase === "pto") {
    return (
      <div className="showcase-intro">
        <DoorReveal
          label={`${sc.gameWinnerName} wins the game!`}
          title="A BRAND NEW PTO DAY!"
          subtitle={`One extra PTO day for every member of ${sc.gameWinnerName}!`}
          color={COLOR_HEX[sc.gameWinnerColor]}
        />
      </div>
    );
  }

  // ── Intro ──
  if (sc.phase === "intro") {
    return (
      <div className="showcase-intro">
        <MarqueeBulbs count={24} animating />
        <h1 className="showcase-title">Team Showcase</h1>
        <p className="showcase-subtitle">
          Every team bids on the combined retail price of all five prizes.
          Closest without going over wins the package!
        </p>
      </div>
    );
  }

  // ── Drawing / final ──
  if (sc.phase === "drawing" || sc.phase === "done") {
    const drawnPlayers = new Set(sc.assignments.map((a) => a.player));
    const remaining = sc.players.filter((p) => !drawnPlayers.has(p));
    const totalDraws = Math.min(sc.players.length, sc.prizes.length);
    const nextPrize = sc.phase === "drawing" && sc.assignments.length < totalDraws
      ? sc.prizes[sc.assignments.length]
      : null;
    return (
      <div className="showcase-drawing">
        <h1 className="showcase-title small">
          {sc.phase === "done" ? `Congratulations, ${sc.winnerName ?? "champions"}!` : "Prize Drawing"}
        </h1>
        <p className="showcase-subtitle">
          {sc.phase === "done"
            ? "Here's what everyone takes home."
            : "Cheapest to most expensive — one random winner per prize!"}
        </p>
        <div className="drawing-grid">
          {sc.assignments.map((a, i) => (
            <div key={a.prizeKey + i} className="drawing-card drawn">
              {a.prizeImage && (
                <Image src={a.prizeImage} width={200} height={200} alt={a.prizeName} className="drawing-img" />
              )}
              <span className="drawing-prize">{a.prizeName}</span>
              <span className="drawing-player">{a.player}</span>
            </div>
          ))}
          {nextPrize && (
            <div className="drawing-card pending">
              {nextPrize.image && (
                <Image src={nextPrize.image} width={200} height={200} alt={nextPrize.name} className="drawing-img dim" />
              )}
              <span className="drawing-prize">{nextPrize.name}</span>
              <span className="drawing-mystery">?</span>
            </div>
          )}
        </div>
        {sc.phase === "drawing" && remaining.length > 0 && (
          <p className="showcase-subtitle" style={{ opacity: .8 }}>
            Still in the running: {remaining.join(" · ")}
          </p>
        )}
        {sc.phase === "done" && sc.bonusPrizes.length > 0 && (
          <p className="showcase-subtitle" style={{ marginTop: "1rem" }}>
            Team bonus prizes: {sc.bonusPrizes.map((b) => b.name).join(", ")}
          </p>
        )}
        {sc.phase === "done" && (
          <div className="burst-container" style={{ marginTop: "0.5rem", minHeight: 80 }}>
            <WinBurst visible />
          </div>
        )}
      </div>
    );
  }

  // ── Result: showcase winner doors ──
  if (sc.phase === "result" && sc.winnerName) {
    return (
      <div className="showcase-main">
        <DoorReveal
          label="The Showcase goes to…"
          title={`${sc.winnerName.toUpperCase()} WINS!`}
          color={sc.winnerColor ? COLOR_HEX[sc.winnerColor] : undefined}
        />
        {!compact && sc.actualTotal !== null && (
          <div className="showcase-bid-compare">
            <span className="sbc-total">Actual total: ${sc.actualTotal.toFixed(2)}</span>
            {sc.teamBids.filter((b) => b.bid !== null).map((b) => (
              <span key={b.color} className="sbc-line" style={{ "--bay-color": COLOR_HEX[b.color] } as React.CSSProperties}>
                <span className="bay-dot" /> {b.displayName}: ${b.bid!.toFixed(2)}
                {b.bid! > sc.actualTotal! ? " (over)" : ""}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Platform phases: bidding → total ──
  const claimedBids = sc.teamBids;
  const lockedCount = claimedBids.filter((b) => b.locked).length;
  return (
    <div className="showcase-main">
      <h1 className="showcase-title small">Team Showcase</h1>
      {sc.phase === "bidding" && (
        <p className="showcase-subtitle">
          Every team: bid the combined retail price. Closest without going over wins!
        </p>
      )}

      <div className="showcase-platform-wrap">
        <div className="showcase-platform">
          {sc.prizes.map((p, i) => {
            const revealedCount = sc.prizes.filter((x) => x.revealed).length;
            const justRevealed = p.revealed && i === revealedCount - 1 && sc.phase === "revealing";
            return (
              <div key={p.key} className={`showcase-prize${p.revealed ? " revealed" : ""}${justRevealed ? " just-revealed" : ""}`}>
                {p.image && (
                  <Image src={p.image} width={220} height={220} alt={p.name} className="showcase-prize-img" />
                )}
                <span className="sp-name">{p.name}</span>
                <span className={`sp-price${p.revealed ? " lit" : ""}`}>
                  {p.revealed && p.price !== null ? `$${p.price.toFixed(2)}` : "?"}
                </span>
              </div>
            );
          })}
        </div>
        <div className="showcase-platform-cap" />
        <div className="showcase-platform-base" />
      </div>

      {/* All teams' bid status / values */}
      <div className="team-bay-strip" style={{ marginTop: 18 }}>
        {claimedBids.map((b) => {
          const yellow = b.color === "yellow" ? " yellow" : "";
          return (
            <div key={b.color} className="team-bay-cell"
              style={{ "--bay-color": COLOR_HEX[b.color] } as React.CSSProperties}>
              <span className={`tbc-name${yellow}`}>{b.displayName}</span>
              {b.bid !== null ? (
                <span className={`tbc-guess${yellow}`}>${b.bid.toFixed(2)}</span>
              ) : (
                <span className={`tbc-status${yellow}`}>{b.locked ? "Locked In" : "Thinking…"}</span>
              )}
            </div>
          );
        })}
      </div>
      {sc.phase === "bidding" && (
        <p className="showcase-subtitle" style={{ opacity: .75 }}>
          {lockedCount} of {claimedBids.length} teams locked in
        </p>
      )}

      {showTotals && (
        <div className="showcase-status-row">
          <div className={`showcase-total-board${totalKnown ? " final" : ""}`}>
            <span className="stb-label">{totalKnown ? "Actual Total" : "Running Total"}</span>
            <span className="stb-value">${running.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
