"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DoorLoading } from "@/components/DoorLoading";

/** /team without a code: return this device to its claimed team, else check-in. */
export default function TeamIndexPage() {
  const router = useRouter();
  useEffect(() => {
    const codes: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("dd_team_")) codes.push(key.slice("dd_team_".length));
    }
    router.replace(codes.length === 1 ? `/team/${codes[0]}` : "/join");
  }, [router]);
  return <DoorLoading message="Finding your team…" />;
}
