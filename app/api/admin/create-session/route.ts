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

    // Auto-build the lineup: food warm-ups first, then main products,
    // each ordered by external id. Showcase prizes are excluded — they
    // belong to the Team Showcase finale.
    const { data: products, error: prodErr } = await sb
      .from("products")
      .select("id, external_id, public_name, public_image_path, paid_price, benchmark_cost, default_round_role")
      .in("default_round_role", ["warmup", "main"])
      .eq("active", true)
      .eq("ready_for_game", true)
      .not("paid_price", "is", null);

    if (!prodErr && products && products.length) {
      const roleOrder = (r: string) => (r === "warmup" ? 0 : 1);
      products.sort((a, b) =>
        roleOrder(a.default_round_role) - roleOrder(b.default_round_role) ||
        a.external_id.localeCompare(b.external_id));
      const questions = products.map((p, i) => ({
        session_id: row.session_id,
        product_id: p.id,
        position: i + 1,
        round_key: p.default_round_role,
        timer_seconds: p.default_round_role === "warmup" ? 45 : 60,
        public_name_snapshot: p.public_name,
        public_image_path_snapshot: p.public_image_path,
        answer_paid_price: p.paid_price,
        benchmark_cost: p.benchmark_cost,
      }));
      const { error: qErr } = await sb.from("session_questions").insert(questions);
      if (qErr) {
        return NextResponse.json({ error: `Session created but lineup failed: ${qErr.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ sessionId: row.session_id, code: row.code, questions: products?.length ?? 0 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
