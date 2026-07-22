"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";

let globalSession: Session | null = null;
let sessionPromise: Promise<Session> | null = null;

export function useAnonAuth() {
  const [session, setSession] = useState<Session | null>(globalSession);
  const [loading, setLoading] = useState(!globalSession);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const sb = createSupabaseBrowserClient();

    if (globalSession) {
      setSession(globalSession);
      setLoading(false);
      return;
    }

    if (!sessionPromise) {
      sessionPromise = sb.auth.getSession().then(async ({ data }) => {
        if (data.session) return data.session;
        const { data: sign, error } = await sb.auth.signInAnonymously();
        if (error || !sign.session) throw error ?? new Error("Anonymous sign-in failed");
        return sign.session;
      });
    }

    sessionPromise.then((s) => {
      globalSession = s;
      if (mounted.current) {
        setSession(s);
        setLoading(false);
      }
    }).catch(() => {
      if (mounted.current) setLoading(false);
    });

    const { data: listener } = sb.auth.onAuthStateChange((_event, s) => {
      globalSession = s;
      if (mounted.current) setSession(s);
    });

    return () => {
      mounted.current = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return { session, loading, userId: session?.user?.id ?? null };
}
