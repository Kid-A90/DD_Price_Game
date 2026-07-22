import Image from "next/image";

export function WinBurst({ visible }: { visible: boolean }) {
  return (
    <Image
      src="/ui/win-burst.svg"
      width={380}
      height={380}
      alt=""
      aria-hidden="true"
      className={`burst-bg${visible ? " visible" : ""}`}
    />
  );
}
