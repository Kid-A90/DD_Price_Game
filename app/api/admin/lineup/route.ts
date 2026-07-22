import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// GET /api/admin/lineup?sessionId=...
export async function GET(req: NextRequest) {
  const setupKey = req.headers.get("x-setup-key");
  if (!setupKey || setupKey !== process.env.ADMIN_SETUP_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.rpc("admin_get_session_questions", { p_session_id: sessionId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ questions: data ?? [] });
}

// POST /api/admin/lineup — add product to session lineup via RPC
export async function POST(req: NextRequest) {
  const setupKey = req.headers.get("x-setup-key");
  if (!setupKey || setupKey !== process.env.ADMIN_SETUP_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as {
    sessionId: string;
    productId: string;
    position?: number;
    roundKey?: string;
    timerSeconds?: number;
    benchmarkCost?: number | null;
  };

  if (!body.sessionId || !body.productId) {
    return NextResponse.json({ error: "sessionId and productId required" }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.rpc("admin_add_session_question", {
    p_session_id: body.sessionId,
    p_product_id: body.productId,
    p_position: body.position ?? null,
    p_round_key: body.roundKey ?? "main",
    p_timer_seconds: body.timerSeconds ?? 60,
    p_benchmark_cost: body.benchmarkCost ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ questionId: data });
}

// DELETE /api/admin/lineup?sessionId=...&questionId=...
export async function DELETE(req: NextRequest) {
  const setupKey = req.headers.get("x-setup-key");
  if (!setupKey || setupKey !== process.env.ADMIN_SETUP_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const questionId = searchParams.get("questionId");

  if (!sessionId || !questionId) {
    return NextResponse.json({ error: "sessionId and questionId required" }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { error } = await sb.rpc("admin_remove_session_question", {
    p_session_id: sessionId,
    p_question_id: questionId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ removed: true });
}

// PATCH /api/admin/lineup — reorder
export async function PATCH(req: NextRequest) {
  const setupKey = req.headers.get("x-setup-key");
  if (!setupKey || setupKey !== process.env.ADMIN_SETUP_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { sessionId: string; questionId: string; newPosition: number };
  if (!body.sessionId || !body.questionId || body.newPosition == null) {
    return NextResponse.json({ error: "sessionId, questionId, newPosition required" }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { error } = await sb.rpc("admin_reorder_question", {
    p_session_id: body.sessionId,
    p_question_id: body.questionId,
    p_new_position: body.newPosition,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reordered: true });
}
