-- ============================================================
-- Designs Direct Live Price Game — Combined Migration Script
-- Paste this entire file into Supabase → SQL Editor → Run
-- Safe to re-run: all CREATE statements use IF NOT EXISTS /
-- CREATE OR REPLACE / ON CONFLICT DO NOTHING idioms.
-- ============================================================

-- ── Migration 1: Initial schema ─────────────────────────────

create extension if not exists pgcrypto;

-- Enums (idempotent via DO block)
DO $$ BEGIN
  CREATE TYPE public.game_phase AS ENUM (
    'lobby','question_ready','question_open','question_locked',
    'tie_break_open','tie_break_locked','reveal','leaderboard','showcase','complete'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.team_color AS ENUM ('red','blue','yellow','green');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.submission_status AS ENUM
    ('draft','locked','auto_locked','no_submission','late');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{4,8}$'),
  title text NOT NULL DEFAULT 'Designs Direct Live Price Game',
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  phase public.game_phase NOT NULL DEFAULT 'lobby',
  lobby_locked boolean NOT NULL DEFAULT false,
  current_question_id uuid,
  state_version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  color public.team_color NOT NULL,
  display_name text NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  player_names text[] NOT NULL DEFAULT '{}',
  total_score integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, color),
  UNIQUE (session_id, owner_user_id),
  CHECK (cardinality(player_names) <= 5)
);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  public_name text NOT NULL,
  category text,
  brand_public text,
  retailer_private text,
  paid_price numeric(10,2),
  candidate_paid_price numeric(10,2),
  regular_price_private numeric(10,2),
  benchmark_cost numeric(10,2),
  public_image_path text,
  source_image_path_private text,
  image_status text NOT NULL DEFAULT 'needs_exact_product_cleanup',
  ready_for_game boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (paid_price IS NULL OR paid_price >= 0),
  CHECK (benchmark_cost IS NULL OR benchmark_cost >= 0)
);

CREATE TABLE IF NOT EXISTS public.session_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  position integer NOT NULL,
  round_key text NOT NULL,
  timer_seconds integer NOT NULL CHECK (timer_seconds BETWEEN 5 AND 300),
  public_name_snapshot text NOT NULL,
  public_image_path_snapshot text,
  answer_paid_price numeric(10,2) NOT NULL,
  benchmark_cost numeric(10,2),
  opened_at timestamptz,
  deadline_at timestamptz,
  closed_at timestamptz,
  revealed_at timestamptz,
  pending_score_plan jsonb,
  final_awards jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, position)
);

-- FK from game_sessions to session_questions (deferred to avoid cycle)
DO $$ BEGIN
  ALTER TABLE public.game_sessions
    ADD CONSTRAINT game_sessions_current_question_fk
    FOREIGN KEY (current_question_id) REFERENCES public.session_questions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.session_questions(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  retail_draft numeric(10,2),
  retail_final numeric(10,2),
  status public.submission_status NOT NULL DEFAULT 'draft',
  draft_updated_at timestamptz,
  locked_at timestamptz,
  tie_eligible boolean NOT NULL DEFAULT false,
  benchmark_guess numeric(10,2),
  benchmark_locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, team_id),
  CHECK (retail_draft IS NULL OR retail_draft >= 0),
  CHECK (retail_final IS NULL OR retail_final >= 0),
  CHECK (benchmark_guess IS NULL OR benchmark_guess >= 0)
);

CREATE TABLE IF NOT EXISTS public.score_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.session_questions(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  points integer NOT NULL,
  reason text NOT NULL,
  event_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.session_public_state (
  session_id uuid PRIMARY KEY REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  phase public.game_phase NOT NULL DEFAULT 'lobby',
  current_question_id uuid,
  round_label text,
  question_label text,
  product_name text,
  public_image_path text,
  deadline_at timestamptz,
  team_statuses jsonb NOT NULL DEFAULT '[]'::jsonb,
  tie_break_eligible_colors text[] NOT NULL DEFAULT '{}',
  reveal_paid_price numeric(10,2),
  point_awards jsonb,
  leaderboard jsonb NOT NULL DEFAULT '[]'::jsonb,
  animation_cue text,
  state_version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS submissions_question_idx ON public.submissions(question_id);
CREATE INDEX IF NOT EXISTS teams_session_idx ON public.teams(session_id);
CREATE INDEX IF NOT EXISTS questions_session_position_idx ON public.session_questions(session_id, position);
CREATE INDEX IF NOT EXISTS score_events_session_idx ON public.score_events(session_id, created_at);

-- Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_public_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.teams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.submissions;

-- ── Migration 2: RLS + team RPCs ────────────────────────────

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_public_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "public state is readable by signed-in event devices"
    ON public.session_public_state FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "team roster is readable by signed-in event devices"
    ON public.teams FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "team owners can read their submissions"
    ON public.submissions FOR SELECT TO authenticated
    USING (owner_user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "team owners can create their submissions"
    ON public.submissions FOR INSERT TO authenticated
    WITH CHECK (owner_user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "team owners can update their submissions"
    ON public.submissions FOR UPDATE TO authenticated
    USING (owner_user_id = (SELECT auth.uid()))
    WITH CHECK (owner_user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "session admin can read session row"
    ON public.game_sessions FOR SELECT TO authenticated
    USING (admin_user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "session admin can update session row"
    ON public.game_sessions FOR UPDATE TO authenticated
    USING (admin_user_id = (SELECT auth.uid()))
    WITH CHECK (admin_user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.claim_team(
  p_session_code text,
  p_color public.team_color,
  p_player_names text[]
)
RETURNS TABLE (
  team_id uuid, session_id uuid, color public.team_color, display_name text, player_names text[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_session public.game_sessions%rowtype;
  v_team    public.teams%rowtype;
  v_uid     uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Anonymous authentication is required'; END IF;
  IF cardinality(p_player_names) < 1 OR cardinality(p_player_names) > 5 THEN
    RAISE EXCEPTION 'Enter between one and five player names';
  END IF;

  SELECT * INTO v_session FROM public.game_sessions
  WHERE code = upper(trim(p_session_code)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF v_session.lobby_locked THEN RAISE EXCEPTION 'Lobby is locked'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.teams
    WHERE teams.session_id = v_session.id AND owner_user_id = v_uid AND color <> p_color
  ) THEN RAISE EXCEPTION 'This device already owns another team'; END IF;

  SELECT * INTO v_team FROM public.teams
  WHERE teams.session_id = v_session.id AND teams.color = p_color FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Team not found'; END IF;
  IF v_team.owner_user_id IS NOT NULL AND v_team.owner_user_id <> v_uid THEN
    RAISE EXCEPTION 'Team is already claimed';
  END IF;

  UPDATE public.teams SET
    owner_user_id = v_uid,
    player_names  = p_player_names,
    claimed_at    = COALESCE(claimed_at, now()),
    updated_at    = now()
  WHERE id = v_team.id RETURNING * INTO v_team;

  RETURN QUERY SELECT v_team.id, v_team.session_id, v_team.color, v_team.display_name, v_team.player_names;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_team(text, public.team_color, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_retail_draft(p_question_id uuid, p_guess numeric)
RETURNS public.submissions LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_question   public.session_questions%rowtype;
  v_session    public.game_sessions%rowtype;
  v_team       public.teams%rowtype;
  v_submission public.submissions%rowtype;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Anonymous authentication is required'; END IF;
  IF p_guess IS NOT NULL AND p_guess < 0 THEN RAISE EXCEPTION 'Guess must be non-negative'; END IF;

  SELECT * INTO v_question FROM public.session_questions WHERE id = p_question_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found'; END IF;

  SELECT * INTO v_session FROM public.game_sessions WHERE id = v_question.session_id;
  IF v_session.phase <> 'question_open' THEN RAISE EXCEPTION 'Question is not open'; END IF;
  IF v_question.deadline_at IS NULL OR now() > v_question.deadline_at THEN
    RAISE EXCEPTION 'Deadline has passed';
  END IF;

  SELECT * INTO v_team FROM public.teams
  WHERE session_id = v_question.session_id AND owner_user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'This device does not own a team in the session'; END IF;

  INSERT INTO public.submissions (question_id, team_id, owner_user_id, retail_draft, status, draft_updated_at, updated_at)
  VALUES (p_question_id, v_team.id, v_uid, p_guess, 'draft', now(), now())
  ON CONFLICT (question_id, team_id) DO UPDATE SET
    retail_draft     = EXCLUDED.retail_draft,
    status           = 'draft',
    draft_updated_at = now(),
    updated_at       = now()
  RETURNING * INTO v_submission;

  RETURN v_submission;
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_retail_draft(uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.lock_retail_guess(p_question_id uuid)
RETURNS public.submissions LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_question   public.session_questions%rowtype;
  v_team       public.teams%rowtype;
  v_submission public.submissions%rowtype;
BEGIN
  SELECT * INTO v_question FROM public.session_questions WHERE id = p_question_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found'; END IF;
  IF v_question.deadline_at IS NULL OR now() > v_question.deadline_at THEN
    RAISE EXCEPTION 'Deadline has passed';
  END IF;

  SELECT * INTO v_team FROM public.teams
  WHERE session_id = v_question.session_id AND owner_user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Team ownership not found'; END IF;

  UPDATE public.submissions SET
    retail_final = retail_draft,
    status       = CASE WHEN retail_draft IS NULL THEN 'no_submission' ELSE 'locked' END,
    locked_at    = now(),
    updated_at   = now()
  WHERE question_id = p_question_id AND team_id = v_team.id AND owner_user_id = v_uid
  RETURNING * INTO v_submission;

  IF NOT FOUND THEN RAISE EXCEPTION 'No draft exists'; END IF;
  RETURN v_submission;
END;
$$;
GRANT EXECUTE ON FUNCTION public.lock_retail_guess(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_benchmark_guess(p_question_id uuid, p_guess numeric)
RETURNS public.submissions LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_session    public.game_sessions%rowtype;
  v_team       public.teams%rowtype;
  v_submission public.submissions%rowtype;
BEGIN
  IF p_guess IS NULL OR p_guess < 0 THEN RAISE EXCEPTION 'Benchmark guess must be valid'; END IF;

  SELECT gs.* INTO v_session FROM public.game_sessions gs
  JOIN public.session_questions q ON q.session_id = gs.id WHERE q.id = p_question_id;
  IF v_session.phase <> 'tie_break_open' THEN RAISE EXCEPTION 'Tie-break is not open'; END IF;

  SELECT * INTO v_team FROM public.teams
  WHERE session_id = v_session.id AND owner_user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Team ownership not found'; END IF;

  UPDATE public.submissions SET
    benchmark_guess      = p_guess,
    benchmark_locked_at  = now(),
    updated_at           = now()
  WHERE question_id = p_question_id AND team_id = v_team.id AND owner_user_id = v_uid AND tie_eligible = true
  RETURNING * INTO v_submission;

  IF NOT FOUND THEN RAISE EXCEPTION 'Team is not eligible for this tie-break'; END IF;
  RETURN v_submission;
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_benchmark_guess(uuid, numeric) TO authenticated;

-- ── Migration 4: Admin RPC suite ────────────────────────────
-- (Migration 3 is a contract documentation stub only — no DDL)

ALTER TABLE public.game_sessions
  ADD COLUMN IF NOT EXISTS paused_remaining_ms bigint;

DO $$ BEGIN
  CREATE POLICY "session admin can read own session questions"
    ON public.session_questions FOR SELECT TO authenticated
    USING (session_id IN (
      SELECT id FROM public.game_sessions WHERE admin_user_id = (SELECT auth.uid())
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "session admin can read own products via questions"
    ON public.products FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.session_questions sq
      JOIN public.game_sessions gs ON gs.id = sq.session_id
      WHERE sq.product_id = products.id AND gs.admin_user_id = (SELECT auth.uid())
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "session admin can read audit log"
    ON public.admin_audit_log FOR SELECT TO authenticated
    USING (admin_user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "session admin can read score events"
    ON public.score_events FOR SELECT TO authenticated
    USING (session_id IN (
      SELECT id FROM public.game_sessions WHERE admin_user_id = (SELECT auth.uid())
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.sync_public_state(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_sess           game_sessions%rowtype;
  v_q              session_questions%rowtype;
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
      'tieEligible', COALESCE(s.tie_eligible, false)
    )
    ORDER BY CASE t.color::text WHEN 'red' THEN 1 WHEN 'blue' THEN 2 WHEN 'yellow' THEN 3 ELSE 4 END
  )
  INTO v_team_statuses
  FROM teams t
  LEFT JOIN submissions s ON s.team_id = t.id AND s.question_id = v_sess.current_question_id
  WHERE t.session_id = p_session_id;

  IF v_sess.phase IN ('tie_break_open','tie_break_locked') THEN
    SELECT array_agg(t.color::text) INTO v_tie_colors
    FROM teams t
    JOIN submissions s ON s.team_id = t.id AND s.question_id = v_sess.current_question_id AND s.tie_eligible = true
    WHERE t.session_id = p_session_id;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object('color',t.color,'displayName',t.display_name,'playerNames',to_jsonb(t.player_names),'score',t.total_score)
    ORDER BY t.total_score DESC, CASE t.color::text WHEN 'red' THEN 1 WHEN 'blue' THEN 2 WHEN 'yellow' THEN 3 ELSE 4 END
  ) INTO v_leaderboard FROM teams t WHERE t.session_id = p_session_id;

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
    question_label            = EXCLUDED.question_label,
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

CREATE OR REPLACE FUNCTION public.apply_score_awards(p_session_id uuid, p_question_id uuid, p_awards jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_award jsonb; BEGIN
  FOR v_award IN SELECT * FROM jsonb_array_elements(p_awards) LOOP
    INSERT INTO score_events (session_id, question_id, team_id, points, reason, event_key)
    VALUES (
      p_session_id, p_question_id, (v_award->>'teamId')::uuid,
      (v_award->>'points')::integer, v_award->>'reason',
      format('session:%s:question:%s:team:%s:reason:%s', p_session_id, p_question_id, v_award->>'teamId', v_award->>'reason')
    )
    ON CONFLICT (event_key) DO NOTHING;
  END LOOP;

  UPDATE teams t SET
    total_score = COALESCE((SELECT SUM(se.points) FROM score_events se WHERE se.team_id = t.id AND se.session_id = p_session_id), 0),
    updated_at = now()
  WHERE t.session_id = p_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_and_score_question(p_question_id uuid, p_session_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
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

  INSERT INTO submissions (question_id, team_id, owner_user_id, status, updated_at)
  SELECT p_question_id, t.id, COALESCE(t.owner_user_id, gen_random_uuid()), 'no_submission', now()
  FROM teams t
  WHERE t.session_id = p_session_id
    AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.question_id = p_question_id AND s.team_id = t.id)
  ON CONFLICT (question_id, team_id) DO NOTHING;

  UPDATE submissions SET
    retail_final = CASE WHEN status='draft' AND retail_draft IS NOT NULL AND draft_updated_at <= v_q.deadline_at THEN retail_draft ELSE NULL END,
    status       = CASE WHEN status='draft' AND retail_draft IS NOT NULL AND draft_updated_at <= v_q.deadline_at THEN 'auto_locked' WHEN status='draft' THEN 'no_submission' ELSE status END,
    updated_at   = now()
  WHERE question_id = p_question_id;

  SELECT jsonb_agg(to_jsonb(t.id::text)) INTO v_no_sub_ids
  FROM submissions s JOIN teams t ON t.id = s.team_id
  WHERE s.question_id = p_question_id AND s.status = 'no_submission';

  -- Exact price bonus
  FOR r IN SELECT s.team_id::text AS tid, t.color::text AS color FROM submissions s JOIN teams t ON t.id = s.team_id
    WHERE s.question_id = p_question_id AND s.retail_final IS NOT NULL AND ABS(s.retail_final - v_answer) < EPSILON
  LOOP
    v_awards := v_awards || jsonb_build_object('teamId',r.tid,'color',r.color,'points',1,'reason','exact_paid_price');
  END LOOP;

  SELECT COUNT(*) INTO v_valid_count FROM submissions s WHERE s.question_id = p_question_id AND s.retail_final IS NOT NULL AND s.status IN ('locked','auto_locked');
  SELECT COUNT(*) INTO v_under_count FROM submissions s WHERE s.question_id = p_question_id AND s.retail_final IS NOT NULL AND s.status IN ('locked','auto_locked') AND s.retail_final <= v_answer + EPSILON;

  IF v_under_count > 0 THEN
    SELECT MAX(s.retail_final) INTO v_first_val FROM submissions s WHERE s.question_id = p_question_id AND s.retail_final IS NOT NULL AND s.status IN ('locked','auto_locked') AND s.retail_final <= v_answer + EPSILON;
    SELECT COUNT(*) INTO v_first_count FROM submissions s WHERE s.question_id = p_question_id AND ABS(s.retail_final - v_first_val) < EPSILON;
    IF v_first_count = 1 THEN
      SELECT s.team_id::text, t.color::text INTO r FROM submissions s JOIN teams t ON t.id = s.team_id WHERE s.question_id = p_question_id AND ABS(s.retail_final - v_first_val) < EPSILON LIMIT 1;
      v_awards := v_awards || jsonb_build_object('teamId',r.team_id,'color',r.color,'points',3,'reason','closest_without_going_over');
    ELSE
      v_has_tie := true;
      SELECT array_agg(s.team_id::text ORDER BY s.team_id::text) INTO v_eligible_ids FROM submissions s WHERE s.question_id = p_question_id AND ABS(s.retail_final - v_first_val) < EPSILON;
      v_tie_id := format('first:%s:%s', ROUND(v_first_val,2), array_to_string(v_eligible_ids,'-'));
      v_tie_groups := v_tie_groups || jsonb_build_object('id',v_tie_id,'slot','first','points',3,'retailGuess',v_first_val,'eligibleTeamIds',to_jsonb(v_eligible_ids));
    END IF;

    SELECT MAX(s.retail_final) INTO v_second_val FROM submissions s WHERE s.question_id = p_question_id AND s.retail_final IS NOT NULL AND s.status IN ('locked','auto_locked') AND s.retail_final <= v_answer + EPSILON AND ABS(s.retail_final - v_first_val) >= EPSILON;
    IF v_second_val IS NOT NULL THEN
      SELECT COUNT(*) INTO v_second_count FROM submissions s WHERE s.question_id = p_question_id AND ABS(s.retail_final - v_second_val) < EPSILON;
      IF v_second_count = 1 THEN
        SELECT s.team_id::text, t.color::text INTO r FROM submissions s JOIN teams t ON t.id = s.team_id WHERE s.question_id = p_question_id AND ABS(s.retail_final - v_second_val) < EPSILON LIMIT 1;
        v_awards := v_awards || jsonb_build_object('teamId',r.team_id,'color',r.color,'points',1,'reason','second_closest');
      ELSE
        v_has_tie := true;
        SELECT array_agg(s.team_id::text ORDER BY s.team_id::text) INTO v_eligible_ids FROM submissions s WHERE s.question_id = p_question_id AND ABS(s.retail_final - v_second_val) < EPSILON;
        v_tie_id := format('second:%s:%s', ROUND(v_second_val,2), array_to_string(v_eligible_ids,'-'));
        v_tie_groups := v_tie_groups || jsonb_build_object('id',v_tie_id,'slot','second','points',1,'retailGuess',v_second_val,'eligibleTeamIds',to_jsonb(v_eligible_ids));
      END IF;
    END IF;

  ELSIF v_valid_count > 0 THEN
    SELECT MIN(ABS(s.retail_final - v_answer)) INTO v_all_min FROM submissions s WHERE s.question_id = p_question_id AND s.retail_final IS NOT NULL AND s.status IN ('locked','auto_locked');
    SELECT COUNT(*) INTO v_all_cnt FROM submissions s WHERE s.question_id = p_question_id AND ABS(ABS(s.retail_final - v_answer) - v_all_min) < EPSILON;
    IF v_all_cnt = 1 THEN
      SELECT s.team_id::text, t.color::text INTO r FROM submissions s JOIN teams t ON t.id = s.team_id WHERE s.question_id = p_question_id AND ABS(ABS(s.retail_final - v_answer) - v_all_min) < EPSILON LIMIT 1;
      v_awards := v_awards || jsonb_build_object('teamId',r.team_id,'color',r.color,'points',1,'reason','all_over_closest');
    ELSE
      v_has_tie := true;
      SELECT array_agg(s.team_id::text ORDER BY s.team_id::text) INTO v_eligible_ids FROM submissions s WHERE s.question_id = p_question_id AND ABS(ABS(s.retail_final - v_answer) - v_all_min) < EPSILON;
      SELECT s.retail_final INTO v_first_val FROM submissions s WHERE s.question_id = p_question_id AND ABS(ABS(s.retail_final - v_answer) - v_all_min) < EPSILON LIMIT 1;
      v_tie_id := format('all_over:%s:%s', ROUND(v_first_val,2), array_to_string(v_eligible_ids,'-'));
      v_tie_groups := v_tie_groups || jsonb_build_object('id',v_tie_id,'slot','all_over','points',1,'retailGuess',v_first_val,'eligibleTeamIds',to_jsonb(v_eligible_ids));
    END IF;
  END IF;

  UPDATE session_questions SET
    pending_score_plan = jsonb_build_object('answerPaidPrice',v_answer,'awards',v_awards,'tieGroups',v_tie_groups,'noSubmissionTeamIds',COALESCE(v_no_sub_ids,'[]'::jsonb)),
    closed_at = COALESCE(closed_at, now())
  WHERE id = p_question_id;

  IF NOT v_has_tie THEN
    PERFORM apply_score_awards(p_session_id, p_question_id, v_awards);
    UPDATE session_questions SET final_awards = v_awards WHERE id = p_question_id;
    RETURN false;
  END IF;

  FOR r IN SELECT jsonb_array_elements_text(tg->'eligibleTeamIds') AS tid FROM jsonb_array_elements(v_tie_groups) tg LOOP
    UPDATE submissions SET tie_eligible = true, updated_at = now()
    WHERE question_id = p_question_id AND team_id = r.tid::uuid;
  END LOOP;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_session(p_title text, p_code text, p_admin_uid uuid)
RETURNS TABLE (session_id uuid, code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_session_id uuid;
  v_code       text := upper(trim(p_code));
  v_color      public.team_color;
  v_label      text;
BEGIN
  IF v_code !~ '^[A-Z0-9]{4,8}$' THEN RAISE EXCEPTION 'Code must be 4–8 uppercase alphanumeric characters'; END IF;
  INSERT INTO game_sessions (code, title, admin_user_id)
  VALUES (v_code, COALESCE(p_title,'Designs Direct Live Price Game'), p_admin_uid)
  RETURNING id INTO v_session_id;
  FOREACH v_color IN ARRAY ARRAY['red','blue','yellow','green']::public.team_color[] LOOP
    v_label := initcap(v_color::text) || ' Team';
    INSERT INTO teams (session_id, color, display_name, player_names) VALUES (v_session_id, v_color, v_label, '{}');
  END LOOP;
  PERFORM sync_public_state(v_session_id);
  RETURN QUERY SELECT v_session_id, v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_lock_lobby(p_session_id uuid, p_state_version bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_sess game_sessions%rowtype; BEGIN
  SELECT * INTO v_sess FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF v_sess.admin_user_id <> (SELECT auth.uid()) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  IF v_sess.state_version <> p_state_version THEN RAISE EXCEPTION 'Stale state version; refresh and retry'; END IF;
  IF v_sess.phase <> 'lobby' THEN RAISE EXCEPTION 'Lobby is not open'; END IF;
  UPDATE game_sessions SET lobby_locked=true, state_version=state_version+1, updated_at=now() WHERE id=p_session_id;
  PERFORM sync_public_state(p_session_id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_unlock_lobby(p_session_id uuid, p_state_version bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_sess game_sessions%rowtype; BEGIN
  SELECT * INTO v_sess FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_sess.admin_user_id <> (SELECT auth.uid()) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  IF v_sess.state_version <> p_state_version THEN RAISE EXCEPTION 'Stale state version'; END IF;
  UPDATE game_sessions SET lobby_locked=false, state_version=state_version+1, updated_at=now() WHERE id=p_session_id;
  PERFORM sync_public_state(p_session_id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_load_question(p_session_id uuid, p_question_id uuid, p_state_version bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_sess game_sessions%rowtype; BEGIN
  SELECT * INTO v_sess FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_sess.admin_user_id <> (SELECT auth.uid()) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  IF v_sess.state_version <> p_state_version THEN RAISE EXCEPTION 'Stale state version'; END IF;
  IF v_sess.phase NOT IN ('lobby','leaderboard','showcase','question_ready') THEN RAISE EXCEPTION 'Cannot load question from phase %', v_sess.phase; END IF;
  IF NOT EXISTS (SELECT 1 FROM session_questions WHERE id = p_question_id AND session_id = p_session_id) THEN RAISE EXCEPTION 'Question not found in this session'; END IF;
  UPDATE game_sessions SET phase='question_ready', current_question_id=p_question_id, state_version=state_version+1, updated_at=now() WHERE id=p_session_id;
  PERFORM sync_public_state(p_session_id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_open_question(p_session_id uuid, p_state_version bigint, p_override_seconds integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_sess game_sessions%rowtype; v_q session_questions%rowtype; v_secs integer; BEGIN
  SELECT * INTO v_sess FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_sess.admin_user_id <> (SELECT auth.uid()) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  IF v_sess.state_version <> p_state_version THEN RAISE EXCEPTION 'Stale state version'; END IF;
  IF v_sess.phase <> 'question_ready' THEN RAISE EXCEPTION 'Expected question_ready, got %', v_sess.phase; END IF;
  IF v_sess.current_question_id IS NULL THEN RAISE EXCEPTION 'No question loaded'; END IF;
  SELECT * INTO v_q FROM session_questions WHERE id = v_sess.current_question_id;
  v_secs := COALESCE(p_override_seconds, v_q.timer_seconds);
  UPDATE session_questions SET opened_at=COALESCE(opened_at,clock_timestamp()), deadline_at=clock_timestamp()+make_interval(secs=>v_secs) WHERE id=v_q.id;
  UPDATE game_sessions SET phase='question_open', paused_remaining_ms=NULL, state_version=state_version+1, updated_at=now() WHERE id=p_session_id;
  PERFORM sync_public_state(p_session_id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_pause_timer(p_session_id uuid, p_state_version bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_sess game_sessions%rowtype; v_q_id uuid; v_remaining bigint; BEGIN
  SELECT * INTO v_sess FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_sess.admin_user_id <> (SELECT auth.uid()) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  IF v_sess.state_version <> p_state_version THEN RAISE EXCEPTION 'Stale state version'; END IF;
  IF v_sess.phase <> 'question_open' THEN RAISE EXCEPTION 'Question is not open'; END IF;
  v_q_id := v_sess.current_question_id;
  SELECT GREATEST(0, EXTRACT(EPOCH FROM (deadline_at - clock_timestamp())) * 1000)::bigint INTO v_remaining FROM session_questions WHERE id = v_q_id;
  UPDATE session_questions SET deadline_at = NULL WHERE id = v_q_id;
  UPDATE game_sessions SET paused_remaining_ms=v_remaining, state_version=state_version+1, updated_at=now() WHERE id=p_session_id;
  PERFORM sync_public_state(p_session_id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_resume_timer(p_session_id uuid, p_state_version bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_sess game_sessions%rowtype; BEGIN
  SELECT * INTO v_sess FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_sess.admin_user_id <> (SELECT auth.uid()) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  IF v_sess.state_version <> p_state_version THEN RAISE EXCEPTION 'Stale state version'; END IF;
  IF v_sess.phase <> 'question_open' THEN RAISE EXCEPTION 'Question is not open'; END IF;
  IF v_sess.paused_remaining_ms IS NULL THEN RAISE EXCEPTION 'Timer is not paused'; END IF;
  UPDATE session_questions SET deadline_at=clock_timestamp()+make_interval(secs=>v_sess.paused_remaining_ms::float/1000.0) WHERE id=v_sess.current_question_id;
  UPDATE game_sessions SET paused_remaining_ms=NULL, state_version=state_version+1, updated_at=now() WHERE id=p_session_id;
  PERFORM sync_public_state(p_session_id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_close_question(p_session_id uuid, p_state_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_sess game_sessions%rowtype; v_needs_tie boolean; v_plan jsonb; BEGIN
  SELECT * INTO v_sess FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_sess.admin_user_id <> (SELECT auth.uid()) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  IF v_sess.state_version <> p_state_version THEN RAISE EXCEPTION 'Stale state version'; END IF;
  IF v_sess.phase <> 'question_open' THEN RAISE EXCEPTION 'Question is not open (phase: %)', v_sess.phase; END IF;
  v_needs_tie := finalize_and_score_question(v_sess.current_question_id, p_session_id);
  IF v_needs_tie THEN
    UPDATE game_sessions SET phase='tie_break_open', state_version=state_version+1, updated_at=now() WHERE id=p_session_id;
    SELECT pending_score_plan INTO v_plan FROM session_questions WHERE id = v_sess.current_question_id;
    PERFORM sync_public_state(p_session_id);
    RETURN jsonb_build_object('status','needs_tie_break','tieGroups',v_plan->'tieGroups');
  ELSE
    UPDATE game_sessions SET phase='question_locked', state_version=state_version+1, updated_at=now() WHERE id=p_session_id;
    PERFORM sync_public_state(p_session_id);
    RETURN jsonb_build_object('status','resolved');
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_close_question_auto(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_sess game_sessions%rowtype; v_needs_tie boolean; v_plan jsonb; BEGIN
  SELECT * INTO v_sess FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF v_sess.phase <> 'question_open' THEN RETURN jsonb_build_object('status','noop'); END IF;
  IF EXISTS (SELECT 1 FROM session_questions WHERE id = v_sess.current_question_id AND deadline_at > clock_timestamp()) THEN
    RETURN jsonb_build_object('status','not_expired');
  END IF;
  v_needs_tie := finalize_and_score_question(v_sess.current_question_id, p_session_id);
  UPDATE game_sessions SET phase=CASE WHEN v_needs_tie THEN 'tie_break_open' ELSE 'question_locked' END, state_version=state_version+1, updated_at=now() WHERE id=p_session_id;
  IF v_needs_tie THEN
    SELECT pending_score_plan INTO v_plan FROM session_questions WHERE id = v_sess.current_question_id;
    PERFORM sync_public_state(p_session_id);
    RETURN jsonb_build_object('status','needs_tie_break','tieGroups',v_plan->'tieGroups');
  END IF;
  PERFORM sync_public_state(p_session_id);
  RETURN jsonb_build_object('status','resolved');
END; $$;

CREATE OR REPLACE FUNCTION public.admin_close_tie_break(p_session_id uuid, p_state_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_sess       game_sessions%rowtype;
  v_q          session_questions%rowtype;
  v_plan       jsonb;
  v_benchmark  numeric(10,2);
  v_awards     jsonb;
  v_unresolved jsonb := '[]'::jsonb;
  v_tg         jsonb;
  v_best_dist  numeric;
  v_winner_id  text;
  v_winner_col text;
  EPSILON CONSTANT numeric := 0.00001;
  r            record;
BEGIN
  SELECT * INTO v_sess FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_sess.admin_user_id <> (SELECT auth.uid()) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  IF v_sess.state_version <> p_state_version THEN RAISE EXCEPTION 'Stale state version'; END IF;
  IF v_sess.phase <> 'tie_break_open' THEN RAISE EXCEPTION 'Expected tie_break_open, got %', v_sess.phase; END IF;
  SELECT * INTO v_q FROM session_questions WHERE id = v_sess.current_question_id;
  v_plan := v_q.pending_score_plan; v_benchmark := v_q.benchmark_cost; v_awards := v_plan->'awards';
  IF v_benchmark IS NULL THEN RAISE EXCEPTION 'benchmark_cost not set on this question'; END IF;
  FOR v_tg IN SELECT * FROM jsonb_array_elements(v_plan->'tieGroups') LOOP
    v_best_dist := NULL; v_winner_id := NULL; v_winner_col := NULL;
    FOR r IN
      SELECT s.team_id::text AS tid, t.color::text AS color, s.benchmark_guess
      FROM submissions s JOIN teams t ON t.id = s.team_id
      WHERE s.question_id = v_q.id AND s.tie_eligible = true AND s.benchmark_guess IS NOT NULL
        AND s.team_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(v_tg->'eligibleTeamIds')))
    LOOP
      DECLARE v_d numeric := ABS(r.benchmark_guess - v_benchmark); BEGIN
        IF v_best_dist IS NULL OR v_d < v_best_dist - EPSILON THEN
          v_best_dist := v_d; v_winner_id := r.tid; v_winner_col := r.color;
        ELSIF ABS(v_d - v_best_dist) < EPSILON THEN v_winner_id := NULL; END IF;
      END;
    END LOOP;
    IF v_winner_id IS NOT NULL THEN
      v_awards := v_awards || jsonb_build_object('teamId',v_winner_id,'color',v_winner_col,'points',(v_tg->>'points')::integer,'reason','tie_break_winner');
    ELSE v_unresolved := v_unresolved || v_tg; END IF;
  END LOOP;
  IF jsonb_array_length(v_unresolved) > 0 THEN
    UPDATE session_questions SET pending_score_plan=jsonb_set(jsonb_set(v_plan,'{awards}',v_awards),'{tieGroups}',v_unresolved) WHERE id=v_q.id;
    PERFORM sync_public_state(p_session_id);
    RETURN jsonb_build_object('status','still_tied','unresolvedGroups',v_unresolved);
  END IF;
  PERFORM apply_score_awards(p_session_id, v_q.id, v_awards);
  UPDATE session_questions SET final_awards = v_awards WHERE id = v_q.id;
  UPDATE game_sessions SET phase='tie_break_locked', state_version=state_version+1, updated_at=now() WHERE id=p_session_id;
  PERFORM sync_public_state(p_session_id);
  RETURN jsonb_build_object('status','resolved');
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_equal_points(p_session_id uuid, p_state_version bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_sess   game_sessions%rowtype;
  v_q      session_questions%rowtype;
  v_plan   jsonb;
  v_awards jsonb;
  v_tg     jsonb;
  v_tid    text;
  v_color  text;
BEGIN
  SELECT * INTO v_sess FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_sess.admin_user_id <> (SELECT auth.uid()) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  IF v_sess.state_version <> p_state_version THEN RAISE EXCEPTION 'Stale state version'; END IF;
  IF v_sess.phase NOT IN ('tie_break_open','tie_break_locked') THEN RAISE EXCEPTION 'Not in a tie-break phase'; END IF;
  SELECT * INTO v_q FROM session_questions WHERE id = v_sess.current_question_id;
  v_plan := v_q.pending_score_plan; v_awards := v_plan->'awards';
  FOR v_tg IN SELECT * FROM jsonb_array_elements(v_plan->'tieGroups') LOOP
    FOR v_tid IN SELECT jsonb_array_elements_text(v_tg->'eligibleTeamIds') LOOP
      SELECT t.color::text INTO v_color FROM teams t WHERE t.id = v_tid::uuid;
      v_awards := v_awards || jsonb_build_object('teamId',v_tid,'color',v_color,'points',(v_tg->>'points')::integer,'reason','tie_break_winner');
    END LOOP;
  END LOOP;
  PERFORM apply_score_awards(p_session_id, v_q.id, v_awards);
  UPDATE session_questions SET final_awards=v_awards, pending_score_plan=jsonb_set(v_plan,'{tieGroups}','[]'::jsonb) WHERE id=v_q.id;
  UPDATE game_sessions SET phase='tie_break_locked', state_version=state_version+1, updated_at=now() WHERE id=p_session_id;
  PERFORM sync_public_state(p_session_id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_reveal_question(p_session_id uuid, p_state_version bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_sess game_sessions%rowtype; BEGIN
  SELECT * INTO v_sess FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_sess.admin_user_id <> (SELECT auth.uid()) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  IF v_sess.state_version <> p_state_version THEN RAISE EXCEPTION 'Stale state version'; END IF;
  IF v_sess.phase NOT IN ('question_locked','tie_break_locked') THEN RAISE EXCEPTION 'Cannot reveal from phase %', v_sess.phase; END IF;
  UPDATE session_questions SET revealed_at = now() WHERE id = v_sess.current_question_id;
  UPDATE game_sessions SET phase='reveal', state_version=state_version+1, updated_at=now() WHERE id=p_session_id;
  PERFORM sync_public_state(p_session_id);
  UPDATE session_public_state SET animation_cue = 'price_reveal' WHERE session_id = p_session_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_advance(p_session_id uuid, p_target text, p_state_version bigint, p_next_question_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_sess game_sessions%rowtype; v_new_phase public.game_phase; BEGIN
  SELECT * INTO v_sess FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_sess.admin_user_id <> (SELECT auth.uid()) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  IF v_sess.state_version <> p_state_version THEN RAISE EXCEPTION 'Stale state version'; END IF;
  v_new_phase := p_target::public.game_phase;
  IF v_sess.phase = 'reveal' AND v_new_phase <> 'leaderboard' THEN RAISE EXCEPTION 'From reveal, advance must target leaderboard'; END IF;
  IF v_sess.phase = 'leaderboard' AND v_new_phase NOT IN ('question_ready','showcase','complete') THEN RAISE EXCEPTION 'Invalid advance target from leaderboard: %', p_target; END IF;
  IF v_sess.phase = 'showcase' AND v_new_phase NOT IN ('question_ready','complete') THEN RAISE EXCEPTION 'Invalid advance target from showcase: %', p_target; END IF;
  UPDATE game_sessions SET
    phase = v_new_phase,
    current_question_id = CASE WHEN v_new_phase = 'question_ready' AND p_next_question_id IS NOT NULL THEN p_next_question_id WHEN v_new_phase IN ('complete','lobby') THEN NULL ELSE current_question_id END,
    state_version = state_version+1, updated_at = now()
  WHERE id = p_session_id;
  PERFORM sync_public_state(p_session_id);
  IF v_new_phase = 'leaderboard' THEN UPDATE session_public_state SET animation_cue = NULL WHERE session_id = p_session_id; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_release_team(p_session_id uuid, p_color text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := (SELECT auth.uid()); BEGIN
  IF NOT EXISTS (SELECT 1 FROM game_sessions WHERE id = p_session_id AND admin_user_id = v_uid) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  UPDATE teams SET owner_user_id=NULL, player_names='{}', claimed_at=NULL, updated_at=now()
  WHERE session_id = p_session_id AND color = p_color::public.team_color;
  INSERT INTO admin_audit_log (session_id, admin_user_id, action, payload)
  VALUES (p_session_id, v_uid, 'release_team', jsonb_build_object('color', p_color));
  PERFORM sync_public_state(p_session_id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_correct_score(p_session_id uuid, p_team_id uuid, p_delta integer, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := (SELECT auth.uid()); v_key text; BEGIN
  IF NOT EXISTS (SELECT 1 FROM game_sessions WHERE id = p_session_id AND admin_user_id = v_uid) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  v_key := format('session:%s:team:%s:correction:%s:%s', p_session_id, p_team_id, p_reason, extract(epoch from now())::bigint);
  INSERT INTO score_events (session_id, question_id, team_id, points, reason, event_key) VALUES (p_session_id, NULL, p_team_id, p_delta, p_reason, v_key);
  UPDATE teams SET total_score=COALESCE((SELECT SUM(se.points) FROM score_events se WHERE se.team_id=p_team_id AND se.session_id=p_session_id),0), updated_at=now() WHERE id=p_team_id;
  INSERT INTO admin_audit_log (session_id, admin_user_id, action, payload) VALUES (p_session_id, v_uid, 'correct_score', jsonb_build_object('teamId',p_team_id,'delta',p_delta,'reason',p_reason));
  PERFORM sync_public_state(p_session_id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_add_session_question(p_session_id uuid, p_product_id uuid, p_position integer, p_round_key text, p_timer_seconds integer DEFAULT 30, p_benchmark_override numeric DEFAULT NULL)
RETURNS session_questions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := (SELECT auth.uid()); v_prod products%rowtype; v_q session_questions%rowtype; BEGIN
  IF NOT EXISTS (SELECT 1 FROM game_sessions WHERE id = p_session_id AND admin_user_id = v_uid) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  SELECT * INTO v_prod FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF NOT v_prod.ready_for_game THEN RAISE EXCEPTION 'Product is not ready for game'; END IF;
  IF v_prod.paid_price IS NULL THEN RAISE EXCEPTION 'Product has no confirmed paid price'; END IF;
  UPDATE session_questions SET position = position + 1 WHERE session_id = p_session_id AND position >= p_position;
  INSERT INTO session_questions (session_id, product_id, position, round_key, timer_seconds, public_name_snapshot, public_image_path_snapshot, answer_paid_price, benchmark_cost)
  VALUES (p_session_id, p_product_id, p_position, p_round_key, p_timer_seconds, v_prod.public_name, v_prod.public_image_path, v_prod.paid_price, COALESCE(p_benchmark_override, v_prod.benchmark_cost))
  RETURNING * INTO v_q;
  RETURN v_q;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_remove_session_question(p_session_id uuid, p_question_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := (SELECT auth.uid()); v_pos integer; BEGIN
  IF NOT EXISTS (SELECT 1 FROM game_sessions WHERE id = p_session_id AND admin_user_id = v_uid) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  IF EXISTS (SELECT 1 FROM game_sessions WHERE id = p_session_id AND current_question_id = p_question_id) THEN RAISE EXCEPTION 'Cannot remove the currently active question'; END IF;
  SELECT position INTO v_pos FROM session_questions WHERE id = p_question_id;
  DELETE FROM session_questions WHERE id = p_question_id AND session_id = p_session_id;
  UPDATE session_questions SET position = position - 1 WHERE session_id = p_session_id AND position > v_pos;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_reorder_question(p_session_id uuid, p_question_id uuid, p_new_position integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := (SELECT auth.uid()); v_old_pos integer; BEGIN
  IF NOT EXISTS (SELECT 1 FROM game_sessions WHERE id = p_session_id AND admin_user_id = v_uid) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  SELECT position INTO v_old_pos FROM session_questions WHERE id = p_question_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found'; END IF;
  IF v_old_pos = p_new_position THEN RETURN; END IF;
  IF v_old_pos < p_new_position THEN
    UPDATE session_questions SET position = position - 1 WHERE session_id = p_session_id AND position > v_old_pos AND position <= p_new_position;
  ELSE
    UPDATE session_questions SET position = position + 1 WHERE session_id = p_session_id AND position >= p_new_position AND position < v_old_pos;
  END IF;
  UPDATE session_questions SET position = p_new_position WHERE id = p_question_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_question_benchmark(p_session_id uuid, p_question_id uuid, p_benchmark numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM game_sessions WHERE id = p_session_id AND admin_user_id = (SELECT auth.uid())) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  UPDATE session_questions SET benchmark_cost = p_benchmark WHERE id = p_question_id AND session_id = p_session_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_get_session_questions(p_session_id uuid)
RETURNS TABLE (id uuid, "position" integer, round_key text, timer_seconds integer, public_name_snapshot text, public_image_path_snapshot text, answer_paid_price numeric, benchmark_cost numeric, opened_at timestamptz, closed_at timestamptz, revealed_at timestamptz, final_awards jsonb, pending_score_plan jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM game_sessions WHERE id = p_session_id AND admin_user_id = (SELECT auth.uid())) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  RETURN QUERY SELECT q.id, q.position, q.round_key, q.timer_seconds, q.public_name_snapshot, q.public_image_path_snapshot, q.answer_paid_price, q.benchmark_cost, q.opened_at, q.closed_at, q.revealed_at, q.final_awards, q.pending_score_plan FROM session_questions q WHERE q.session_id = p_session_id ORDER BY q.position;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_get_question_submissions(p_question_id uuid)
RETURNS TABLE (team_id uuid, color public.team_color, display_name text, player_names text[], retail_final numeric, benchmark_guess numeric, status public.submission_status, tie_eligible boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_session_id uuid; BEGIN
  SELECT q.session_id INTO v_session_id FROM session_questions q WHERE q.id = p_question_id;
  IF NOT EXISTS (SELECT 1 FROM game_sessions WHERE id = v_session_id AND admin_user_id = (SELECT auth.uid())) THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  RETURN QUERY SELECT t.id, t.color, t.display_name, t.player_names, s.retail_final, s.benchmark_guess, s.status, COALESCE(s.tie_eligible,false) FROM teams t LEFT JOIN submissions s ON s.team_id = t.id AND s.question_id = p_question_id WHERE t.session_id = v_session_id ORDER BY CASE t.color::text WHEN 'red' THEN 1 WHEN 'blue' THEN 2 WHEN 'yellow' THEN 3 ELSE 4 END;
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_lock_lobby(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unlock_lobby(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_load_question(uuid, uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_open_question(uuid, bigint, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pause_timer(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resume_timer(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_close_question(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_close_tie_break(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_equal_points(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reveal_question(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_advance(uuid, text, bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_release_team(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_correct_score(uuid, uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_session_question(uuid, uuid, integer, text, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_session_question(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reorder_question(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_question_benchmark(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_session_questions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_question_submissions(uuid) TO authenticated;

-- ── Migration 5: Device session read policy ─────────────────

DO $$ BEGIN
  CREATE POLICY "authenticated devices can look up session by code"
    ON public.game_sessions FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Migration 6: Extra product columns ──────────────────────

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_status text NOT NULL DEFAULT 'needs_receipt',
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_round_role text NOT NULL DEFAULT 'library';
