"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RetroStage } from "@/components/RetroStage";

/** /display without a code: enter the session code for this projector screen. */
export default function DisplayIndexPage() {
  const router = useRouter();
  const [code, setCode] = useState("");

  function go() {
    if (code.trim()) router.push(`/display/${code.trim().toUpperCase()}`);
  }

  return (
    <RetroStage label="Public Display">
      <section className="stage-panel" style={{ textAlign: "center" }}>
        <h1 className="page-title">Public Display</h1>
        <p className="page-lead">Enter the session code to put the show on this screen.</p>
        <input
          className="join-code"
          style={{ margin: "1rem auto 0" }}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="e.g. GAME"
          maxLength={8}
          aria-label="Session code"
          autoComplete="off"
          autoCapitalize="characters"
        />
        <div className="actions" style={{ justifyContent: "center" }}>
          <button className="btn-primary" onClick={go}>Start Display</button>
        </div>
      </section>
    </RetroStage>
  );
}
