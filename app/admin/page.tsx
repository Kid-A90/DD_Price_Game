"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RetroStage } from "@/components/RetroStage";
import { useAnonAuth } from "@/lib/supabase/useAnonAuth";

interface SessionSummary {
  id: string;
  code: string;
  title: string;
  phase: string;
  adminUserId: string;
  createdAt: string;
  teamsClaimed: number;
}

export default function AdminSetupPage() {
  const router = useRouter();
  const { userId, loading } = useAnonAuth();
  const [setupKey, setSetupKey] = useState("");
  const [title, setTitle] = useState("Designs Direct Live Price Game");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);

  async function createSession() {
    if (!userId) { setError("Device not ready. Wait a moment."); return; }
    if (!code || !/^[A-Z0-9]{4,8}$/.test(code)) {
      setError("Code must be 4–8 uppercase letters/numbers.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupKey, title, code, adminUserId: userId }),
    });
    const body = await res.json();
    if (!res.ok) { setError(body.error ?? "Unknown error"); setBusy(false); return; }
    router.push(`/admin/${code}`);
  }

  async function loadSessions() {
    if (!setupKey) { setError("Enter the setup key first."); return; }
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupKey }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { setError(body.error ?? "Unknown error"); return; }
    setSessions(body.sessions);
  }

  async function manage(sessionCode: string, action: "end" | "delete" | "takeover") {
    if (action === "delete" && !window.confirm(`Permanently delete game ${sessionCode}? Teams, questions, and scores are erased.`)) {
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/manage-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupKey, code: sessionCode, action, adminUserId: userId }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { setError(body.error ?? "Unknown error"); return; }
    if (action === "takeover") { router.push(`/admin/${sessionCode}`); return; }
    await loadSessions();
  }

  function openSession(s: SessionSummary) {
    if (s.adminUserId === userId) router.push(`/admin/${s.code}`);
    else manage(s.code, "takeover");
  }

  if (loading) {
    return (
      <RetroStage label="Admin Setup">
        <div className="stage-panel"><p className="page-lead">Loading…</p></div>
      </RetroStage>
    );
  }

  return (
    <RetroStage label="Admin Setup">
      <section className="stage-panel">
        <h1 className="page-title">Game Sessions</h1>
        <p className="page-lead">
          Enter the admin setup key, then create a new game or manage an existing one.
        </p>

        <div className="admin-setup-form">
          <label className="admin-label">
            Setup Key
            <input
              className="admin-input"
              type="password"
              value={setupKey}
              onChange={(e) => setSetupKey(e.target.value)}
              placeholder="ADMIN_SETUP_KEY value"
              autoComplete="off"
            />
          </label>
          <label className="admin-label">
            Session Title
            <input
              className="admin-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Designs Direct Live Price Game"
            />
          </label>
          <label className="admin-label">
            Session Code
            <input
              className="admin-input join-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="GAME"
              maxLength={8}
              autoCapitalize="characters"
              autoComplete="off"
            />
            <span className="admin-hint">Teams will type this to join (4–8 chars).</span>
          </label>

          {error && <p className="error-msg">{error}</p>}

          <div className="actions">
            <button className="btn-primary" onClick={createSession} disabled={busy || loading}>
              {busy ? "Working…" : "Create Session"}
            </button>
            <button className="btn-ghost" onClick={loadSessions} disabled={busy || loading}>
              Show Existing Games
            </button>
          </div>
        </div>

        {sessions !== null && (
          <div className="control-group" style={{ marginTop: "2rem" }}>
            <h2 className="admin-section-title">Existing Games ({sessions.length})</h2>
            {sessions.length === 0 && <p className="admin-hint">No games yet.</p>}
            <div className="admin-team-table">
              {sessions.map((s) => (
                <div key={s.id} className="admin-team-row">
                  <span className="admin-team-color">{s.code}</span>
                  <span className="admin-team-name">
                    {s.title}
                    <span className="admin-hint" style={{ display: "block" }}>
                      {new Date(s.createdAt).toLocaleString()} · {s.teamsClaimed}/4 teams
                      {s.adminUserId === userId ? " · this device is admin" : ""}
                    </span>
                  </span>
                  <span className="admin-team-status">{s.phase.replace(/_/g, " ")}</span>
                  <button className="btn-ghost btn-sm" onClick={() => openSession(s)} disabled={busy}>
                    {s.adminUserId === userId ? "Open" : "Take Over"}
                  </button>
                  {s.phase !== "complete" && (
                    <button className="btn-ghost btn-sm" onClick={() => manage(s.code, "end")} disabled={busy}>
                      End
                    </button>
                  )}
                  <button className="btn-danger btn-sm" onClick={() => manage(s.code, "delete")} disabled={busy}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="notice private-warning" style={{ marginTop: "2rem" }}>
          Retailer, receipt, paid-price, and benchmark-cost data are admin-only.
          Never shown to teams or on the public display.
        </div>
      </section>
    </RetroStage>
  );
}
