"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { RetroStage } from "@/components/RetroStage";
import { MarqueeBulbs } from "@/components/MarqueeBulbs";
import { DoorLoading } from "@/components/DoorLoading";
import { WinBurst } from "@/components/WinBurst";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { playCue } from "@/lib/sound/synth";
import type { PublicState, TeamColor } from "@/lib/supabase/types";

const COLOR_HEX: Record<TeamColor, string> = {
  red: "var(--red)",
  blue: "var(--blue)",
  yellow: "var(--yellow)",
  green: "var(--green)",
};
const COLORS: TeamColor[] = ["red", "blue", "yellow", "green"];

export default function DisplayPage() {
  const { code } = useParams<{ code: string }>();
  const [pub, setPub] = useState<PublicState | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPhaseRef = useRef<string | null>(null);
  const [revealVisible, setRevealVisible] = useState(false);

  // Look up session by code, then subscribe
  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    sb.from("game_sessions")
      .select("id")
      .eq("code", code.toUpperCase())
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setSessionId(data.id);
        // Initial state fetch
        sb.from("session_public_state")
          .select("state")
          .eq("session_id", data.id)
          .maybeSingle()
          .then(({ data: s }) => { if (s) setPub(s.state as PublicState); });
      });
  }, [code]);

  // Subscribe once we have sessionId
  useEffect(() => {
    if (!sessionId) return;
    const sb = createSupabaseBrowserClient();
    const channel = sb
      .channel(`display:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_public_state", filter: `session_id=eq.${sessionId}` },
        (payload) => { if (payload.new) setPub((payload.new as { state: PublicState }).state); }
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [sessionId]);

  // Phase change effects
  useEffect(() => {
    if (!pub) return;
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = pub.phase;
    if (prev === pub.phase) return;

    setRevealVisible(false);
    if (pub.phase === "reveal") {
      setTimeout(() => setRevealVisible(true), 800);
      playCue("reveal");
    }
    if (pub.phase === "question_open") playCue("tick");
    if (pub.phase === "question_locked") playCue("lock");
  }, [pub?.phase]);

  // Countdown
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (!pub?.deadlineAt) { setSecondsLeft(null); return; }
    function tick() {
      const ms = new Date(pub!.deadlineAt!).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(ms / 1000)));
    }
    tick();
    tickRef.current = setInterval(tick, 500);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [pub?.deadlineAt]);

  const phase = pub?.phase ?? "lobby";

  if (!pub) {
    return <DoorLoading message="Stand by…" />;
  }

  return (
    <RetroStage label={`Public Display · ${code.toUpperCase()}`}>

      {/* ── LOBBY ── */}
      {phase === "lobby" && (
        <section className="stage-panel display-board" style={{ textAlign: "center" }}>
          <MarqueeBulbs count={24} animating />
          <Image
            src="/ui/tpir-logo.webp"
            alt="The Price Is Right"
            width={595}
            height={672}
            className="lobby-logo"
            priority
          />
          <p className="page-lead">The game starts soon. Come on down!</p>
          {pub && (
            <div className="team-bay-strip">
              {pub.teamStatuses.map((t) => (
                <div key={t.color}
                  className={`team-bay-cell${t.claimed ? "" : " empty"}`}
                  style={{ "--bay-color": COLOR_HEX[t.color] } as React.CSSProperties}>
                  <span className={`tbc-name${t.color === "yellow" ? " yellow" : ""}`}>
                    {t.claimed ? t.displayName : "—"}
                  </span>
                  {t.claimed && t.playerNames.length > 0 && (
                    <span className={`tbc-players${t.color === "yellow" ? " yellow" : ""}`}>
                      {t.playerNames.slice(0, 3).join(" · ")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── QUESTION READY ── */}
      {phase === "question_ready" && (
        <section className="stage-panel display-board" style={{ textAlign: "center" }}>
          <MarqueeBulbs count={24} animating />
          <h1 className="page-title" style={{ marginTop: "1.5rem" }}>Get Ready!</h1>
          {pub?.roundLabel && <p className="page-lead">{pub.roundLabel}</p>}
        </section>
      )}

      {/* ── QUESTION OPEN ── */}
      {phase === "question_open" && pub && (
        <section className="stage-panel display-board">
          {pub.publicImagePath && (
            <div className="product-pedestal">
              <div className="display-product-window">
                <Image
                  src={pub.publicImagePath}
                  fill
                  style={{ objectFit: "contain" }}
                  alt={pub.productName ?? "Product"}
                  priority
                />
              </div>
              <div className="product-pedestal-cap" />
              <div className="product-pedestal-base" />
            </div>
          )}
          <h1 className="display-product-name">{pub.productName}</h1>

          <div className={`display-timer${secondsLeft !== null && secondsLeft <= 5 ? " urgent" : ""}`}>
            {secondsLeft !== null ? `${secondsLeft}s` : "PAUSED"}
          </div>

          {/* Team status bays — no guess values shown */}
          <div className="team-bay-strip">
            {pub.teamStatuses.map((t) => (
              <div key={t.color}
                className={`team-bay-cell${t.claimed ? "" : " empty"}`}
                style={{ "--bay-color": COLOR_HEX[t.color] } as React.CSSProperties}>
                <span className={`tbc-name${t.color === "yellow" ? " yellow" : ""}`}>
                  {t.displayName}
                </span>
                <span className={`tbc-status${t.color === "yellow" ? " yellow" : ""}`}>
                  {statusLabel(t.status)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── QUESTION LOCKED ── */}
      {phase === "question_locked" && pub && (
        <section className="stage-panel display-board" style={{ textAlign: "center" }}>
          <h1 className="page-title">All In!</h1>
          <p className="page-lead">Guesses locked. Preparing reveal…</p>
          <div className="team-bay-strip">
            {pub.teamStatuses.map((t) => (
              <div key={t.color}
                className={`team-bay-cell${t.claimed ? "" : " empty"}`}
                style={{ "--bay-color": COLOR_HEX[t.color] } as React.CSSProperties}>
                <span className={`tbc-name${t.color === "yellow" ? " yellow" : ""}`}>
                  {t.displayName}
                </span>
                <span className={`tbc-status${t.color === "yellow" ? " yellow" : ""}`}>
                  {statusLabel(t.status)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── TIE BREAK ── */}
      {(phase === "tie_break_open" || phase === "tie_break_locked") && pub && (
        <section className="stage-panel display-board" style={{ textAlign: "center" }}>
          <h1 className="page-title" style={{ color: "var(--gold)" }}>Tie-Break!</h1>
          <p className="page-lead">
            {pub.tieBreakEligibleColors
              .map((c) => pub.teamStatuses.find((t) => t.color === c)?.displayName ?? c)
              .join(" vs. ")} are tied!
          </p>
          <p className="page-lead" style={{ opacity: 0.7 }}>Eligible teams are entering their average-cost guess.</p>
        </section>
      )}

      {/* ── REVEAL ── */}
      {phase === "reveal" && pub && (
        <section className="stage-panel display-board" style={{ textAlign: "center" }}>
          {pub.productName && <h1 className="display-product-name">{pub.productName}</h1>}
          <div className="burst-container">
            <WinBurst visible={revealVisible} />
            <div className={`reveal-price-display${revealVisible ? " visible" : ""}`}>
              {pub.revealPaidPrice !== null
                ? `$${Number(pub.revealPaidPrice).toFixed(2)}`
                : "—"}
            </div>
          </div>
          {pub.pointAwards && revealVisible && (
            <div className="display-awards">
              {pub.pointAwards.map((a, i) => (
                <div key={i} className="display-award-row"
                  style={{ "--bay-color": COLOR_HEX[a.color] } as React.CSSProperties}>
                  <span className="bay-dot" />
                  <span className="da-name">
                    {pub.teamStatuses.find((t) => t.color === a.color)?.displayName ?? a.color}
                  </span>
                  <span className="da-pts">+{a.points}</span>
                  <span className="da-reason">{a.reason.replace(/_/g, " ")}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── LEADERBOARD ── */}
      {phase === "leaderboard" && pub && (
        <section className="stage-panel display-board" style={{ textAlign: "center" }}>
          <h1 className="page-title">Leaderboard</h1>
          <ol className="leaderboard display-leaderboard">
            {pub.leaderboard.map((e, i) => (
              <li key={e.color} className="lb-row"
                style={{ "--bay-color": COLOR_HEX[e.color] } as React.CSSProperties}>
                <span className="lb-rank">#{i + 1}</span>
                <span className="bay-dot" />
                <span className="lb-name">{e.displayName}</span>
                <span className="lb-pts">{e.score} pts</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── SHOWCASE / COMPLETE ── */}
      {(phase === "showcase" || phase === "complete") && pub && (
        <section className="stage-panel display-board" style={{ textAlign: "center" }}>
          <MarqueeBulbs count={24} animating />
          <h1 className="page-title" style={{ marginTop: "1.5rem" }}>
            {phase === "complete" ? "Thank You for Playing!" : "Showcase Round!"}
          </h1>
          {pub.leaderboard[0] && (
            <p className="page-lead">
              Winner:{" "}
              <strong style={{ color: COLOR_HEX[pub.leaderboard[0].color] }}>
                {pub.leaderboard[0].displayName}
              </strong>{" "}
              — {pub.leaderboard[0].score} points
            </p>
          )}
        </section>
      )}
    </RetroStage>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "waiting": return "Waiting";
    case "thinking": return "Thinking…";
    case "draft_saved": return "Draft Saved";
    case "locked": return "Locked In";
    case "no_submission": return "No Guess";
    default: return status;
  }
}
