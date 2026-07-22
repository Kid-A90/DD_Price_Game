"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { RetroStage } from "@/components/RetroStage";
import { MarqueeBulbs } from "@/components/MarqueeBulbs";
import { DoorLoading } from "@/components/DoorLoading";
import { RevealResults } from "@/components/RevealResults";
import { WinBurst } from "@/components/WinBurst";
import { ShowcaseDisplay } from "@/components/ShowcaseDisplay";
import { useAnonAuth } from "@/lib/supabase/useAnonAuth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { rowToPublicState } from "@/lib/supabase/mappers";
import { playCue } from "@/lib/sound/synth";
import type { PublicState, ClaimedTeam, OwnSubmission, TeamColor } from "@/lib/supabase/types";

const COLOR_HEX: Record<TeamColor, string> = {
  red: "var(--red)",
  blue: "var(--blue)",
  yellow: "var(--yellow)",
  green: "var(--green)",
};

function formatDollars(n: number | null): string {
  if (n === null) return "";
  return n.toFixed(2);
}
function parseDollars(s: string): number | null {
  const v = parseFloat(s.replace(/[^0-9.]/g, ""));
  if (isNaN(v) || v < 0) return null;
  return Math.round(v * 100) / 100;
}

export default function TeamPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { userId, loading: authLoading } = useAnonAuth();

  const [pub, setPub] = useState<PublicState | null>(null);
  const [team, setTeam] = useState<ClaimedTeam | null>(null);
  const [sub, setSub] = useState<OwnSubmission | null>(null);
  const [inputVal, setInputVal] = useState("");
  const [benchmarkVal, setBenchmarkVal] = useState("");
  const [showcaseBid, setShowcaseBid] = useState("");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showcaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPhaseRef = useRef<string | null>(null);

  // ── Load team identity from localStorage (set after claim) ──
  useEffect(() => {
    if (!userId || !code) return;
    const stored = localStorage.getItem(`dd_team_${code.toUpperCase()}`);
    if (stored) {
      try { setTeam(JSON.parse(stored)); } catch { /* ignore */ }
    }
    // DB recovery, scoped to THIS session's code — a device may own teams
    // in older sessions too, which must not shadow this one.
    const sb = createSupabaseBrowserClient();
    (async () => {
      const { data: sess } = await sb
        .from("game_sessions")
        .select("id")
        .eq("code", code.toUpperCase())
        .maybeSingle();
      if (!sess) { if (!stored) router.replace("/join"); return; }
      const { data } = await sb
        .from("teams")
        .select("id, session_id, color, display_name, player_names")
        .eq("session_id", sess.id)
        .eq("owner_user_id", userId)
        .maybeSingle();
      if (data) {
        const t: ClaimedTeam = {
          teamId: data.id,
          sessionId: data.session_id,
          color: data.color as TeamColor,
          displayName: data.display_name ?? data.color,
          playerNames: data.player_names ?? [],
        };
        setTeam(t);
        localStorage.setItem(`dd_team_${code.toUpperCase()}`, JSON.stringify(t));
      } else if (!stored) {
        router.replace(`/join`);
      }
    })();
  }, [userId, code, router]);

  // ── Subscribe to public state ──
  useEffect(() => {
    if (!team) return;
    const sb = createSupabaseBrowserClient();
    // Initial fetch
    sb.from("session_public_state")
      .select("*")
      .eq("session_id", team.sessionId)
      .maybeSingle()
      .then(({ data }) => { if (data) setPub(rowToPublicState(data)); });

    const channel = sb
      .channel(`pub:${team.sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_public_state", filter: `session_id=eq.${team.sessionId}` },
        (payload) => { if (payload.new && Object.keys(payload.new).length) setPub(rowToPublicState(payload.new)); }
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [team]);

  // ── Phase-change side effects ──
  useEffect(() => {
    if (!pub) return;
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = pub.phase;
    if (prev === pub.phase) return;

    if (pub.phase === "question_open") {
      playCue("tick");
      setInputVal("");
      setBenchmarkVal("");
      setLocked(false);
      setSub(null);
    }
    if (pub.phase === "question_locked" || pub.phase === "tie_break_locked") {
      playCue("lock");
    }
    if (pub.phase === "reveal") {
      const hasPoints = pub.pointAwards?.some((a) => a.color === team?.color && a.points > 0);
      playCue(hasPoints ? "winner" : "reveal");
    }
  }, [pub?.phase]);

  // ── Countdown timer driven by server deadline ──
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (!pub?.deadlineAt) { setSecondsLeft(null); return; }

    function tick() {
      const ms = new Date(pub!.deadlineAt!).getTime() - Date.now();
      const s = Math.max(0, Math.ceil(ms / 1000));
      setSecondsLeft(s);
      if (s <= 3 && s > 0) playCue("tick");
    }
    tick();
    tickRef.current = setInterval(tick, 500);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [pub?.deadlineAt]);

  // ── Fetch own submission when question changes ──
  useEffect(() => {
    if (!pub?.currentQuestionId || !team) return;
    const sb = createSupabaseBrowserClient();
    sb.from("submissions")
      .select("question_id, retail_draft, retail_final, benchmark_guess, status, tie_eligible, draft_updated_at, locked_at")
      .eq("question_id", pub.currentQuestionId)
      .eq("team_id", team.teamId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { setSub(null); return; }
        const s: OwnSubmission = {
          questionId: data.question_id,
          retailDraft: data.retail_draft,
          retailFinal: data.retail_final,
          benchmarkGuess: data.benchmark_guess,
          status: data.status,
          tieEligible: data.tie_eligible,
          draftUpdatedAt: data.draft_updated_at,
          lockedAt: data.locked_at,
        };
        setSub(s);
        if (data.retail_draft != null) setInputVal(formatDollars(data.retail_draft));
        if (data.retail_final != null) { setInputVal(formatDollars(data.retail_final)); setLocked(true); }
        if (data.benchmark_guess != null) setBenchmarkVal(formatDollars(data.benchmark_guess));
        if (data.status === "locked" || data.status === "auto_locked") setLocked(true);
      });
  }, [pub?.currentQuestionId, team]);

  // ── Debounced draft save ──
  const saveDraft = useCallback(async (dollars: number | null) => {
    if (!pub?.currentQuestionId) return;
    setSaving(true);
    const sb = createSupabaseBrowserClient();
    const { error: e } = await sb.rpc("save_retail_draft", {
      p_question_id: pub.currentQuestionId,
      p_guess: dollars,
    });
    if (e) setError(e.message);
    setSaving(false);
  }, [pub?.currentQuestionId]);

  function handleInput(val: string) {
    if (locked) return;
    setInputVal(val);
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => saveDraft(parseDollars(val)), 800);
  }

  async function lockGuess() {
    if (!pub?.currentQuestionId || locked) return;
    const dollars = parseDollars(inputVal);
    if (dollars === null || dollars <= 0) { setError("Enter a valid price."); return; }
    setError("");
    // Save draft first to ensure latest value is persisted before locking
    await saveDraft(dollars);
    const sb = createSupabaseBrowserClient();
    const { error: e } = await sb.rpc("lock_retail_guess", {
      p_question_id: pub.currentQuestionId,
    });
    if (e) { setError(e.message); return; }
    setLocked(true);
    playCue("lock");
  }

  async function saveBenchmark() {
    if (!pub?.currentQuestionId) return;
    const dollars = parseDollars(benchmarkVal);
    if (dollars === null || dollars <= 0) { setError("Enter a valid price."); return; }
    setError("");
    const sb = createSupabaseBrowserClient();
    const { error: e } = await sb.rpc("save_benchmark_guess", {
      p_question_id: pub.currentQuestionId,
      p_guess: dollars,
    });
    if (e) setError(e.message);
  }

  // ── Showcase bid (winning team only) ──
  const saveShowcaseBid = useCallback(async (dollars: number | null, lock: boolean) => {
    if (!team) return;
    if (lock && (dollars === null || dollars <= 0)) { setError("Enter a valid bid."); return; }
    setError("");
    const sb = createSupabaseBrowserClient();
    const { error: e } = await sb.rpc("showcase_team_bid", {
      p_session_id: team.sessionId,
      p_bid: dollars,
      p_lock: lock,
    });
    if (e) setError(e.message);
    else if (lock) playCue("lock");
  }, [team]);

  function handleShowcaseInput(val: string) {
    setShowcaseBid(val);
    if (showcaseTimerRef.current) clearTimeout(showcaseTimerRef.current);
    showcaseTimerRef.current = setTimeout(() => {
      const d = parseDollars(val);
      if (d !== null) saveShowcaseBid(d, false);
    }, 800);
  }

  // ── Determine if this team is tie-eligible ──
  const isTieEligible = pub?.tieBreakEligibleColors.includes(team?.color ?? "" as TeamColor) ?? false;

  if (authLoading || !team) {
    return <DoorLoading message="Connecting…" />;
  }

  const teamColor = COLOR_HEX[team.color];
  const phase = pub?.phase ?? "lobby";

  return (
    <RetroStage label={`${team.displayName} · ${code.toUpperCase()}`}>
      {/* Team identity bar */}
      <div className="team-id-bar" style={{ "--team-color": teamColor } as React.CSSProperties}>
        <span className="team-dot" />
        <span className="team-name">{team.displayName}</span>
        {team.playerNames.length > 0 && (
          <span className="player-names">{team.playerNames.join(" · ")}</span>
        )}
        {pub && <span className="phase-badge">{phase.replace(/_/g, " ")}</span>}
      </div>

      {/* ── LOBBY ── */}
      {(phase === "lobby") && (
        <section className="stage-panel">
          <MarqueeBulbs count={20} />
          <h2 className="page-title" style={{ marginTop: "1.5rem" }}>Waiting for the host…</h2>
          <p className="page-lead">The game will begin shortly. Stay on this page.</p>
          {pub && (
            <div className="lobby-roster">
              {pub.teamStatuses.map((t) => (
                <div key={t.color} className={`lobby-team ${t.claimed ? "active" : "empty"}`}
                  style={{ "--bay-color": COLOR_HEX[t.color] } as React.CSSProperties}>
                  <span className="bay-dot" />
                  <span>{t.claimed ? t.displayName : "—"}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── QUESTION READY ── */}
      {phase === "question_ready" && (
        <section className="stage-panel" style={{ textAlign: "center" }}>
          <MarqueeBulbs count={20} animating />
          <h2 className="page-title" style={{ marginTop: "1.5rem" }}>Get Ready!</h2>
          <p className="page-lead">The next question is about to open.</p>
        </section>
      )}

      {/* ── QUESTION OPEN ── */}
      {phase === "question_open" && pub && (
        <section className="stage-panel product-stage">
          {pub.publicImagePath && (
            <div className="product-frame">
              <Image
                src={pub.publicImagePath}
                fill
                style={{ objectFit: "cover" }}
                alt={pub.productName ?? "Product"}
                priority
              />
            </div>
          )}
          <h2 className="product-name">{pub.productName}</h2>

          {/* Countdown */}
          {secondsLeft !== null && (
            <div className={`countdown${secondsLeft <= 5 ? " urgent" : ""}`}>
              {secondsLeft}s
            </div>
          )}
          {secondsLeft === null && <div className="countdown paused">PAUSED</div>}

          {/* Price input */}
          {!locked ? (
            <div className="price-entry">
              <label className="price-label">Your Retail Price Guess</label>
              <div className="price-row">
                <span className="currency">$</span>
                <input
                  className="price-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={inputVal}
                  onChange={(e) => handleInput(e.target.value)}
                  placeholder="0.00"
                  aria-label="Retail price guess in dollars"
                  disabled={secondsLeft === 0}
                />
              </div>
              {saving && <span className="save-indicator">Saving…</span>}
              {error && <p className="error-msg">{error}</p>}
              <button
                className="btn-primary lock-btn"
                onClick={lockGuess}
                disabled={secondsLeft === 0}
              >
                Lock In
              </button>
            </div>
          ) : (
            <div className="locked-display">
              <span className="locked-label">LOCKED</span>
              <span className="locked-value">${inputVal}</span>
            </div>
          )}
        </section>
      )}

      {/* ── QUESTION LOCKED (waiting for scoring) ── */}
      {phase === "question_locked" && (
        <section className="stage-panel" style={{ textAlign: "center" }}>
          <h2 className="page-title">Time's Up!</h2>
          {locked
            ? <p className="page-lead">Your guess: <strong>${inputVal}</strong></p>
            : <p className="page-lead">No submission recorded.</p>
          }
          <p className="page-lead" style={{ opacity: 0.7 }}>Waiting for reveal…</p>
        </section>
      )}

      {/* ── TIE BREAK ── */}
      {(phase === "tie_break_open" || phase === "tie_break_locked") && (
        <section className="stage-panel" style={{ textAlign: "center" }}>
          {isTieEligible ? (
            <>
              <h2 className="page-title" style={{ color: "var(--gold)" }}>Tie-Break!</h2>
              <p className="page-lead">What do you think the store paid for this item on average?</p>
              <div className="price-entry">
                <label className="price-label">Average Cost Guess</label>
                <div className="price-row">
                  <span className="currency">$</span>
                  <input
                    className="price-input"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={benchmarkVal}
                    onChange={(e) => setBenchmarkVal(e.target.value)}
                    placeholder="0.00"
                    aria-label="Average cost guess"
                    disabled={phase === "tie_break_locked"}
                  />
                </div>
                {error && <p className="error-msg">{error}</p>}
                {phase === "tie_break_open" && (
                  <button className="btn-primary" onClick={saveBenchmark}>Submit</button>
                )}
              </div>
            </>
          ) : (
            <>
              <h2 className="page-title">Tie-Break in Progress</h2>
              <p className="page-lead">Another team is breaking the tie. Stand by.</p>
            </>
          )}
        </section>
      )}

      {/* ── REVEAL ── */}
      {phase === "reveal" && pub && (() => {
        const myAwards = pub.pointAwards?.filter((a) => a.color === team.color) ?? [];
        const iWon = myAwards.some((a) => a.points > 0);
        return (
          <section className="stage-panel" style={{ textAlign: "center" }}>
            <h2 className="page-title">The Price Is…</h2>
            {pub.revealPaidPrice !== null && (
              <div className="burst-container">
                <WinBurst visible={iWon} />
                <div className="reveal-price">
                  ${Number(pub.revealPaidPrice).toFixed(2)}
                </div>
              </div>
            )}
            {myAwards.length > 0 && (
              <div className="awards-list">
                {myAwards.map((a, i) => (
                  <div key={i} className="award-row">
                    <span className="award-pts">+{a.points}</span>
                    <span className="award-reason">{a.reason.replace(/_/g, " ")}</span>
                  </div>
                ))}
              </div>
            )}
            {myAwards.length === 0 && (
              <p className="page-lead" style={{ opacity: .7, marginTop: "1rem" }}>No points this round.</p>
            )}
            <RevealResults pub={pub} />
          </section>
        );
      })()}

      {/* ── LEADERBOARD ── */}
      {phase === "leaderboard" && pub && (
        <section className="stage-panel" style={{ textAlign: "center" }}>
          <h2 className="page-title">Leaderboard</h2>
          <ol className="leaderboard">
            {pub.leaderboard.map((e, i) => (
              <li key={e.color} className={`lb-row${e.color === team.color ? " mine" : ""}`}
                style={{ "--bay-color": COLOR_HEX[e.color] } as React.CSSProperties}>
                <span className="lb-rank">#{i + 1}</span>
                <span className="lb-name">{e.displayName}</span>
                <span className="lb-pts">{e.score} pts</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── TEAM SHOWCASE ── */}
      {phase === "showcase" && pub?.showcase && (() => {
        const sc = pub.showcase;
        const mine = sc.winningColor === team.color;
        const canBid = mine && (sc.phase === "intro" || sc.phase === "bidding");
        if (canBid) {
          return (
            <section className="stage-panel" style={{ textAlign: "center" }}>
              <h2 className="page-title" style={{ color: "var(--gold)" }}>Team Showcase</h2>
              <p className="page-lead">
                Guess the combined retail price of all five prizes. Closest without going over wins!
              </p>
              <div className="price-entry">
                <label className="price-label">Your Showcase Bid — all five prizes combined</label>
                <div className="price-row">
                  <span className="currency">$</span>
                  <input
                    className="price-input"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={showcaseBid}
                    onChange={(e) => handleShowcaseInput(e.target.value)}
                    placeholder="0.00"
                    aria-label="Showcase bid in dollars"
                    disabled={sc.phase !== "bidding"}
                  />
                </div>
                {sc.phase === "intro" && (
                  <p className="page-lead" style={{ opacity: 0.7 }}>Look at the prizes — bidding opens when the host is ready…</p>
                )}
                {error && <p className="error-msg">{error}</p>}
                {sc.phase === "bidding" && (
                  <button
                    className="btn-primary lock-btn"
                    onClick={() => saveShowcaseBid(parseDollars(showcaseBid), true)}
                  >
                    Lock In Bid
                  </button>
                )}
              </div>
            </section>
          );
        }
        return (
          <section className="stage-panel" style={{ textAlign: "center" }}>
            <ShowcaseDisplay sc={sc} compact />
          </section>
        );
      })()}

      {/* ── COMPLETE ── */}
      {(phase === "complete" || (phase === "showcase" && !pub?.showcase)) && pub && (
        <section className="stage-panel" style={{ textAlign: "center" }}>
          <MarqueeBulbs count={24} animating />
          <h2 className="page-title" style={{ marginTop: "1.5rem" }}>
            {phase === "complete" ? "Game Over!" : "Showcase!"}
          </h2>
          {pub.leaderboard[0] && (
            <p className="page-lead">
              Winner: <strong style={{ color: COLOR_HEX[pub.leaderboard[0].color] }}>
                {pub.leaderboard[0].displayName}
              </strong> with {pub.leaderboard[0].score} points!
            </p>
          )}
        </section>
      )}
    </RetroStage>
  );
}
