"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RetroStage } from "@/components/RetroStage";
import { DoorLoading } from "@/components/DoorLoading";
import { useAnonAuth } from "@/lib/supabase/useAnonAuth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { TeamColor } from "@/lib/supabase/types";

const COLORS: TeamColor[] = ["red", "blue", "yellow", "green"];
const COLOR_LABELS: Record<TeamColor, string> = {
  red: "Red Team",
  blue: "Blue Team",
  yellow: "Yellow Team",
  green: "Green Team",
};
const COLOR_HEX: Record<TeamColor, string> = {
  red: "var(--red)",
  blue: "var(--blue)",
  yellow: "var(--yellow)",
  green: "var(--green)",
};

interface TeamRow {
  id: string;
  color: TeamColor;
  owner_user_id: string | null;
  player_names: string[] | null;
  display_name: string | null;
}

export default function JoinPage() {
  const router = useRouter();
  const { userId, loading: authLoading } = useAnonAuth();

  const [code, setCode] = useState("");
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<TeamColor | null>(null);
  const [names, setNames] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState<"code" | "pick" | "names">("code");
  const [submitting, setSubmitting] = useState(false);

  const lookupSession = useCallback(async () => {
    if (!code.trim()) return;
    setError("");
    const sb = createSupabaseBrowserClient();
    const upper = code.trim().toUpperCase();
    const { data: session, error: se } = await sb
      .from("game_sessions")
      .select("id")
      .eq("code", upper)
      .maybeSingle();
    if (se || !session) {
      setError("Session code not found. Check with your host.");
      return;
    }
    setSessionId(session.id);
    const { data: teamRows } = await sb
      .from("teams")
      .select("id, color, owner_user_id, player_names, display_name")
      .eq("session_id", session.id);
    setTeams((teamRows as TeamRow[]) ?? []);
    setStep("pick");
  }, [code]);

  // Realtime team updates while on pick/names step
  useEffect(() => {
    if (!sessionId) return;
    const sb = createSupabaseBrowserClient();
    const channel = sb
      .channel(`teams:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teams", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setTeams((prev) => {
            const updated = payload.new as TeamRow;
            return prev.map((t) => (t.id === updated.id ? updated : t));
          });
        }
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [sessionId]);

  // Check if this device already owns a team in this session (refresh recovery)
  useEffect(() => {
    if (!sessionId || !userId || teams.length === 0) return;
    const mine = teams.find((t) => t.owner_user_id === userId);
    if (mine) {
      router.replace(`/team/${code.trim().toUpperCase()}`);
    }
  }, [sessionId, userId, teams, code, router]);

  async function claimTeam() {
    if (!selectedColor || !sessionId || !userId) return;
    const nameList = names
      .split(/[\n,]+/)
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, 5);
    if (nameList.length === 0) {
      setError("Enter at least one player name.");
      return;
    }
    setSubmitting(true);
    setError("");
    const sb = createSupabaseBrowserClient();
    const { data, error: rpcErr } = await sb.rpc("claim_team", {
      p_session_code: code.trim().toUpperCase(),
      p_color: selectedColor,
      p_player_names: nameList,
    });
    if (rpcErr) {
      setError(rpcErr.message.includes("already claimed")
        ? "That color was just claimed. Pick another."
        : rpcErr.message);
      setSubmitting(false);
      return;
    }
    // Persist the claim immediately so the team page never has to guess.
    const upper = code.trim().toUpperCase();
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      localStorage.setItem(`dd_team_${upper}`, JSON.stringify({
        teamId: row.team_id,
        sessionId: row.session_id,
        color: row.color,
        displayName: row.display_name ?? row.color,
        playerNames: row.player_names ?? [],
      }));
    }
    router.push(`/team/${upper}`);
  }

  if (authLoading) {
    return <DoorLoading message="Setting up your device…" />;
  }

  return (
    <RetroStage label="Team Check-In">
      <section className="stage-panel">
        <h1 className="page-title">Come On Down</h1>

        {step === "code" && (
          <>
            <p className="page-lead">Enter the event code your host provided.</p>
            <input
              className="join-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && lookupSession()}
              placeholder="e.g. GAME"
              maxLength={8}
              aria-label="Session code"
              autoComplete="off"
              autoCapitalize="characters"
            />
            {error && <p className="error-msg">{error}</p>}
            <button className="btn-primary" onClick={lookupSession} style={{ marginTop: "1.25rem" }}>
              Find Session
            </button>
          </>
        )}

        {step === "pick" && (
          <>
            <p className="page-lead">Choose an available team color.</p>
            <div className="color-grid">
              {COLORS.map((color) => {
                const team = teams.find((t) => t.color === color);
                const claimed = !!team?.owner_user_id;
                const isSelected = selectedColor === color;
                return (
                  <button
                    key={color}
                    className={`color-bay${isSelected ? " selected" : ""}${claimed ? " claimed" : ""}`}
                    style={{ "--bay-color": COLOR_HEX[color] } as React.CSSProperties}
                    onClick={() => { if (!claimed) { setSelectedColor(color); setStep("names"); } }}
                    disabled={claimed}
                    aria-label={claimed ? `${COLOR_LABELS[color]} — taken` : COLOR_LABELS[color]}
                  >
                    <span className="bay-label">{COLOR_LABELS[color]}</span>
                    {claimed && <span className="bay-tag">Taken</span>}
                  </button>
                );
              })}
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button className="btn-ghost" onClick={() => setStep("code")} style={{ marginTop: "1rem" }}>
              ← Change Code
            </button>
          </>
        )}

        {step === "names" && selectedColor && (
          <>
            <p className="page-lead">
              <span style={{ color: COLOR_HEX[selectedColor], fontWeight: 700 }}>
                {COLOR_LABELS[selectedColor]}
              </span>
              {" "}— enter up to 5 player names (one per line or comma-separated).
            </p>
            <textarea
              className="names-input"
              value={names}
              onChange={(e) => setNames(e.target.value)}
              placeholder="Player 1&#10;Player 2&#10;Player 3"
              rows={5}
              aria-label="Player names"
            />
            {error && <p className="error-msg">{error}</p>}
            <div style={{ display: "flex", gap: "1rem", marginTop: "1.25rem" }}>
              <button className="btn-ghost" onClick={() => { setStep("pick"); setError(""); }}>
                ← Back
              </button>
              <button className="btn-primary" onClick={claimTeam} disabled={submitting}>
                {submitting ? "Joining…" : "Join Game"}
              </button>
            </div>
          </>
        )}
      </section>
    </RetroStage>
  );
}
