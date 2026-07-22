import Image from "next/image";
import { BigDoor } from "./BigDoor";

export function RetroStage({
  children,
  label
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <BigDoor>
      <header className="tpir-header">
        <Image
          src="/ui/tpir-logo.webp"
          width={595}
          height={672}
          alt="The Price Is Right"
          className="tpir-header-logo"
          priority
        />
        <div className="tpir-header-right">
          {label && <span className="tpir-session-chip">{label}</span>}
          <Image
            src="/brand/designs-direct-logo.png"
            width={92}
            height={47}
            alt="Designs Direct"
            className="tpir-header-dd"
          />
        </div>
      </header>
      <div className="stage-main">{children}</div>
    </BigDoor>
  );
}
