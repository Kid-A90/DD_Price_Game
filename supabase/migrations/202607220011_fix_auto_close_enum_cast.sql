-- admin_close_question_auto failed with 42804: the CASE over two phase
-- literals resolves to text and cannot be assigned to the game_phase enum.
-- The app now auto-closes via admin_close_question, but fix this function
-- for correctness / future server-side cron use.

CREATE OR REPLACE FUNCTION public.admin_close_question_auto(
  p_session_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_sess      game_sessions%rowtype;
  v_needs_tie boolean;
  v_plan      jsonb;
BEGIN
  SELECT * INTO v_sess FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF v_sess.phase <> 'question_open' THEN RETURN jsonb_build_object('status','noop'); END IF;

  IF NOT EXISTS (SELECT 1 FROM session_questions
                 WHERE id = v_sess.current_question_id
                   AND deadline_at IS NOT NULL
                   AND deadline_at <= clock_timestamp()) THEN
    RETURN jsonb_build_object('status','not_expired');
  END IF;

  PERFORM ensure_submission_placeholders(v_sess.current_question_id, p_session_id);
  v_needs_tie := finalize_and_score_question(v_sess.current_question_id, p_session_id);

  UPDATE game_sessions SET
    phase         = (CASE WHEN v_needs_tie THEN 'tie_break_open' ELSE 'question_locked' END)::public.game_phase,
    state_version = state_version + 1,
    updated_at    = now()
  WHERE id = p_session_id;

  IF v_needs_tie THEN
    SELECT pending_score_plan INTO v_plan
    FROM session_questions WHERE id = v_sess.current_question_id;
    PERFORM sync_public_state(p_session_id);
    RETURN jsonb_build_object('status','needs_tie_break','tieGroups', v_plan->'tieGroups');
  END IF;

  PERFORM sync_public_state(p_session_id);
  RETURN jsonb_build_object('status','resolved');
END;
$$;
