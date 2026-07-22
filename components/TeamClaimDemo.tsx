"use client";

import { useState } from "react";

const teams = [
  { id: "red", label: "Red Team" },
  { id: "blue", label: "Blue Team" },
  { id: "yellow", label: "Yellow Team" },
  { id: "green", label: "Green Team" }
] as const;

export function TeamClaimDemo() {
  const [selected, setSelected] = useState<string>("red");

  return (
    <div>
      <div className="team-grid" role="group" aria-label="Choose an available team">
        {teams.map((team) => (
          <button
            className={`team-choice ${team.id}`}
            type="button"
            key={team.id}
            aria-pressed={selected === team.id}
            onClick={() => setSelected(team.id)}
          >
            {team.label}
          </button>
        ))}
      </div>
      <div className="names-grid">
        {Array.from({ length: 5 }, (_, index) => (
          <input key={index} placeholder={`Player ${index + 1}${index === 0 ? " (required)" : ""}`} aria-label={`Player ${index + 1} name`} />
        ))}
      </div>
      <div className="actions">
        <button className="primary-button" type="button">Claim Team</button>
      </div>
    </div>
  );
}
