-- 1) Scoring failed with a foreign-key violation when any team was unclaimed:
--    finalize_and_score_question invented gen_random_uuid() owners for
--    placeholder no-submission rows. Make owner nullable and pre-create the
--    placeholders with real (or NULL) owners before finalize runs, so its
--    faulty insert never fires.
-- 2) New admin_restart_timer: reset the running question's countdown.

BEGIN;

ALTER TABLE public.submissions ALTER COLUMN owner_user_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_submission_placeholders(
  p_question_id uuid,
  p_session_id  uuid
) RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  INSERT INTO public.submissions (question_id, team_id, owner_user_id, status, updated_at)
  SELECT p_question_id, t.id, t.owner_user_id, 'no_submission', now()
  FROM public.teams t
  WHERE t.session_id = p_session_id
    AND NOT EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.question_id = p_question_id AND s.team_id = t.id
    )
  ON CONFLICT (question_id, team_id) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION public.admin_close_question(
  p_session_id   uuid,
  p_state_version bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_sess      game_sessions%rowtype;
  v_needs_tie boolean;
  v_plan      jsonb;
BEGIN
  SELECT * INTO v_sess FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_sess.admin_user_id <> (SELECT auth.uid()) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  IF v_sess.state_version <> p_state_version THEN RAISE EXCEPTION 'Stale state version'; END IF;
  IF v_sess.phase <> 'question_open' THEN
    RAISE EXCEPTION 'Question is not open (phase: %)', v_sess.phase;
  END IF;

  PERFORM ensure_submission_placeholders(v_sess.current_question_id, p_session_id);
  v_needs_tie := finalize_and_score_question(v_sess.current_question_id, p_session_id);

  IF v_needs_tie THEN
    UPDATE game_sessions SET
      phase         = 'tie_break_open',
      state_version = state_version + 1,
      updated_at    = now()
    WHERE id = p_session_id;

    SELECT pending_score_plan INTO v_plan
    FROM session_questions WHERE id = v_sess.current_question_id;

    PERFORM sync_public_state(p_session_id);
    RETURN jsonb_build_object('status','needs_tie_break','tieGroups', v_plan->'tieGroups');
  ELSE
    UPDATE game_sessions SET
      phase         = 'question_locked',
      state_version = state_version + 1,
      updated_at    = now()
    WHERE id = p_session_id;
    PERFORM sync_public_state(p_session_id);
    RETURN jsonb_build_object('status','resolved');
  END IF;
END;
$$;

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

  -- Only auto-close if a deadline exists and has passed (paused = no deadline)
  IF NOT EXISTS (SELECT 1 FROM session_questions
                 WHERE id = v_sess.current_question_id
                   AND deadline_at IS NOT NULL
                   AND deadline_at <= clock_timestamp()) THEN
    RETURN jsonb_build_object('status','not_expired');
  END IF;

  PERFORM ensure_submission_placeholders(v_sess.current_question_id, p_session_id);
  v_needs_tie := finalize_and_score_question(v_sess.current_question_id, p_session_id);

  UPDATE game_sessions SET
    phase         = CASE WHEN v_needs_tie THEN 'tie_break_open' ELSE 'question_locked' END,
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

-- ── admin_restart_timer: reset the countdown on the open question ───────────
CREATE OR REPLACE FUNCTION public.admin_restart_timer(
  p_session_id    uuid,
  p_state_version bigint,
  p_seconds       integer DEFAULT 25
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_sess game_sessions%rowtype;
BEGIN
  SELECT * INTO v_sess FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_sess.admin_user_id <> (SELECT auth.uid()) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  IF v_sess.state_version <> p_state_version THEN RAISE EXCEPTION 'Stale state version'; END IF;
  IF v_sess.phase <> 'question_open' THEN RAISE EXCEPTION 'Question is not open'; END IF;
  IF p_seconds IS NULL OR p_seconds < 5 OR p_seconds > 600 THEN
    RAISE EXCEPTION 'Timer must be 5-600 seconds';
  END IF;

  UPDATE session_questions SET
    deadline_at = clock_timestamp() + make_interval(secs => p_seconds)
  WHERE id = v_sess.current_question_id;

  UPDATE game_sessions SET
    paused_remaining_ms = NULL,
    state_version       = state_version + 1,
    updated_at          = now()
  WHERE id = p_session_id;

  PERFORM sync_public_state(p_session_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_restart_timer(uuid, bigint, integer) TO authenticated;

COMMIT;
