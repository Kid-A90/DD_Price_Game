"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { MarqueeBulbs } from "./MarqueeBulbs";
import { WinBurst } from "./WinBurst";
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
  const teamColor = COLOR_HEX[sc.winningColor];
  const revealedCount = sc.prizes.filter((p) => p.revealed).length;
  const showTotals = ["revealing", "total", "result", "drawing", "done"].includes(sc.phase);
  const totalKnown = sc.actualTotal !== null;
  const running = useCountUp(totalKnown ? sc.actualTotal! : sc.runningTotal);

  // ── Intro ──
  if (sc.phase === "intro") {
    return (
      <div className="showcase-intro">
        <MarqueeBulbs count={24} animating />
        <h1 className="showcase-title">Team Showcase</h1>
        <p className="showcase-subtitle">
          Guess the combined retail price of all five prizes. Closest without going over wins!
        </p>
        <div className="showcase-team-banner" style={{ "--bay-color": teamColor } as React.CSSProperties}>
          {sc.winningTeamName} — come on down!
        </div>
      </div>
    );
  }

  // ── Drawing / final ──
  if (sc.phase === "drawing" || sc.phase === "done") {
    const drawnPlayers = new Set(sc.assignments.map((a) => a.player));
    return (
      <div className="showcase-drawing">
        <h1 className="showcase-title small">
          {sc.phase === "done" ? `Congratulations, ${sc.winningTeamName}!` : "Prize Drawing"}
        </h1>
        <p className="showcase-subtitle">
          {sc.phase === "done"
            ? "Here's what everyone takes home."
            : "Each team member wins a prize — drawn at random!"}
        </p>
        <div className="drawing-grid">
          {sc.assignments.map((a, i) => (
            <div key={a.player + i} className="drawing-card drawn">
              {a.prizeImage && (
                <Image src={a.prizeImage} width={200} height={200} alt={a.prizeName} className="drawing-img" />
              )}
              <span className="drawing-player">{a.player}</span>
              <span className="drawing-prize">{a.prizeName}</span>
            </div>
          ))}
          {sc.phase === "drawing" &&
            sc.players
              .filter((p) => !drawnPlayers.has(p))
              .slice(0, Math.max(0, Math.min(sc.players.length, sc.prizes.length) - sc.assignments.length))
              .map((p) => (
                <div key={p} className="drawing-card pending">
                  <span className="drawing-mystery">?</span>
                  <span className="drawing-player">{p}</span>
                  <span className="drawing-prize">drawing…</span>
                </div>
              ))}
        </div>
        {sc.phase === "done" && sc.bonusPrizes.length > 0 && (
          <p className="showcase-subtitle" style={{ marginTop: "1rem" }}>
            Team bonus prizes: {sc.bonusPrizes.map((b) => b.name).join(", ")}
          </p>
        )}
        {sc.phase === "done" && (
          <div className="burst-container" style={{ marginTop: "0.5rem" }}>
            <WinBurst visible />
          </div>
        )}
      </div>
    );
  }

  // ── Platform phases: bidding → result ──
  return (
    <div className="showcase-main">
      <h1 className="showcase-title small">Team Showcase</h1>
      {sc.phase === "bidding" && (
        <p className="showcase-subtitle">
          Guess the combined retail price of all five prizes. Closest without going over wins!
        </p>
      )}

      <div className="showcase-platform-wrap">
        <div className="showcase-platform">
          {sc.prizes.map((p, i) => {
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

      <div className="showcase-status-row">
        <div className="showcase-bid-chip" style={{ "--bay-color": teamColor } as React.CSSProperties}>
          <span className="sbc-label">{sc.winningTeamName}</span>
          <span className="sbc-value">
            {sc.bid !== null
              ? `Bid: $${sc.bid.toFixed(2)}`
              : sc.bidEntered
                ? "Bid entered…"
                : "Thinking…"}
          </span>
        </div>
        {showTotals && (
          <div className={`showcase-total-board${totalKnown ? " final" : ""}`}>
            <span className="stb-label">{totalKnown ? "Actual Total" : "Running Total"}</span>
            <span className="stb-value">${running.toFixed(2)}</span>
          </div>
        )}
      </div>

      {sc.phase === "result" && sc.won !== null && (
        <div className="showcase-verdict">
          <div className="burst-container">
            <WinBurst visible={sc.won} />
            <div className={`showcase-verdict-text${sc.won ? " win" : " lose"}`}>
              {sc.won ? "SHOWCASE WON!" : "OVER THE TOTAL!"}
            </div>
          </div>
          {!compact && sc.bid !== null && sc.actualTotal !== null && (
            <p className="showcase-subtitle">
              Bid ${sc.bid.toFixed(2)} vs. actual ${sc.actualTotal.toFixed(2)}
              {sc.won ? ` — under by $${(sc.actualTotal - sc.bid).toFixed(2)}!` : " — the bid went over."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
