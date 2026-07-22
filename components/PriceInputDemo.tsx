"use client";

import { useEffect, useMemo, useState } from "react";

export function PriceInputDemo({ seconds = 30 }: { seconds?: number }) {
  const [remaining, setRemaining] = useState(seconds);
  const [value, setValue] = useState("");
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (locked || remaining <= 0) return;
    const id = window.setInterval(() => setRemaining((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(id);
  }, [locked, remaining]);

  useEffect(() => {
    if (remaining === 0 && value.trim()) setLocked(true);
  }, [remaining, value]);

  const status = useMemo(() => {
    if (locked) return "Guess locked. Waiting for the host.";
    if (remaining === 0) return "Time is up. Blank entry means no submission.";
    return "Your latest valid draft is saved until the shared deadline.";
  }, [locked, remaining]);

  return (
    <div className="bid-bay">
      <div className="timer-dial" aria-label={`${remaining} seconds remaining`}>{remaining}</div>
      <h2>Your paid-price guess</h2>
      <div className="price-input-wrap">
        <span>$</span>
        <input
          className="price-input"
          value={value}
          onChange={(event) => setValue(event.target.value.replace(/[^0-9.]/g, ""))}
          inputMode="decimal"
          placeholder="0.00"
          disabled={locked || remaining === 0}
          aria-label="Retail price guess"
        />
      </div>
      <div className="actions">
        <button className="primary-button" type="button" onClick={() => value.trim() && setLocked(true)} disabled={locked || !value.trim()}>
          Lock Guess
        </button>
      </div>
      <div className="lock-status">{status}</div>
    </div>
  );
}
