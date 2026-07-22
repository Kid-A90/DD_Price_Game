"use client";

import { useEffect, useState } from "react";
import { WinBurst } from "./WinBurst";

/** Two stage doors slide open to reveal a headline. */
export function DoorReveal({
  label,
  title,
  subtitle,
  color,
}: {
  label?: string;
  title: string;
  subtitle?: string;
  color?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOpen(true), 700);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`door-reveal${open ? " open" : ""}`}>
      <div
        className="dr-content"
        style={color ? ({ "--bay-color": color } as React.CSSProperties) : undefined}
      >
        <div className="burst-container dr-burst">
          <WinBurst visible={open} />
          <div className="dr-text">
            {label && <span className="dr-label">{label}</span>}
            <span className="dr-title">{title}</span>
            {subtitle && <span className="dr-subtitle">{subtitle}</span>}
          </div>
        </div>
      </div>
      <div className="dr-panel left"><span className="dr-handle" /></div>
      <div className="dr-panel right"><span className="dr-handle" /></div>
    </div>
  );
}
