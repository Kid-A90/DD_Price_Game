import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Action = "end" | "delete" | "takeover";

/**
 * Manage an existing session with the setup key:
 * - end: move the session to the complete phase (screens show final results)
 * - delete: permanently remove the session and all its data
 * - takeover: make the calling device the session admin
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      setupKey?: string; code?: string; action?: Action; adminUserId?: string;
    };
    const { setupKey, code, action, adminUserId } = body;

    if (!setupKey || setupKey !== process.env.ADMIN_SETUP_KEY) {
      return NextResponse.json({ error: "Invalid setup key" }, { status: 401 });
    }
    if (!code || !action) {
      return NextResponse.json({ error: "code and action are required" }, { status: 400 });
    }

    const sb = createSupabaseAdminClient();
    const { data: sess, error: findErr } = await sb
      .from("game_sessions")
      .select("id, code, phase, state_version")
      .eq("code", code.toUpperCase())
      .maybeSingle();
    if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
    if (!sess) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    if (action === "delete") {
      const { error } = await sb.from("game_sessions").delete().eq("id", sess.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, action, code: sess.code });
    }

    if (action === "end") {
      const { error } = await sb
        .from("game_sessions")
        .update({
          phase: "complete",
          lobby_locked: true,
          state_version: Number(sess.state_version) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sess.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      // Push the final state to every connected screen.
      await sb.rpc("sync_public_state", { p_session_id: sess.id });
      return NextResponse.json({ ok: true, action, code: sess.code });
    }

    if (action === "takeover") {
      if (!adminUserId) {
        return NextResponse.json({ error: "adminUserId is required for takeover" }, { status: 400 });
      }
      const { error } = await sb
        .from("game_sessions")
        .update({ admin_user_id: adminUserId, updated_at: new Date().toISOString() })
        .eq("id", sess.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, action, code: sess.code });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
