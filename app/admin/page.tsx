"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RetroStage } from "@/components/RetroStage";
import { useAnonAuth } from "@/lib/supabase/useAnonAuth";

export default function AdminSetupPage() {
  const router = useRouter();
  const { userId, loading } = useAnonAuth();
  const [setupKey, setSetupKey] = useState("");
  const [title, setTitle] = useState("Designs Direct Live Price Game");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
        <h1 className="page-title">Create Game Session</h1>
        <p className="page-lead">
          Enter the admin setup key and choose a session code. Share the code with teams and the public display.
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

          <button className="btn-primary" onClick={createSession} disabled={busy || loading}>
            {busy ? "Creating…" : "Create Session"}
          </button>
        </div>

        <div className="notice private-warning" style={{ marginTop: "2rem" }}>
          Retailer, receipt, paid-price, and benchmark-cost data are admin-only.
          Never shown to teams or on the public display.
        </div>
      </section>
    </RetroStage>
  );
}
