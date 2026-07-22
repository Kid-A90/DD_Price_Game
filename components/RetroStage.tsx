import Image from "next/image";
import { MarqueeBulbs } from "./MarqueeBulbs";

export function RetroStage({
  children,
  label = "Designs Direct Live Price Game"
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <main className="stage-shell">
      <div className="stage-inner">
        <header className="stage-header">
          <div className="stage-brand">
            <Image src="/brand/designs-direct-logo.png" width={184} height={94} alt="Designs Direct" priority />
            <div>
              <div>{label}</div>
              <div className="stage-kicker">Paid-price edition</div>
            </div>
          </div>
          <MarqueeBulbs />
        </header>
        <div className="stage-main">{children}</div>
      </div>
    </main>
  );
}
