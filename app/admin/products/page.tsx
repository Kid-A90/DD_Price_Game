"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RetroStage } from "@/components/RetroStage";
import Link from "next/link";

interface Product {
  id: string;
  public_name: string;
  brand_public: string | null;
  category: string | null;
  game_price_paid: number | null;
  benchmark_cost: number | null;
  price_status: string;
  public_image_path: string | null;
  public_image_status: string;
  ready_for_game: boolean;
  active: boolean;
  default_round_role: string;
  [key: string]: unknown;
}

export default function ProductLibraryPage() {
  const [setupKey, setSetupKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [source, setSource] = useState<"db" | "json" | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [csvImport, setCsvImport] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    const res = await fetch("/api/admin/products", { headers: { "x-setup-key": key } });
    if (!res.ok) { setMsg("Wrong key or server error."); setLoading(false); return; }
    const body = await res.json();
    setProducts(body.products ?? []);
    setSource(body.source);
    setSetupKey(key);
    setLoading(false);
  }, []);

  async function saveProduct(p: Product) {
    const res = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-setup-key": setupKey },
      body: JSON.stringify(p),
    });
    if (!res.ok) { const b = await res.json(); setMsg(`Error: ${b.error}`); return; }
    setMsg("Saved.");
    setEditing(null);
    await load(setupKey);
  }

  async function importCSV() {
    if (!csvImport.trim()) return;
    const res = await fetch("/api/admin/products/import", {
      method: "POST",
      headers: { "Content-Type": "text/csv", "x-setup-key": setupKey },
      body: csvImport,
    });
    const body = await res.json();
    if (!res.ok) { setMsg(`Import error: ${body.error}`); return; }
    setMsg(`Imported ${body.imported} products.`);
    setCsvImport("");
    await load(setupKey);
  }

  async function importJSON() {
    const text = await importRef.current?.files?.[0]?.text();
    if (!text) return;
    const res = await fetch("/api/admin/products/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-setup-key": setupKey },
      body: text,
    });
    const body = await res.json();
    if (!res.ok) { setMsg(`Import error: ${body.error}`); return; }
    setMsg(`Imported ${body.imported} products.`);
    await load(setupKey);
  }

  function exportCSV() {
    const cols = ["id", "public_name", "brand_public", "category", "game_price_paid", "benchmark_cost", "price_status", "public_image_path", "public_image_status", "ready_for_game", "active", "default_round_role"];
    const rows = [cols.join(",")];
    for (const p of products) {
      rows.push(cols.map((c) => {
        const v = p[c];
        if (v === null || v === undefined) return "";
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(","));
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "product-library.csv";
    a.click();
  }

  const filtered = products.filter((p) =>
    !filter || p.public_name.toLowerCase().includes(filter.toLowerCase()) ||
    (p.category ?? "").toLowerCase().includes(filter.toLowerCase())
  );

  if (!setupKey) {
    return (
      <RetroStage label="Product Library">
        <section className="stage-panel">
          <h1 className="page-title">Product Library</h1>
          <p className="page-lead">Enter the admin setup key to access the product library.</p>
          <div className="admin-setup-form">
            <label className="admin-label">
              Setup Key
              <input className="admin-input" type="password" value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load(keyInput)} />
            </label>
            {msg && <p className="error-msg">{msg}</p>}
            <button className="btn-primary" onClick={() => load(keyInput)} disabled={loading}>
              {loading ? "Loading…" : "Access Library"}
            </button>
          </div>
        </section>
      </RetroStage>
    );
  }

  return (
    <RetroStage label="Product Library">
      <section className="stage-panel admin-console" style={{ maxWidth: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
          <h1 className="page-title" style={{ fontSize: "clamp(36px,5vw,60px)", marginBottom: 0 }}>
            Product Library {source && <span style={{ fontSize: 16, fontWeight: 400 }}>({source})</span>}
          </h1>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/admin" className="btn-ghost" style={{ display: "inline-flex", alignItems: "center" }}>← Admin</Link>
            <button className="btn-ghost" onClick={exportCSV}>Export CSV</button>
            <button className="btn-primary" onClick={() => setEditing({ id: `P${Date.now()}`, public_name: "", brand_public: null, category: null, game_price_paid: null, benchmark_cost: null, price_status: "needs_receipt", public_image_path: null, public_image_status: "needs_exact_product_cleanup", ready_for_game: false, active: false, default_round_role: "library" })}>
              + New Product
            </button>
          </div>
        </div>

        {msg && <div className="admin-msg" onClick={() => setMsg("")}>{msg}</div>}

        {/* Search */}
        <input className="admin-input" placeholder="Search products…" value={filter}
          onChange={(e) => setFilter(e.target.value)} style={{ marginBottom: 14 }} />

        {/* Import */}
        <details style={{ marginBottom: 18 }}>
          <summary className="admin-section-title" style={{ cursor: "pointer", fontSize: 18 }}>Import</summary>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <label className="admin-label">
              JSON file
              <input ref={importRef} type="file" accept=".json" onChange={importJSON} />
            </label>
            <label className="admin-label">
              Paste CSV
              <textarea className="admin-input" rows={6} value={csvImport}
                onChange={(e) => setCsvImport(e.target.value)}
                placeholder="id,public_name,game_price_paid,…" />
            </label>
            <button className="btn-ghost" onClick={importCSV}>Import CSV</button>
          </div>
        </details>

        {/* Product table */}
        <div className="product-table">
          <div className="product-table-header">
            <span>ID</span>
            <span>Name</span>
            <span>Price Paid</span>
            <span>Status</span>
            <span>Image</span>
            <span>Ready</span>
            <span></span>
          </div>
          {filtered.map((p) => (
            <div key={p.id} className={`product-table-row${p.ready_for_game ? " ready" : ""}`}>
              <span className="pt-id">{p.id}</span>
              <span className="pt-name">{p.public_name}</span>
              <span className="pt-price">
                {p.game_price_paid != null ? `$${p.game_price_paid.toFixed(2)}` : "—"}
              </span>
              <span className={`pt-status pt-status-${p.price_status}`}>{p.price_status}</span>
              <span className={`pt-img pt-img-${p.public_image_status}`}>{p.public_image_status}</span>
              <span className="pt-ready">{p.ready_for_game ? "✓" : "—"}</span>
              <button className="btn-ghost btn-sm" onClick={() => setEditing({ ...p })}>Edit</button>
            </div>
          ))}
          {filtered.length === 0 && (
            <p style={{ padding: "18px", opacity: .6 }}>No products match.</p>
          )}
        </div>

        {/* Edit modal */}
        {editing && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
            <div className="modal-box">
              <h2 className="admin-section-title">Edit: {editing.public_name || "(new)"}</h2>
              <div className="admin-setup-form" style={{ maxWidth: "none" }}>
                {[
                  ["id", "ID"],
                  ["public_name", "Public Name"],
                  ["brand_public", "Brand (public)"],
                  ["category", "Category"],
                  ["price_status", "Price Status"],
                  ["public_image_path", "Public Image Path"],
                  ["public_image_status", "Image Status"],
                  ["default_round_role", "Round Role"],
                ].map(([field, label]) => (
                  <label className="admin-label" key={field}>
                    {label}
                    <input className="admin-input" value={String(editing[field] ?? "")}
                      onChange={(e) => setEditing({ ...editing, [field]: e.target.value || null })} />
                  </label>
                ))}
                <label className="admin-label">
                  Game Price Paid ($)
                  <input className="admin-input" type="number" step="0.01"
                    value={editing.game_price_paid ?? ""}
                    onChange={(e) => setEditing({ ...editing, game_price_paid: e.target.value ? parseFloat(e.target.value) : null })} />
                </label>
                <label className="admin-label">
                  Benchmark Cost ($)
                  <input className="admin-input" type="number" step="0.01"
                    value={editing.benchmark_cost ?? ""}
                    onChange={(e) => setEditing({ ...editing, benchmark_cost: e.target.value ? parseFloat(e.target.value) : null })} />
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 850 }}>
                  <input type="checkbox" checked={!!editing.ready_for_game}
                    onChange={(e) => setEditing({ ...editing, ready_for_game: e.target.checked })} />
                  Ready for Game (requires confirmed_paid_price + approved image)
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 850 }}>
                  <input type="checkbox" checked={!!editing.active}
                    onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                  Active
                </label>
                <div style={{ display: "flex", gap: 12 }}>
                  <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                  <button className="btn-primary" onClick={() => saveProduct(editing)}>Save</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      <style>{`
        .product-table { border: 4px solid var(--show-black); border-radius: 14px; overflow: hidden; }
        .product-table-header, .product-table-row {
          display: grid;
          grid-template-columns: 80px 1fr 100px 180px 200px 60px 60px;
          gap: 10px;
          padding: 10px 14px;
          font-size: 14px;
          align-items: center;
        }
        .product-table-header { background: var(--show-black); color: white; font-weight: 850; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
        .product-table-row { border-top: 2px solid #eee; }
        .product-table-row:nth-child(even) { background: #fafafa; }
        .product-table-row.ready { background: #f0fff0; }
        .pt-id { font-family: monospace; font-size: 12px; opacity: .7; }
        .pt-name { font-weight: 700; }
        .pt-price { font-family: Impact, "Arial Black", sans-serif; }
        .pt-status { font-size: 12px; font-weight: 850; padding: 3px 8px; border-radius: 8px; text-align: center; }
        .pt-status-confirmed_paid_price { background: #d4edda; }
        .pt-status-needs_receipt { background: #fff3cd; }
        .pt-status-estimated { background: #f8d7da; }
        .pt-img { font-size: 11px; opacity: .75; }
        .pt-ready { text-align: center; font-size: 18px; }
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.6);
          display: grid; place-items: center; z-index: 999;
        }
        .modal-box {
          background: var(--paper); border: 8px solid var(--show-black);
          border-radius: 24px; padding: 28px; width: min(680px, 96vw);
          max-height: 90vh; overflow-y: auto;
        }
      `}</style>
    </RetroStage>
  );
}
