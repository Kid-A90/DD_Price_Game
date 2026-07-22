import Image from "next/image";
import { BigDoor } from "./BigDoor";

/** Closed-door loading screen: the logo centered on the white panel,
 *  door lights chasing — like the big doors before they open. */
export function DoorLoading({ message = "Loading…" }: { message?: string }) {
  return (
    <BigDoor>
      <div className="door-loading">
        <Image
          src="/ui/tpir-logo.webp"
          width={595}
          height={672}
          alt="The Price Is Right"
          className="door-loading-logo"
          priority
        />
        <p className="door-loading-msg">{message}</p>
      </div>
    </BigDoor>
  );
}
