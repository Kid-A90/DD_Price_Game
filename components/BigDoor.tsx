import { DoorLights } from "./DoorLights";

/** The 1972 concentric-ring big door. Children render on the white center panel. */
export function BigDoor({ children }: { children: React.ReactNode }) {
  return (
    <main className="tpir-door">
      <div className="door-ring ring-green">
        <div className="door-ring ring-pink">
          <div className="door-ring ring-maroon">
            <DoorLights />
            <div className="door-ring ring-blue">
              <div className="door-ring ring-yellow">
                <div className="door-ring ring-orange">
                  <div className="door-center">{children}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
