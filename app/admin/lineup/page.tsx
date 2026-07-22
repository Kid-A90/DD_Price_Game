"use client";

import { useState, useCallback } from "react";
import { RetroStage } from "@/components/RetroStage";
import Link from "next/link";

interface Product {
  id: string;
  public_name: string;
  game_price_paid: number | null;
  price_status: string;
  ready_for_game: boolean;
  public_image_path: string | null;
}

interface LineupItem {
  id: string;
  product: Product;
  position: number;
  timerSeconds: number;
  roundKey: string;
  benchmarkCost: number | null;
}

export default function LineupBuilderPage() {
  const [setupKey, setSetupKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [sessionCode, setSessionCode] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [lineup, setLineup] = useState<LineupItem[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const loadProducts = useCallback(async (key: string) => {
    const res = await fetch("/api/admin/products", { headers: { "x-setup-key": key } });
    if (!res.ok) { setMsg("Wrong key."); return; }
    const body = await res.json();
    setProducts((body.products as Product[]).filter((p) => p.ready_for_game));
    setSetupKey(key);
  }, []);

  const loadLineup = useCallback(async (sid: string, key: string) => {
    const res = await fetch(`/api/admin/lineup?sessionId=${sid}`, { headers: { "x-setup-key": key } });
    if (res.ok) {
      const body = await res.json();
      setLineup(body.questions ?? []);
    }
  }, []);

  async function addToLineup(product: Product) {
    if (!sessionId) { setMsg("Enter session ID first."); return; }
    setBusy(true);
    const res = await fetch("/api/admin/lineup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-setup-key": setupKey },
      body: JSON.stringify({
        sessionId,
        productId: product.id,
        roundKey: "main",
        timerSeconds: 60,
        benchmarkCost: null,
      }),
    });
    const body = await res.json();
    if (!res.ok) { setMsg(`Error: ${body.error}`); setBusy(false); return; }
    setMsg(`Added ${product.public_name}.`);
    await loadLineup(sessionId, setupKey);
    setBusy(false);
  }

  async function removeFromLineup(questionId: string) {
    if (!sessionId) return;
    setBusy(true);
    const res = await fetch(`/api/admin/lineup?sessionId=${sessionId}&questionId=${questionId}`, {
      method: "DELETE",
      headers: { "x-setup-key": setupKey },
    });
    if (!res.ok) { const b = await res.json(); setMsg(`Error: ${b.error}`); }
    else { setMsg("Removed."); await loadLineup(sessionId, setupKey); }
    setBusy(false);
  }

  if (!setupKey) {
    return (
      <RetroStage label="Lineup Builder">
        <section className="stage-panel">
          <h1 className="page-title">Lineup Builder</h1>
          <div className="admin-setup-form">
            <label className="admin-label">
              Setup Key
              <input className="admin-input" type="password" value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)} />
            </label>
            {msg && <p className="error-msg">{msg}</p>}
            <button className="btn-primary" onClick={() => loadProducts(keyInput)}>Access</button>
          </div>
        </section>
      </RetroStage>
    );
  }

  return (
    <RetroStage label="Lineup Builder">
      <section className="stage-panel admin-console" style={{ maxWidth: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
          <h1 className="page-title" style={{ fontSize: "clamp(32px,5vw,56px)", marginBottom: 0 }}>Lineup Builder</h1>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/admin/products" className="btn-ghost" style={{ display: "inline-flex", alignItems: "center" }}>← Products</Link>
            <Link href="/admin" className="btn-ghost" style={{ display: "inline-flex", alignItems: "center" }}>Admin →</Link>
          </div>
        </div>

        {msg && <div className="admin-msg" onClick={() => setMsg("")}>{msg}</div>}

        <div className="admin-setup-form" style={{ flexDirection: "row", maxWidth: "none", flexWrap: "wrap" }}>
          <label className="admin-label" style={{ flex: "1 1 240px" }}>
            Session ID (uuid)
            <input className="admin-input" value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="paste session uuid" />
          </label>
          <label className="admin-label" style={{ flex: "0 0 120px" }}>
            Code
            <input className="admin-input" value={sessionCode}
              onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
              placeholder="GAME" />
          </label>
          <button className="btn-ghost" style={{ alignSelf: "flex-end" }}
            onClick={() => loadLineup(sessionId, setupKey)}>
            Load Lineup
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 22 }}>
          {/* Ready products */}
          <div>
            <h2 className="admin-section-title">Ready Products ({products.length})</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {products.map((p) => (
                <div key={p.id} className="admin-question-row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <strong>{p.public_name}</strong>
                    <span style={{ marginLeft: 10, opacity: .7, fontSize: 13 }}>
                      ${p.game_price_paid?.toFixed(2) ?? "?"}
                    </span>
                  </div>
                  <button className="btn-ghost btn-sm" onClick={() => addToLineup(p)} disabled={busy || !sessionId}>
                    Add →
                  </button>
                </div>
              ))}
              {products.length === 0 && (
                <p style={{ opacity: .6 }}>No ready products. Mark products ready_for_game in the product library.</p>
              )}
            </div>
          </div>

          {/* Session lineup */}
          <div>
            <h2 className="admin-section-title">Session Lineup ({lineup.length})</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {lineup.map((item) => (
                <div key={item.id} className="admin-question-row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <span style={{ fontFamily: "Impact", fontSize: 18, marginRight: 8 }}>#{item.position}</span>
                    <strong>{item.product?.public_name ?? item.id}</strong>
                    <span style={{ marginLeft: 8, opacity: .6, fontSize: 12 }}>{item.timerSeconds}s · {item.roundKey}</span>
                  </div>
                  <button className="btn-danger btn-sm" onClick={() => removeFromLineup(item.id)} disabled={busy}>
                    ✕
                  </button>
                </div>
              ))}
              {lineup.length === 0 && sessionId && (
                <p style={{ opacity: .6 }}>No questions yet. Add products from the left.</p>
              )}
              {!sessionId && (
                <p style={{ opacity: .6 }}>Enter a session ID above, then load the lineup.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </RetroStage>
  );
}
