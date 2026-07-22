-- Showcase v2:
-- * PTO grand-prize door reveal for the game-winning team
-- * ALL teams bid on the combined prize package (no timer; admin closes)
-- * Door reveal for the showcase winner (closest without going over;
--   all over -> closest overall)
-- * Prize drawing cheapest -> most expensive, random name per prize from
--   the showcase-winning team, winners leave the pool
-- Also: admin_set_equal_points is restricted to an OPEN tie-break so slot
-- points can never be double-awarded after resolution.

BEGIN;

ALTER TABLE public.showcase_secret
  ADD COLUMN IF NOT EXISTS team_bids jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS winner_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

-- ── Publisher v2 ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.showcase_publish(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_sec  showcase_secret%rowtype;
  v_gwin teams%rowtype;
  v_swin teams%rowtype;
  v_has_swin boolean := false;
  v_prizes jsonb;
  v_total numeric(10,2);
  v_running numeric(10,2);
  v_bids jsonb;
  v_assign jsonb;
  v_bonus jsonb;
  v_version bigint;
  v_show_bids boolean;
BEGIN
  SELECT * INTO v_sec FROM showcase_secret WHERE session_id = p_session_id;
  IF NOT FOUND THEN
    UPDATE session_public_state SET showcase = NULL, updated_at = now()
    WHERE session_id = p_session_id;
    RETURN;
  END IF;

  SELECT * INTO v_gwin FROM teams WHERE id = v_sec.winning_team_id;
  IF v_sec.winner_team_id IS NOT NULL THEN
    SELECT * INTO v_swin FROM teams WHERE id = v_sec.winner_team_id;
    v_has_swin := FOUND;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'key',      p->>'key',
      'name',     p->>'name',
      'image',    p->>'image',
      'revealed', (ord - 1) < v_sec.revealed_count,
      'price', CASE WHEN (ord - 1) < v_sec.revealed_count
                    THEN to_jsonb((p->>'price')::numeric)
                    ELSE 'null'::jsonb END
    ) ORDER BY ord
  ), '[]'::jsonb),
  COALESCE(SUM(CASE WHEN (ord - 1) < v_sec.revealed_count THEN (p->>'price')::numeric ELSE 0 END), 0)
  INTO v_prizes, v_running
  FROM jsonb_array_elements(v_sec.prizes) WITH ORDINALITY AS t(p, ord);

  SELECT COALESCE(SUM((p->>'price')::numeric), 0) INTO v_total
  FROM jsonb_array_elements(v_sec.prizes) AS p;

  -- Bid values are public only once bidding has closed.
  v_show_bids := v_sec.phase IN ('locked','revealing','total','result','drawing','done');
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'color',       t.color,
      'displayName', t.display_name,
      'locked',      COALESCE((v_sec.team_bids->(t.id::text)->>'locked')::boolean, false),
      'bid', CASE WHEN v_show_bids AND v_sec.team_bids->(t.id::text)->>'bid' IS NOT NULL
                  THEN v_sec.team_bids->(t.id::text)->'bid'
                  ELSE 'null'::jsonb END
    ) ORDER BY CASE t.color::text WHEN 'red' THEN 1 WHEN 'blue' THEN 2 WHEN 'yellow' THEN 3 ELSE 4 END
  ), '[]'::jsonb)
  INTO v_bids
  FROM teams t
  WHERE t.session_id = p_session_id AND t.owner_user_id IS NOT NULL;

  SELECT COALESCE(jsonb_agg(a ORDER BY ord), '[]'::jsonb) INTO v_assign
  FROM jsonb_array_elements(v_sec.assignments) WITH ORDINALITY AS t(a, ord)
  WHERE (ord - 1) < v_sec.drawn_count;

  v_bonus := '[]'::jsonb;
  IF v_sec.phase = 'done' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', p->>'name', 'image', p->>'image')), '[]'::jsonb)
    INTO v_bonus
    FROM jsonb_array_elements(v_sec.prizes) AS p
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_sec.assignments) a
      WHERE a->>'prizeKey' = p->>'key'
    );
  END IF;

  SELECT state_version INTO v_version FROM game_sessions WHERE id = p_session_id;

  UPDATE session_public_state SET
    showcase = jsonb_build_object(
      'phase',           v_sec.phase,
      'gameWinnerColor', v_gwin.color,
      'gameWinnerName',  v_gwin.display_name,
      'winnerColor', CASE WHEN v_has_swin AND v_sec.phase IN ('result','drawing','done')
                          THEN to_jsonb(v_swin.color) ELSE 'null'::jsonb END,
      'winnerName',  CASE WHEN v_has_swin AND v_sec.phase IN ('result','drawing','done')
                          THEN to_jsonb(v_swin.display_name) ELSE 'null'::jsonb END,
      'players', CASE WHEN v_has_swin THEN to_jsonb(v_swin.player_names) ELSE to_jsonb(ARRAY[]::text[]) END,
      'prizes',          v_prizes,
      'runningTotal',    v_running,
      'actualTotal', CASE WHEN v_sec.phase IN ('total','result','drawing','done')
                          THEN to_jsonb(v_total) ELSE 'null'::jsonb END,
      'teamBids',        v_bids,
      'assignments',     v_assign,
      'bonusPrizes',     v_bonus
    ),
    state_version = v_version,
    updated_at = now()
  WHERE session_id = p_session_id;
END;
$$;

-- ── Team bid (any claimed team; save draft or lock own bid) ─────────────────
CREATE OR REPLACE FUNCTION public.showcase_team_bid(
  p_session_id uuid,
  p_bid numeric,
  p_lock boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_sec showcase_secret%rowtype;
  v_team teams%rowtype;
  v_entry jsonb;
  v_draft numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_bid IS NOT NULL AND p_bid < 0 THEN RAISE EXCEPTION 'Bid must be non-negative'; END IF;

  SELECT * INTO v_sec FROM showcase_secret WHERE session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Showcase has not started'; END IF;
  IF v_sec.phase <> 'bidding' THEN RAISE EXCEPTION 'Bidding is not open'; END IF;

  SELECT * INTO v_team FROM teams
  WHERE session_id = p_session_id AND owner_user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'This device does not own a team'; END IF;

  v_entry := COALESCE(v_sec.team_bids->(v_team.id::text), '{}'::jsonb);
  IF COALESCE((v_entry->>'locked')::boolean, false) THEN
    RAISE EXCEPTION 'Your bid is already locked';
  END IF;

  v_draft := COALESCE(p_bid, (v_entry->>'draft')::numeric);
  IF p_lock AND v_draft IS NULL THEN RAISE EXCEPTION 'No bid entered'; END IF;

  UPDATE showcase_secret SET
    team_bids = jsonb_set(team_bids, ARRAY[v_team.id::text], jsonb_build_object(
      'draft',  v_draft,
      'bid',    CASE WHEN p_lock THEN v_draft ELSE NULL END,
      'locked', p_lock
    )),
    updated_at = now()
  WHERE session_id = p_session_id;

  IF p_lock THEN
    UPDATE game_sessions SET state_version = state_version + 1, updated_at = now()
    WHERE id = p_session_id;
  END IF;

  PERFORM showcase_publish(p_session_id);
  RETURN jsonb_build_object('status', CASE WHEN p_lock THEN 'locked' ELSE 'saved' END);
END;
$$;

-- ── Admin control v2 ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.showcase_admin(
  p_session_id uuid,
  p_state_version bigint,
  p_action text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_sess game_sessions%rowtype;
  v_sec  showcase_secret%rowtype;
  v_team teams%rowtype;
  v_prizes jsonb;
  v_prize_count integer;
  v_players text[];
  v_assignments jsonb;
  v_total numeric;
  v_winner uuid;
  v_locked_count integer;
BEGIN
  SELECT * INTO v_sess FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF v_sess.admin_user_id <> auth.uid() THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  IF v_sess.state_version <> p_state_version THEN RAISE EXCEPTION 'Stale state version'; END IF;

  IF p_action = 'start' THEN
    -- Game winner (PTO recipient). A tie for first must be resolved first.
    SELECT * INTO v_team FROM teams
    WHERE session_id = p_session_id AND owner_user_id IS NOT NULL
    ORDER BY total_score DESC,
      CASE color::text WHEN 'red' THEN 1 WHEN 'blue' THEN 2 WHEN 'yellow' THEN 3 ELSE 4 END
    LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'No claimed teams'; END IF;
    IF (SELECT count(*) FROM teams
        WHERE session_id = p_session_id AND owner_user_id IS NOT NULL
          AND total_score = v_team.total_score) > 1 THEN
      RAISE EXCEPTION 'Teams are tied for first. Resolve the tie (score correction) before the showcase.';
    END IF;

    -- Prizes cheapest -> most expensive (drives reveal AND drawing order)
    SELECT jsonb_agg(jsonb_build_object(
      'key',   pr.external_id,
      'name',  pr.public_name,
      'image', pr.public_image_path,
      'price', pr.paid_price
    ) ORDER BY pr.paid_price ASC), count(*)
    INTO v_prizes, v_prize_count
    FROM products pr
    WHERE pr.default_round_role = 'showcase'
      AND pr.active = true AND pr.paid_price IS NOT NULL;
    IF v_prize_count IS DISTINCT FROM 5 THEN
      RAISE EXCEPTION 'Showcase needs exactly 5 seeded prizes, found %', COALESCE(v_prize_count, 0);
    END IF;

    INSERT INTO showcase_secret (session_id, phase, winning_team_id, prizes)
    VALUES (p_session_id, 'pto', v_team.id, v_prizes)
    ON CONFLICT (session_id) DO UPDATE SET
      phase = 'pto', winning_team_id = EXCLUDED.winning_team_id,
      prizes = EXCLUDED.prizes, bid_draft = NULL, bid = NULL,
      team_bids = '{}'::jsonb, winner_team_id = NULL,
      revealed_count = 0, assignments = '[]'::jsonb, drawn_count = 0,
      updated_at = now();

    UPDATE game_sessions SET phase = 'showcase',
      state_version = state_version + 1, updated_at = now()
    WHERE id = p_session_id;

  ELSE
    SELECT * INTO v_sec FROM showcase_secret WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Showcase has not started'; END IF;

    IF p_action = 'intro' THEN
      UPDATE showcase_secret SET phase = 'intro', updated_at = now()
      WHERE session_id = p_session_id;

    ELSIF p_action = 'open_bidding' THEN
      UPDATE showcase_secret SET phase = 'bidding', updated_at = now()
      WHERE session_id = p_session_id;

    ELSIF p_action = 'close_bidding' THEN
      -- Lock any remaining drafts, then freeze.
      SELECT jsonb_object_agg(k, CASE
          WHEN COALESCE((v->>'locked')::boolean, false) THEN v
          WHEN v->>'draft' IS NOT NULL THEN jsonb_build_object(
            'draft', (v->>'draft')::numeric, 'bid', (v->>'draft')::numeric, 'locked', true)
          ELSE v END)
      INTO v_assignments
      FROM jsonb_each(v_sec.team_bids) AS e(k, v);
      v_assignments := COALESCE(v_assignments, '{}'::jsonb);

      SELECT count(*) INTO v_locked_count
      FROM jsonb_each(v_assignments) AS e(k, v)
      WHERE v->>'bid' IS NOT NULL;
      IF v_locked_count = 0 THEN RAISE EXCEPTION 'No bids entered yet'; END IF;

      UPDATE showcase_secret SET team_bids = v_assignments,
        phase = 'locked', updated_at = now()
      WHERE session_id = p_session_id;

    ELSIF p_action = 'reveal_next' THEN
      IF v_sec.phase NOT IN ('locked','revealing') THEN
        RAISE EXCEPTION 'Close bidding before revealing';
      END IF;
      UPDATE showcase_secret SET
        revealed_count = LEAST(revealed_count + 1, jsonb_array_length(prizes)),
        phase = 'revealing', updated_at = now()
      WHERE session_id = p_session_id;

    ELSIF p_action = 'reveal_total' THEN
      IF v_sec.revealed_count < jsonb_array_length(v_sec.prizes) THEN
        RAISE EXCEPTION 'Reveal all prizes before the total';
      END IF;
      UPDATE showcase_secret SET phase = 'total', updated_at = now()
      WHERE session_id = p_session_id;

    ELSIF p_action = 'result' THEN
      SELECT COALESCE(SUM((p->>'price')::numeric), 0) INTO v_total
      FROM jsonb_array_elements(v_sec.prizes) AS p;

      -- Closest without going over; if everyone is over, closest overall.
      SELECT e.k::uuid INTO v_winner
      FROM jsonb_each(v_sec.team_bids) AS e(k, v)
      JOIN teams t ON t.id = e.k::uuid
      WHERE v->>'bid' IS NOT NULL
      ORDER BY
        ((v->>'bid')::numeric > v_total) ASC,              -- under-bidders first
        CASE WHEN (v->>'bid')::numeric <= v_total
             THEN v_total - (v->>'bid')::numeric
             ELSE (v->>'bid')::numeric - v_total END ASC,  -- then closest
        CASE t.color::text WHEN 'red' THEN 1 WHEN 'blue' THEN 2 WHEN 'yellow' THEN 3 ELSE 4 END
      LIMIT 1;
      IF v_winner IS NULL THEN RAISE EXCEPTION 'No locked bids to score'; END IF;

      UPDATE showcase_secret SET winner_team_id = v_winner,
        phase = 'result', updated_at = now()
      WHERE session_id = p_session_id;

    ELSIF p_action = 'start_drawing' THEN
      IF v_sec.winner_team_id IS NULL THEN RAISE EXCEPTION 'Show the winner first'; END IF;
      SELECT * INTO v_team FROM teams WHERE id = v_sec.winner_team_id;
      v_players := v_team.player_names;
      IF v_players IS NULL OR cardinality(v_players) = 0 THEN
        RAISE EXCEPTION 'Winning team has no player names';
      END IF;
      -- Prize order is cheapest -> most expensive (stored order); each prize
      -- draws a distinct random player.
      WITH pr AS (
        SELECT p, row_number() OVER () AS rn
        FROM jsonb_array_elements(v_sec.prizes) AS p
      ), sp AS (
        SELECT player, row_number() OVER (ORDER BY random()) AS rn
        FROM unnest(v_players) AS player
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'prizeKey',   pr.p->>'key',
        'prizeName',  pr.p->>'name',
        'prizeImage', pr.p->>'image',
        'player',     sp.player
      ) ORDER BY pr.rn), '[]'::jsonb)
      INTO v_assignments
      FROM pr JOIN sp ON sp.rn = pr.rn;

      UPDATE showcase_secret SET phase = 'drawing',
        assignments = v_assignments, drawn_count = 0, updated_at = now()
      WHERE session_id = p_session_id;

    ELSIF p_action = 'draw_next' THEN
      UPDATE showcase_secret SET
        drawn_count = LEAST(drawn_count + 1, jsonb_array_length(assignments)),
        updated_at = now()
      WHERE session_id = p_session_id;

    ELSIF p_action = 'finish' THEN
      UPDATE showcase_secret SET phase = 'done',
        drawn_count = jsonb_array_length(assignments), updated_at = now()
      WHERE session_id = p_session_id;

    ELSIF p_action = 'reset' THEN
      DELETE FROM showcase_secret WHERE session_id = p_session_id;
      UPDATE game_sessions SET phase = 'leaderboard',
        state_version = state_version + 1, updated_at = now()
      WHERE id = p_session_id;
      PERFORM sync_public_state(p_session_id);
      PERFORM showcase_publish(p_session_id);
      RETURN jsonb_build_object('status', 'reset');

    ELSE
      RAISE EXCEPTION 'Unknown showcase action: %', p_action;
    END IF;

    UPDATE game_sessions SET state_version = state_version + 1, updated_at = now()
    WHERE id = p_session_id;
  END IF;

  PERFORM sync_public_state(p_session_id);
  PERFORM showcase_publish(p_session_id);
  RETURN jsonb_build_object('status', 'ok', 'action', p_action);
END;
$$;

-- ── Tie-break: equal points ONLY while the tie-break is still open ──────────
CREATE OR REPLACE FUNCTION public.admin_set_equal_points(
  p_session_id   uuid,
  p_state_version bigint
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
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
  IF v_sess.phase <> 'tie_break_open' THEN
    RAISE EXCEPTION 'Equal points is only available while the tie-break is open';
  END IF;

  SELECT * INTO v_q FROM session_questions WHERE id = v_sess.current_question_id;
  v_plan   := v_q.pending_score_plan;
  v_awards := v_plan->'awards';

  FOR v_tg IN SELECT * FROM jsonb_array_elements(v_plan->'tieGroups') LOOP
    FOR v_tid IN SELECT jsonb_array_elements_text(v_tg->'eligibleTeamIds') LOOP
      SELECT t.color::text INTO v_color FROM teams t WHERE t.id = v_tid::uuid;
      v_awards := v_awards || jsonb_build_object(
        'teamId', v_tid, 'color', v_color,
        'points', (v_tg->>'points')::integer, 'reason', 'tie_break_winner'
      );
    END LOOP;
  END LOOP;

  PERFORM apply_score_awards(p_session_id, v_q.id, v_awards);
  UPDATE session_questions SET
    final_awards       = v_awards,
    pending_score_plan = jsonb_set(v_plan,'{tieGroups}','[]'::jsonb)
  WHERE id = v_q.id;
  UPDATE game_sessions SET
    phase         = 'tie_break_locked',
    state_version = state_version + 1,
    updated_at    = now()
  WHERE id = p_session_id;
  PERFORM sync_public_state(p_session_id);
END;
$$;

COMMIT;
