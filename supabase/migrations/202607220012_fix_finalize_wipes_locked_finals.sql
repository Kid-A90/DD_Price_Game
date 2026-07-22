-- CRITICAL scoring fix: finalize_and_score_question step 2 set
-- retail_final = NULL for every row whose status was not 'draft' — which
-- wiped the finals of teams that pressed Lock In. valid_count became 0 and
-- nobody ever earned points. The ELSE branch now preserves locked finals.
-- Also: tolerate a NULL deadline (paused question force-closed) and stop
-- inventing random owner ids for placeholder rows.

CREATE OR REPLACE FUNCTION public.finalize_and_score_question(
  p_question_id uuid,
  p_session_id  uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_q            session_questions%rowtype;
  v_answer       numeric(10,2);
  EPSILON CONSTANT numeric := 0.00001;

  v_awards       jsonb := '[]'::jsonb;
  v_tie_groups   jsonb := '[]'::jsonb;
  v_no_sub_ids   jsonb := '[]'::jsonb;
  v_has_tie      boolean := false;

  v_valid_count  integer;
  v_under_count  integer;
  v_first_val    numeric(10,2);
  v_second_val   numeric(10,2);
  v_first_count  integer;
  v_second_count integer;
  v_all_min      numeric;
  v_all_cnt      integer;
  v_eligible_ids text[];
  v_tie_id       text;
  r              record;
BEGIN
  SELECT * INTO v_q FROM session_questions WHERE id = p_question_id FOR UPDATE;
  v_answer := v_q.answer_paid_price;

  -- 1. Placeholder rows for teams that never submitted (owner may be NULL)
  INSERT INTO submissions (question_id, team_id, owner_user_id, status, updated_at)
  SELECT p_question_id, t.id, t.owner_user_id, 'no_submission'::public.submission_status, now()
  FROM teams t
  WHERE t.session_id = p_session_id
    AND NOT EXISTS (
      SELECT 1 FROM submissions s WHERE s.question_id = p_question_id AND s.team_id = t.id
    )
  ON CONFLICT (question_id, team_id) DO NOTHING;

  -- 2. Finalize drafts; PRESERVE finals that are already locked
  UPDATE submissions SET
    retail_final  = CASE
                      WHEN status = 'draft'
                       AND retail_draft IS NOT NULL
                       AND (v_q.deadline_at IS NULL OR draft_updated_at <= v_q.deadline_at)
                        THEN retail_draft
                      WHEN status IN ('locked','auto_locked') THEN retail_final
                      ELSE NULL
                    END,
    status        = CASE
                      WHEN status = 'draft'
                       AND retail_draft IS NOT NULL
                       AND (v_q.deadline_at IS NULL OR draft_updated_at <= v_q.deadline_at)
                        THEN 'auto_locked'
                      WHEN status = 'draft' THEN 'no_submission'
                      ELSE status
                    END,
    updated_at    = now()
  WHERE question_id = p_question_id;

  -- 3. Collect no-submission team IDs for the plan
  SELECT jsonb_agg(to_jsonb(t.id::text))
  INTO v_no_sub_ids
  FROM submissions s JOIN teams t ON t.id = s.team_id
  WHERE s.question_id = p_question_id AND s.status = 'no_submission';

  -- 4. Exact paid-price bonus (+1, independent of placement)
  FOR r IN
    SELECT s.team_id::text AS tid, t.color::text AS color
    FROM submissions s JOIN teams t ON t.id = s.team_id
    WHERE s.question_id = p_question_id
      AND s.retail_final IS NOT NULL
      AND ABS(s.retail_final - v_answer) < EPSILON
  LOOP
    v_awards := v_awards || jsonb_build_object(
      'teamId', r.tid, 'color', r.color,
      'points', 1, 'reason', 'exact_paid_price'
    );
  END LOOP;

  -- 5. Count valid finalized submissions
  SELECT COUNT(*) INTO v_valid_count
  FROM submissions s
  WHERE s.question_id = p_question_id
    AND s.retail_final IS NOT NULL
    AND s.status IN ('locked','auto_locked');

  SELECT COUNT(*) INTO v_under_count
  FROM submissions s
  WHERE s.question_id = p_question_id
    AND s.retail_final IS NOT NULL
    AND s.status IN ('locked','auto_locked')
    AND s.retail_final <= v_answer + EPSILON;

  -- 6a. At-or-under path
  IF v_under_count > 0 THEN
    SELECT MAX(s.retail_final) INTO v_first_val
    FROM submissions s
    WHERE s.question_id = p_question_id
      AND s.retail_final IS NOT NULL
      AND s.status IN ('locked','auto_locked')
      AND s.retail_final <= v_answer + EPSILON;

    SELECT COUNT(*) INTO v_first_count
    FROM submissions s
    WHERE s.question_id = p_question_id
      AND ABS(s.retail_final - v_first_val) < EPSILON;

    IF v_first_count = 1 THEN
      SELECT s.team_id::text, t.color::text INTO r
      FROM submissions s JOIN teams t ON t.id = s.team_id
      WHERE s.question_id = p_question_id
        AND ABS(s.retail_final - v_first_val) < EPSILON LIMIT 1;
      v_awards := v_awards || jsonb_build_object(
        'teamId', r.team_id, 'color', r.color,
        'points', 3, 'reason', 'closest_without_going_over'
      );
    ELSE
      v_has_tie := true;
      SELECT array_agg(s.team_id::text ORDER BY s.team_id::text) INTO v_eligible_ids
      FROM submissions s
      WHERE s.question_id = p_question_id AND ABS(s.retail_final - v_first_val) < EPSILON;
      v_tie_id := format('first:%s:%s', ROUND(v_first_val,2), array_to_string(v_eligible_ids,'-'));
      v_tie_groups := v_tie_groups || jsonb_build_object(
        'id', v_tie_id, 'slot', 'first', 'points', 3,
        'retailGuess', v_first_val, 'eligibleTeamIds', to_jsonb(v_eligible_ids)
      );
    END IF;

    SELECT MAX(s.retail_final) INTO v_second_val
    FROM submissions s
    WHERE s.question_id = p_question_id
      AND s.retail_final IS NOT NULL
      AND s.status IN ('locked','auto_locked')
      AND s.retail_final <= v_answer + EPSILON
      AND ABS(s.retail_final - v_first_val) >= EPSILON;

    IF v_second_val IS NOT NULL THEN
      SELECT COUNT(*) INTO v_second_count
      FROM submissions s
      WHERE s.question_id = p_question_id
        AND ABS(s.retail_final - v_second_val) < EPSILON;

      IF v_second_count = 1 THEN
        SELECT s.team_id::text, t.color::text INTO r
        FROM submissions s JOIN teams t ON t.id = s.team_id
        WHERE s.question_id = p_question_id
          AND ABS(s.retail_final - v_second_val) < EPSILON LIMIT 1;
        v_awards := v_awards || jsonb_build_object(
          'teamId', r.team_id, 'color', r.color,
          'points', 1, 'reason', 'second_closest'
        );
      ELSE
        v_has_tie := true;
        SELECT array_agg(s.team_id::text ORDER BY s.team_id::text) INTO v_eligible_ids
        FROM submissions s
        WHERE s.question_id = p_question_id AND ABS(s.retail_final - v_second_val) < EPSILON;
        v_tie_id := format('second:%s:%s', ROUND(v_second_val,2), array_to_string(v_eligible_ids,'-'));
        v_tie_groups := v_tie_groups || jsonb_build_object(
          'id', v_tie_id, 'slot', 'second', 'points', 1,
          'retailGuess', v_second_val, 'eligibleTeamIds', to_jsonb(v_eligible_ids)
        );
      END IF;
    END IF;

  -- 6b. All-over path
  ELSIF v_valid_count > 0 THEN
    SELECT MIN(ABS(s.retail_final - v_answer)) INTO v_all_min
    FROM submissions s
    WHERE s.question_id = p_question_id
      AND s.retail_final IS NOT NULL
      AND s.status IN ('locked','auto_locked');

    SELECT COUNT(*) INTO v_all_cnt
    FROM submissions s
    WHERE s.question_id = p_question_id
      AND ABS(ABS(s.retail_final - v_answer) - v_all_min) < EPSILON;

    IF v_all_cnt = 1 THEN
      SELECT s.team_id::text, t.color::text INTO r
      FROM submissions s JOIN teams t ON t.id = s.team_id
      WHERE s.question_id = p_question_id
        AND ABS(ABS(s.retail_final - v_answer) - v_all_min) < EPSILON LIMIT 1;
      v_awards := v_awards || jsonb_build_object(
        'teamId', r.team_id, 'color', r.color,
        'points', 1, 'reason', 'all_over_closest'
      );
    ELSE
      v_has_tie := true;
      SELECT array_agg(s.team_id::text ORDER BY s.team_id::text) INTO v_eligible_ids
      FROM submissions s
      WHERE s.question_id = p_question_id
        AND ABS(ABS(s.retail_final - v_answer) - v_all_min) < EPSILON;
      SELECT s.retail_final INTO v_first_val
      FROM submissions s
      WHERE s.question_id = p_question_id
        AND ABS(ABS(s.retail_final - v_answer) - v_all_min) < EPSILON LIMIT 1;
      v_tie_id := format('all_over:%s:%s', ROUND(v_first_val,2), array_to_string(v_eligible_ids,'-'));
      v_tie_groups := v_tie_groups || jsonb_build_object(
        'id', v_tie_id, 'slot', 'all_over', 'points', 1,
        'retailGuess', v_first_val, 'eligibleTeamIds', to_jsonb(v_eligible_ids)
      );
    END IF;
  END IF;

  -- 7. Persist score plan on the question
  UPDATE session_questions SET
    pending_score_plan = jsonb_build_object(
      'answerPaidPrice',      v_answer,
      'awards',               v_awards,
      'tieGroups',            v_tie_groups,
      'noSubmissionTeamIds',  COALESCE(v_no_sub_ids,'[]'::jsonb)
    ),
    closed_at = COALESCE(closed_at, now())
  WHERE id = p_question_id;

  -- 8. No tie: apply awards now
  IF NOT v_has_tie THEN
    PERFORM apply_score_awards(p_session_id, p_question_id, v_awards);
    UPDATE session_questions SET final_awards = v_awards WHERE id = p_question_id;
    RETURN false;
  END IF;

  -- 9. Mark tie-eligible submissions
  FOR r IN
    SELECT jsonb_array_elements_text(tg->'eligibleTeamIds') AS tid
    FROM jsonb_array_elements(v_tie_groups) tg
  LOOP
    UPDATE submissions SET tie_eligible = true, updated_at = now()
    WHERE question_id = p_question_id AND team_id = r.tid::uuid;
  END LOOP;

  RETURN true;
END;
$$;
