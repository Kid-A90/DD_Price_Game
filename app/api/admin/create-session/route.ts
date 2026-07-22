import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { setupKey?: string; title?: string; code?: string; adminUserId?: string };
    const { setupKey, title, code, adminUserId } = body;

    if (!setupKey || setupKey !== process.env.ADMIN_SETUP_KEY) {
      return NextResponse.json({ error: "Invalid setup key" }, { status: 401 });
    }
    if (!code || !/^[A-Z0-9]{4,8}$/.test(code.toUpperCase())) {
      return NextResponse.json({ error: "Code must be 4–8 uppercase alphanumeric characters" }, { status: 400 });
    }
    if (!adminUserId) {
      return NextResponse.json({ error: "adminUserId is required" }, { status: 400 });
    }

    const sb = createSupabaseAdminClient();

    // Check for existing session with this code
    const { data: existing } = await sb
      .from("game_sessions")
      .select("id, code, admin_user_id")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (existing) {
      if (existing.admin_user_id === adminUserId) {
        return NextResponse.json({ sessionId: existing.id, code: existing.code });
      }
      return NextResponse.json({ error: "Session code already in use" }, { status: 409 });
    }

    const { data, error } = await sb.rpc("admin_create_session", {
      p_title:     title ?? "Designs Direct Live Price Game",
      p_code:      code.toUpperCase(),
      p_admin_uid: adminUserId
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ sessionId: row.session_id, code: row.code });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
