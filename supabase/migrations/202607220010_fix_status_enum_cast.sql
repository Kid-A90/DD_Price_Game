-- Lock-in failed with: column "status" is of type submission_status but
-- expression is of type text. A CASE over two string literals resolves to
-- text, which cannot be implicitly assigned to the enum column. Cast it.

BEGIN;

CREATE OR REPLACE FUNCTION public.lock_retail_guess(p_question_id uuid)
RETURNS public.submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_question public.session_questions%rowtype;
  v_team public.teams%rowtype;
  v_submission public.submissions%rowtype;
BEGIN
  SELECT * INTO v_question FROM public.session_questions WHERE id = p_question_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found'; END IF;
  IF v_question.deadline_at IS NULL OR now() > v_question.deadline_at THEN RAISE EXCEPTION 'Deadline has passed'; END IF;

  SELECT * INTO v_team FROM public.teams
  WHERE session_id = v_question.session_id AND owner_user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Team ownership not found'; END IF;

  UPDATE public.submissions
  SET retail_final = retail_draft,
      status = (CASE WHEN retail_draft IS NULL THEN 'no_submission' ELSE 'locked' END)::public.submission_status,
      locked_at = now(),
      updated_at = now()
  WHERE question_id = p_question_id AND team_id = v_team.id AND owner_user_id = v_uid
  RETURNING * INTO v_submission;

  IF NOT FOUND THEN RAISE EXCEPTION 'No draft exists'; END IF;
  RETURN v_submission;
END;
$$;

-- Same defensive cast in the placeholder creator.
CREATE OR REPLACE FUNCTION public.ensure_submission_placeholders(
  p_question_id uuid,
  p_session_id  uuid
) RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  INSERT INTO public.submissions (question_id, team_id, owner_user_id, status, updated_at)
  SELECT p_question_id, t.id, t.owner_user_id, 'no_submission'::public.submission_status, now()
  FROM public.teams t
  WHERE t.session_id = p_session_id
    AND NOT EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.question_id = p_question_id AND s.team_id = t.id
    )
  ON CONFLICT (question_id, team_id) DO NOTHING;
$$;

COMMIT;
