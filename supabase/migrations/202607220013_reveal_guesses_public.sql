-- Include each team's final guess in the public team statuses — but only
-- while the session is in the reveal phase. Never exposed earlier.

CREATE OR REPLACE FUNCTION public.sync_public_state(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_sess  game_sessions%rowtype;
  v_q     session_questions%rowtype;
  v_team_statuses  jsonb;
  v_leaderboard    jsonb;
  v_tie_colors     text[];
  v_reveal_price   numeric(10,2);
  v_point_awards   jsonb;
  v_deadline       timestamptz;
BEGIN
  SELECT * INTO v_sess FROM game_sessions WHERE id = p_session_id FOR SHARE;

  IF v_sess.current_question_id IS NOT NULL THEN
    SELECT * INTO v_q FROM session_questions WHERE id = v_sess.current_question_id;
  END IF;

  -- Per-team status: guess values only once revealed
  SELECT jsonb_agg(
    jsonb_build_object(
      'color',       t.color,
      'displayName', t.display_name,
      'playerNames', to_jsonb(t.player_names),
      'score',       t.total_score,
      'claimed',     (t.owner_user_id IS NOT NULL),
      'status', CASE
        WHEN v_sess.current_question_id IS NULL THEN 'waiting'
        WHEN s.status IS NULL                   THEN 'waiting'
        WHEN s.status = 'draft' AND s.retail_draft IS NOT NULL THEN 'draft_saved'
        WHEN s.status = 'draft'                 THEN 'thinking'
        WHEN s.status IN ('locked','auto_locked') THEN 'locked'
        WHEN s.status = 'no_submission'         THEN 'no_submission'
        ELSE s.status::text
      END,
      'tieEligible', COALESCE(s.tie_eligible, false),
      'finalGuess', CASE
        WHEN v_sess.phase = 'reveal' AND s.retail_final IS NOT NULL
          THEN to_jsonb(s.retail_final)
        ELSE 'null'::jsonb
      END
    )
    ORDER BY
      CASE t.color::text WHEN 'red' THEN 1 WHEN 'blue' THEN 2 WHEN 'yellow' THEN 3 ELSE 4 END
  )
  INTO v_team_statuses
  FROM teams t
  LEFT JOIN submissions s
         ON s.team_id     = t.id
        AND s.question_id = v_sess.current_question_id
  WHERE t.session_id = p_session_id;

  IF v_sess.phase IN ('tie_break_open','tie_break_locked') THEN
    SELECT array_agg(t.color::text)
    INTO v_tie_colors
    FROM teams t
    JOIN submissions s
      ON s.team_id      = t.id
     AND s.question_id  = v_sess.current_question_id
     AND s.tie_eligible = true
    WHERE t.session_id = p_session_id;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'color',       t.color,
      'displayName', t.display_name,
      'playerNames', to_jsonb(t.player_names),
      'score',       t.total_score
    )
    ORDER BY t.total_score DESC,
      CASE t.color::text WHEN 'red' THEN 1 WHEN 'blue' THEN 2 WHEN 'yellow' THEN 3 ELSE 4 END
  )
  INTO v_leaderboard
  FROM teams t WHERE t.session_id = p_session_id;

  IF v_sess.phase = 'question_open' AND v_q.deadline_at IS NOT NULL THEN
    v_deadline := v_q.deadline_at;
  END IF;

  IF v_sess.phase = 'reveal' AND v_q.revealed_at IS NOT NULL THEN
    v_reveal_price := v_q.answer_paid_price;
    v_point_awards  := v_q.final_awards;
  END IF;

  INSERT INTO session_public_state (
    session_id, code, phase, current_question_id,
    round_label, question_label, product_name, public_image_path,
    deadline_at, team_statuses, tie_break_eligible_colors,
    reveal_paid_price, point_awards, leaderboard, state_version, updated_at
  )
  SELECT
    p_session_id, v_sess.code, v_sess.phase, v_sess.current_question_id,
    v_q.round_key, v_q.public_name_snapshot,
    CASE WHEN v_q.id IS NOT NULL THEN v_q.public_name_snapshot ELSE NULL END,
    CASE WHEN v_q.id IS NOT NULL THEN v_q.public_image_path_snapshot ELSE NULL END,
    v_deadline, COALESCE(v_team_statuses,'[]'::jsonb), COALESCE(v_tie_colors,'{}'),
    v_reveal_price, v_point_awards, COALESCE(v_leaderboard,'[]'::jsonb),
    v_sess.state_version, now()
  ON CONFLICT (session_id) DO UPDATE SET
    phase                     = EXCLUDED.phase,
    current_question_id       = EXCLUDED.current_question_id,
    round_label               = EXCLUDED.round_label,
    question_label             = EXCLUDED.question_label,
    product_name              = EXCLUDED.product_name,
    public_image_path         = EXCLUDED.public_image_path,
    deadline_at               = EXCLUDED.deadline_at,
    team_statuses             = EXCLUDED.team_statuses,
    tie_break_eligible_colors = EXCLUDED.tie_break_eligible_colors,
    reveal_paid_price         = EXCLUDED.reveal_paid_price,
    point_awards              = EXCLUDED.point_awards,
    leaderboard               = EXCLUDED.leaderboard,
    state_version             = EXCLUDED.state_version,
    updated_at                = EXCLUDED.updated_at;
END;
$$;
