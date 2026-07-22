"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { RetroStage } from "@/components/RetroStage";
import { useAnonAuth } from "@/lib/supabase/useAnonAuth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { rowToPublicState, rowToSessionQuestion } from "@/lib/supabase/mappers";
import type { PublicState, SessionQuestion } from "@/lib/supabase/types";

const COLOR_NAMES = { red: "Red", blue: "Blue", yellow: "Yellow", green: "Green" };

export default function AdminPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { userId, loading: authLoading } = useAnonAuth();

  const [pub, setPub] = useState<PublicState | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stateVersion, setStateVersion] = useState<number>(0);
  const [questions, setQuestions] = useState<SessionQuestion[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [timerSecs, setTimerSecs] = useState("60");
  const [correctionTeamId, setCorrectionTeamId] = useState("");
  const [correctionPts, setCorrectionPts] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Auto-close: fire close RPC if we detect deadline has passed
  const deadlineFiredRef = useRef(false);

  // ── Session lookup ──
  useEffect(() => {
    if (!userId) return;
    const sb = createSupabaseBrowserClient();
    sb.from("game_sessions")
      .select("id, admin_user_id, state_version")
      .eq("code", code.toUpperCase())
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { setIsAdmin(false); return; }
        setSessionId(data.id);
        setStateVersion(data.state_version ?? 0);
        setIsAdmin(data.admin_user_id === userId);
      });
  }, [userId, code]);

  // ── Subscribe to public state ──
  useEffect(() => {
    if (!sessionId) return;
    const sb = createSupabaseBrowserClient();
    sb.from("session_public_state")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle()
      .then(({ data }) => { if (data) { const s = rowToPublicState(data); setPub(s); setStateVersion(s.stateVersion); } });

    const channel = sb
      .channel(`admin:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_public_state", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (payload.new && Object.keys(payload.new).length) {
            const s = rowToPublicState(payload.new);
            setPub(s);
            setStateVersion(s.stateVersion);
            deadlineFiredRef.current = false;
          }
        }
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [sessionId]);

  // ── Load questions ──
  const loadQuestions = useCallback(async () => {
    if (!sessionId) return;
    const sb = createSupabaseBrowserClient();
    const { data } = await sb.rpc("admin_get_session_questions", { p_session_id: sessionId });
    if (data) setQuestions((data as unknown[]).map(rowToSessionQuestion));
  }, [sessionId]);

  useEffect(() => { loadQuestions(); }, [loadQuestions]);

  // ── Countdown ──
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (!pub?.deadlineAt) { setSecondsLeft(null); return; }
    function tick() {
      const ms = new Date(pub!.deadlineAt!).getTime() - Date.now();
      const s = Math.max(0, Math.ceil(ms / 1000));
      setSecondsLeft(s);
      if (s === 0 && !deadlineFiredRef.current && pub?.phase === "question_open") {
        deadlineFiredRef.current = true;
        autoClose();
      }
    }
    tick();
    tickRef.current = setInterval(tick, 500);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pub?.deadlineAt]);

  async function autoClose() {
    if (!sessionId) return;
    const sb = createSupabaseBrowserClient();
    await sb.rpc("admin_close_question_auto", { p_session_id: sessionId });
  }

  async function rpc(fn: string, args: Record<string, unknown>) {
    if (!sessionId || busy) return;
    setBusy(true);
    setMsg("");
    const sb = createSupabaseBrowserClient();

    // Always read the authoritative version right before mutating, so a
    // missed realtime update never produces a stale-version error.
    async function freshVersion(): Promise<number> {
      const { data: sess } = await sb
        .from("game_sessions")
        .select("state_version")
        .eq("id", sessionId)
        .maybeSingle();
      return Number(sess?.state_version ?? stateVersion);
    }

    let version = await freshVersion();
    let { data, error } = await sb.rpc(fn, { p_session_id: sessionId, p_state_version: version, ...args });

    // Real race (e.g. auto-close landed mid-click): refresh once and retry.
    if (error && /stale state version/i.test(error.message)) {
      version = await freshVersion();
      ({ data, error } = await sb.rpc(fn, { p_session_id: sessionId, p_state_version: version, ...args }));
    }

    setStateVersion(version + 1);
    if (error) setMsg(`Error: ${error.message}`);
    else if (data?.status) setMsg(`Status: ${data.status}`);
    setBusy(false);
    if (!error) loadQuestions();
    return data;
  }

  async function lockLobby() { await rpc("admin_lock_lobby", {}); }
  async function unlockLobby() { await rpc("admin_unlock_lobby", {}); }
  async function loadQuestion() {
    const q = questions.find((q) => !q.openedAt);
    if (!q) { setMsg("No unplayed questions remaining."); return; }
    await rpc("admin_load_question", { p_question_id: q.id });
  }
  async function openQuestion() {
    if (!pub?.currentQuestionId) { setMsg("Load a question first."); return; }
    await rpc("admin_open_question", { p_override_seconds: parseInt(timerSecs, 10) });
  }
  async function pauseTimer() { await rpc("admin_pause_timer", { p_question_id: pub?.currentQuestionId }); }
  async function resumeTimer() { await rpc("admin_resume_timer", { p_question_id: pub?.currentQuestionId }); }
  async function forceClose() {
    if (!pub?.currentQuestionId) return;
    const result = await rpc("admin_close_question", { p_question_id: pub.currentQuestionId });
    if (result?.status === "tie_required") setMsg(`Tie-break required for: ${result.tieGroups?.map((g: { colors: string[] }) => g.colors.join(", ")).join(" | ")}`);
  }
  async function reveal() {
    if (!pub?.currentQuestionId) return;
    await rpc("admin_reveal_question", { p_question_id: pub.currentQuestionId });
  }
  async function advance() {
    const defaultNext = pub?.phase === "reveal" ? "leaderboard" : "question_ready";
    await rpc("admin_advance", { p_target: defaultNext });
  }
  async function closeTieBreak() {
    await rpc("admin_close_tie_break", { p_question_id: pub?.currentQuestionId });
  }
  async function setEqualPoints() {
    if (!pub?.currentQuestionId) return;
    const tied = pub.tieBreakEligibleColors;
    const tiedTeamIds = pub.teamStatuses
      .filter((t) => tied.includes(t.color))
      .map((t) => (t as unknown as { teamId: string }).teamId)
      .filter(Boolean);
    await rpc("admin_set_equal_points", { p_question_id: pub.currentQuestionId, p_team_ids: tiedTeamIds });
  }
  async function releaseTeam(color: string) {
    if (!sessionId) return;
    setBusy(true);
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.rpc("admin_release_team", { p_session_id: sessionId, p_color: color });
    if (error) setMsg(`Error: ${error.message}`);
    setBusy(false);
  }
  async function correctScore() {
    if (!correctionTeamId || !correctionPts || !correctionReason) {
      setMsg("Fill in team, points, and reason for correction.");
      return;
    }
    if (!sessionId) return;
    setBusy(true);
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.rpc("admin_correct_score", {
      p_session_id: sessionId,
      p_team_id: correctionTeamId,
      p_delta: parseInt(correctionPts, 10),
      p_reason: correctionReason,
    });
    if (error) setMsg(`Error: ${error.message}`);
    else { setMsg("Score correction applied."); setCorrectionTeamId(""); setCorrectionPts(""); setCorrectionReason(""); }
    setBusy(false);
  }

  if (authLoading || isAdmin === null) {
    return <RetroStage label="Loading…"><div className="stage-panel"><p className="page-lead">Connecting…</p></div></RetroStage>;
  }
  if (!isAdmin) {
    return (
      <RetroStage label="Admin Control">
        <div className="stage-panel">
          <h1 className="page-title">Not Authorized</h1>
          <p className="page-lead">This device is not the admin for session {code.toUpperCase()}.</p>
          <button className="btn-ghost" onClick={() => router.push("/admin")}>← Go to Admin Setup</button>
        </div>
      </RetroStage>
    );
  }

  const phase = pub?.phase ?? "lobby";

  return (
    <RetroStage label={`Admin · ${code.toUpperCase()}`}>
      <section className="stage-panel admin-console">
        {/* Status bar */}
        <div className="admin-status-bar">
          <span className="admin-phase-badge">{phase.replace(/_/g, " ").toUpperCase()}</span>
          {pub?.productName && <span className="admin-product-name">{pub.productName}</span>}
          {secondsLeft !== null && (
            <span className={`admin-timer${secondsLeft <= 5 ? " urgent" : ""}`}>{secondsLeft}s</span>
          )}
          {pub?.deadlineAt === null && pub?.phase === "question_open" && (
            <span className="admin-timer paused">PAUSED</span>
          )}
          <span className="admin-version">v{stateVersion}</span>
        </div>

        {msg && (
          <div className={`admin-msg${msg.startsWith("Error") ? " error" : ""}`} onClick={() => setMsg("")}>
            {msg}
          </div>
        )}

        {/* Lobby controls */}
        {phase === "lobby" && (
          <div className="control-group">
            <h2 className="admin-section-title">Lobby</h2>
            <div className="control-grid">
              <button className="btn-primary" onClick={lockLobby} disabled={busy}>Lock Lobby</button>
              <button className="btn-ghost" onClick={unlockLobby} disabled={busy}>Unlock Lobby</button>
              <button className="btn-primary" onClick={loadQuestion} disabled={busy}>Load First Question →</button>
            </div>
          </div>
        )}

        {/* Question ready */}
        {phase === "question_ready" && (
          <div className="control-group">
            <h2 className="admin-section-title">Question Ready</h2>
            <div className="control-grid">
              <label className="admin-label">
                Timer (seconds)
                <input className="admin-input" type="number" min="10" max="300" value={timerSecs}
                  onChange={(e) => setTimerSecs(e.target.value)} />
              </label>
              <button className="btn-primary" onClick={openQuestion} disabled={busy}>Open Question</button>
            </div>
          </div>
        )}

        {/* Question open */}
        {phase === "question_open" && (
          <div className="control-group">
            <h2 className="admin-section-title">Question Open</h2>
            <div className="control-grid">
              <button className="btn-ghost" onClick={pauseTimer} disabled={busy}>Pause Timer</button>
              <button className="btn-ghost" onClick={resumeTimer} disabled={busy}>Resume Timer</button>
              <button className="btn-danger" onClick={forceClose} disabled={busy}>Force Close</button>
            </div>
          </div>
        )}

        {/* Question locked */}
        {phase === "question_locked" && (
          <div className="control-group">
            <h2 className="admin-section-title">Question Locked</h2>
            <div className="control-grid">
              <button className="btn-primary" onClick={reveal} disabled={busy}>Reveal Paid Price</button>
            </div>
          </div>
        )}

        {/* Tie-break */}
        {(phase === "tie_break_open" || phase === "tie_break_locked") && (
          <div className="control-group">
            <h2 className="admin-section-title">Tie-Break</h2>
            <p className="admin-hint">
              Tied: {pub?.tieBreakEligibleColors.map((c) => COLOR_NAMES[c]).join(", ")}
            </p>
            <div className="control-grid">
              <button className="btn-primary" onClick={closeTieBreak} disabled={busy}>Score Benchmark Guesses</button>
              <button className="btn-ghost" onClick={setEqualPoints} disabled={busy}>Award Equal Points</button>
            </div>
          </div>
        )}

        {/* Reveal */}
        {phase === "reveal" && (
          <div className="control-group">
            <h2 className="admin-section-title">Reveal</h2>
            {pub?.revealPaidPrice !== null && (
              <p className="admin-hint">Answer: ${(pub?.revealPaidPrice ?? 0).toFixed(2)}</p>
            )}
            <div className="control-grid">
              <button className="btn-primary" onClick={advance} disabled={busy}>Show Leaderboard →</button>
            </div>
          </div>
        )}

        {/* Leaderboard */}
        {phase === "leaderboard" && (
          <div className="control-group">
            <h2 className="admin-section-title">Leaderboard</h2>
            <div className="control-grid">
              <button className="btn-primary" onClick={loadQuestion} disabled={busy}>Load Next Question →</button>
              <button className="btn-primary" onClick={() => rpc("showcase_admin", { p_action: "start" })} disabled={busy}>
                Start Team Showcase ★
              </button>
            </div>
          </div>
        )}

        {/* Team Showcase host controls */}
        {phase === "showcase" && (() => {
          const sc = pub?.showcase;
          if (!sc) return <div className="control-group"><p className="admin-hint">Loading showcase…</p></div>;
          const revealed = sc.prizes.filter((p) => p.revealed).length;
          const totalPrizes = sc.prizes.length;
          const drawn = sc.assignments.length;
          const totalDraws = Math.min(sc.players.length, totalPrizes);
          return (
            <div className="control-group">
              <h2 className="admin-section-title">Team Showcase</h2>
              <p className="admin-hint">
                Winner: {sc.winningTeamName} · stage: {sc.phase}
                {sc.bid !== null ? ` · bid locked: $${sc.bid.toFixed(2)}` : sc.bidEntered ? " · bid entered (not locked)" : " · no bid yet"}
                {sc.actualTotal !== null ? ` · actual total: $${sc.actualTotal.toFixed(2)}` : ""}
              </p>
              <div className="control-grid">
                {sc.phase === "intro" && (
                  <button className="btn-primary" onClick={() => rpc("showcase_admin", { p_action: "open_bidding" })} disabled={busy}>
                    Open Bidding
                  </button>
                )}
                {sc.phase === "bidding" && (
                  <button className="btn-primary" onClick={() => rpc("showcase_admin", { p_action: "lock_bid" })} disabled={busy}>
                    Lock Bid
                  </button>
                )}
                {(sc.phase === "locked" || sc.phase === "revealing") && revealed < totalPrizes && (
                  <button className="btn-primary" onClick={() => rpc("showcase_admin", { p_action: "reveal_next" })} disabled={busy}>
                    Reveal Prize {revealed + 1} of {totalPrizes}
                  </button>
                )}
                {sc.phase === "revealing" && revealed >= totalPrizes && (
                  <button className="btn-primary" onClick={() => rpc("showcase_admin", { p_action: "reveal_total" })} disabled={busy}>
                    Reveal Showcase Total
                  </button>
                )}
                {sc.phase === "total" && (
                  <button className="btn-primary" onClick={() => rpc("showcase_admin", { p_action: "result" })} disabled={busy}>
                    Show Verdict ★
                  </button>
                )}
                {sc.phase === "result" && (
                  <button className="btn-primary" onClick={() => rpc("showcase_admin", { p_action: "start_drawing" })} disabled={busy}>
                    Start Prize Drawing
                  </button>
                )}
                {sc.phase === "drawing" && drawn < totalDraws && (
                  <button className="btn-primary" onClick={() => rpc("showcase_admin", { p_action: "draw_next" })} disabled={busy}>
                    Draw Prize {drawn + 1} of {totalDraws}
                  </button>
                )}
                {sc.phase === "drawing" && drawn >= totalDraws && (
                  <button className="btn-primary" onClick={() => rpc("showcase_admin", { p_action: "finish" })} disabled={busy}>
                    Show Final Screen
                  </button>
                )}
                <button className="btn-danger" onClick={() => {
                  if (window.confirm("Reset the showcase? Bid, reveals, and drawing are cleared.")) {
                    rpc("showcase_admin", { p_action: "reset" });
                  }
                }} disabled={busy}>
                  Reset Showcase
                </button>
              </div>
            </div>
          );
        })()}

        {/* Teams */}
        <div className="control-group" style={{ marginTop: "2rem" }}>
          <h2 className="admin-section-title">Teams</h2>
          <div className="admin-team-table">
            {pub?.teamStatuses.map((t) => (
              <div key={t.color} className="admin-team-row">
                <span className="admin-team-color" style={{ color: `var(--${t.color})` }}>
                  {COLOR_NAMES[t.color]}
                </span>
                <span className="admin-team-name">{t.claimed ? t.displayName : "(unclaimed)"}</span>
                <span className="admin-team-score">{t.score} pts</span>
                <span className="admin-team-status">{t.status}</span>
                {t.claimed && (
                  <button className="btn-ghost btn-sm"
                    onClick={() => releaseTeam(t.color)}
                    disabled={busy}>
                    Release
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Leaderboard display */}
        {pub?.leaderboard && pub.leaderboard.length > 0 && (
          <div className="control-group" style={{ marginTop: "1rem" }}>
            <h2 className="admin-section-title">Scores</h2>
            <ol className="admin-leaderboard">
              {pub.leaderboard.map((e, i) => (
                <li key={e.color}>
                  #{i + 1} {e.displayName} — {e.score} pts
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Emergency correction */}
        <details className="control-group correction-panel" style={{ marginTop: "2rem" }}>
          <summary className="admin-section-title" style={{ cursor: "pointer" }}>
            Emergency Score Correction
          </summary>
          <div className="control-grid" style={{ marginTop: "1rem" }}>
            <label className="admin-label">
              Team ID
              <input className="admin-input" placeholder="uuid" value={correctionTeamId}
                onChange={(e) => setCorrectionTeamId(e.target.value)} />
            </label>
            <label className="admin-label">
              Points (±)
              <input className="admin-input" type="number" value={correctionPts}
                onChange={(e) => setCorrectionPts(e.target.value)} />
            </label>
            <label className="admin-label">
              Reason
              <input className="admin-input" placeholder="admin_correction" value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)} />
            </label>
            <button className="btn-danger" onClick={correctScore} disabled={busy}>Apply Correction</button>
          </div>
        </details>

        {/* Questions list */}
        <details className="control-group" style={{ marginTop: "2rem" }}>
          <summary className="admin-section-title" style={{ cursor: "pointer" }}>
            Question Lineup ({questions.length})
          </summary>
          <div style={{ marginTop: "1rem" }}>
            {questions.map((q, i) => (
              <div key={q.id} className={`admin-question-row${pub?.currentQuestionId === q.id ? " current" : ""}`}>
                <span>#{i + 1}</span>
                <span>{q.publicNameSnapshot}</span>
                <span>${Number(q.answerPaidPrice).toFixed(2)} paid</span>
                <span>{q.openedAt ? (q.revealedAt ? "Done" : "Open") : "Queued"}</span>
              </div>
            ))}
          </div>
        </details>
      </section>
    </RetroStage>
  );
}
