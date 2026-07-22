import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** List all game sessions. Requires the admin setup key. */
export async function POST(req: NextRequest) {
  try {
    const { setupKey } = await req.json() as { setupKey?: string };
    if (!setupKey || setupKey !== process.env.ADMIN_SETUP_KEY) {
      return NextResponse.json({ error: "Invalid setup key" }, { status: 401 });
    }

    const sb = createSupabaseAdminClient();
    const { data: sessions, error } = await sb
      .from("game_sessions")
      .select("id, code, title, phase, admin_user_id, created_at")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const ids = (sessions ?? []).map((s) => s.id);
    const counts: Record<string, number> = {};
    if (ids.length) {
      const { data: teams } = await sb
        .from("teams")
        .select("session_id, owner_user_id")
        .in("session_id", ids);
      for (const t of teams ?? []) {
        if (t.owner_user_id) counts[t.session_id] = (counts[t.session_id] ?? 0) + 1;
      }
    }

    return NextResponse.json({
      sessions: (sessions ?? []).map((s) => ({
        id: s.id,
        code: s.code,
        title: s.title,
        phase: s.phase,
        adminUserId: s.admin_user_id,
        createdAt: s.created_at,
        teamsClaimed: counts[s.id] ?? 0,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
