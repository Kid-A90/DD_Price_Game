-- Fix: admin_get_session_questions failed with 42702 "column reference id is
-- ambiguous" (PL/pgSQL OUT params shadowing table columns). Rewritten as a
-- plain SQL function: no variable scope, no ambiguity. Non-admins get an
-- empty result instead of an exception.

CREATE OR REPLACE FUNCTION public.admin_get_session_questions(
  p_session_id uuid
) RETURNS TABLE (
  id uuid, "position" integer, round_key text, timer_seconds integer,
  public_name_snapshot text, public_image_path_snapshot text,
  answer_paid_price numeric, benchmark_cost numeric,
  opened_at timestamptz, closed_at timestamptz, revealed_at timestamptz,
  final_awards jsonb, pending_score_plan jsonb
) LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT q.id, q.position, q.round_key, q.timer_seconds,
         q.public_name_snapshot, q.public_image_path_snapshot,
         q.answer_paid_price, q.benchmark_cost,
         q.opened_at, q.closed_at, q.revealed_at,
         q.final_awards, q.pending_score_plan
  FROM public.session_questions q
  WHERE q.session_id = p_session_id
    AND EXISTS (
      SELECT 1 FROM public.game_sessions gs
      WHERE gs.id = p_session_id AND gs.admin_user_id = auth.uid()
    )
  ORDER BY q.position;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_session_questions(uuid) TO authenticated;
