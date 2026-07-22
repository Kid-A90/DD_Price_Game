import Image from "next/image";
import { DoorLights } from "./DoorLights";

export function RetroStage({
  children,
  label = "The Price Is Right"
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <main className="tpir-door">
      <div className="door-ring ring-green">
        <div className="door-ring ring-pink">
          <div className="door-ring ring-maroon">
            <DoorLights />
            <div className="door-ring ring-blue">
              <div className="door-ring ring-yellow">
                <div className="door-ring ring-orange">
                  <div className="door-center">
                    <header className="tpir-header">
                      <Image
                        src="/ui/tpir-logo.svg"
                        width={140}
                        height={87}
                        alt="The Price Is Right"
                        className="tpir-header-logo"
                        priority
                      />
                      <span className="tpir-session-chip">{label}</span>
                      <Image
                        src="/brand/designs-direct-logo.png"
                        width={92}
                        height={47}
                        alt="Designs Direct"
                        className="tpir-header-dd"
                      />
                    </header>
                    <div className="stage-main">{children}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
