-- Team Showcase finale.
-- Winning team bids on the combined paid price of five prizes.
-- Secret state (prices, bid, assignments) lives server-side only; clients get
-- a sanitized jsonb feed on session_public_state.showcase where prize prices
-- appear only after the admin reveals them.

BEGIN;

-- ── Secret state table (no client policies: server/RPC access only) ─────────
CREATE TABLE IF NOT EXISTS public.showcase_secret (
  session_id uuid PRIMARY KEY REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  phase text NOT NULL DEFAULT 'intro',
  winning_team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  prizes jsonb NOT NULL DEFAULT '[]'::jsonb,       -- [{key,name,image,price}]
  bid_draft numeric(10,2),
  bid numeric(10,2),
  revealed_count integer NOT NULL DEFAULT 0,
  assignments jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{player,prizeKey,prizeName,prizeImage}]
  drawn_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.showcase_secret ENABLE ROW LEVEL SECURITY;

-- ── Sanitized feed column ───────────────────────────────────────────────────
ALTER TABLE public.session_public_state
  ADD COLUMN IF NOT EXISTS showcase jsonb;

-- ── Publisher: build the sanitized showcase feed ────────────────────────────
CREATE OR REPLACE FUNCTION public.showcase_publish(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_sec  showcase_secret%rowtype;
  v_team teams%rowtype;
  v_prizes jsonb;
  v_total numeric(10,2);
  v_running numeric(10,2);
  v_bid numeric(10,2);
  v_won boolean;
  v_assign jsonb;
  v_bonus jsonb;
  v_version bigint;
BEGIN
  SELECT * INTO v_sec FROM showcase_secret WHERE session_id = p_session_id;
  IF NOT FOUND THEN
    UPDATE session_public_state SET showcase = NULL, updated_at = now()
    WHERE session_id = p_session_id;
    RETURN;
  END IF;

  SELECT * INTO v_team FROM teams WHERE id = v_sec.winning_team_id;

  -- Prices only for revealed prizes; running total covers revealed only.
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

  -- Bid becomes public once locked; total/verdict only in late phases.
  v_bid := CASE WHEN v_sec.phase IN ('bidding','intro') THEN NULL ELSE v_sec.bid END;
  v_won := CASE WHEN v_sec.phase IN ('result','drawing','done')
                THEN (v_sec.bid IS NOT NULL AND v_sec.bid <= v_total)
                ELSE NULL END;

  SELECT COALESCE(jsonb_agg(a ORDER BY ord), '[]'::jsonb) INTO v_assign
  FROM jsonb_array_elements(v_sec.assignments) WITH ORDINALITY AS t(a, ord)
  WHERE (ord - 1) < v_sec.drawn_count;

  -- Prizes never assigned to a player (team has < 5 members) — shown at 'done'.
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
      'winningColor',    v_team.color,
      'winningTeamName', v_team.display_name,
      'players',         to_jsonb(v_team.player_names),
      'prizes',          v_prizes,
      'runningTotal',    v_running,
      'actualTotal', CASE WHEN v_sec.phase IN ('total','result','drawing','done')
                          THEN to_jsonb(v_total) ELSE 'null'::jsonb END,
      'bid',             v_bid,
      'bidEntered',      (v_sec.bid_draft IS NOT NULL OR v_sec.bid IS NOT NULL),
      'won',             v_won,
      'assignments',     v_assign,
      'bonusPrizes',     v_bonus
    ),
    state_version = v_version,
    updated_at = now()
  WHERE session_id = p_session_id;
END;
$$;

-- ── Admin control RPC: one entry point, action-switched ─────────────────────
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
BEGIN
  SELECT * INTO v_sess FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF v_sess.admin_user_id <> auth.uid() THEN RAISE EXCEPTION 'Not the session admin'; END IF;
  IF v_sess.state_version <> p_state_version THEN RAISE EXCEPTION 'Stale state version'; END IF;

  IF p_action = 'start' THEN
    -- Top team advances. A tie for first must be resolved before the showcase.
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
    VALUES (p_session_id, 'intro', v_team.id, v_prizes)
    ON CONFLICT (session_id) DO UPDATE SET
      phase = 'intro', winning_team_id = EXCLUDED.winning_team_id,
      prizes = EXCLUDED.prizes, bid_draft = NULL, bid = NULL,
      revealed_count = 0, assignments = '[]'::jsonb, drawn_count = 0,
      updated_at = now();

    UPDATE game_sessions SET phase = 'showcase',
      state_version = state_version + 1, updated_at = now()
    WHERE id = p_session_id;

  ELSE
    SELECT * INTO v_sec FROM showcase_secret WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Showcase has not started'; END IF;

    IF p_action = 'open_bidding' THEN
      UPDATE showcase_secret SET phase = 'bidding', updated_at = now()
      WHERE session_id = p_session_id;

    ELSIF p_action = 'lock_bid' THEN
      IF COALESCE(v_sec.bid, v_sec.bid_draft) IS NULL THEN
        RAISE EXCEPTION 'No bid entered yet';
      END IF;
      UPDATE showcase_secret SET bid = COALESCE(bid, bid_draft),
        phase = 'locked', updated_at = now()
      WHERE session_id = p_session_id;

    ELSIF p_action = 'reveal_next' THEN
      IF v_sec.bid IS NULL THEN RAISE EXCEPTION 'Lock the bid first'; END IF;
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
      UPDATE showcase_secret SET phase = 'result', updated_at = now()
      WHERE session_id = p_session_id;

    ELSIF p_action = 'start_drawing' THEN
      SELECT * INTO v_team FROM teams WHERE id = v_sec.winning_team_id;
      v_players := v_team.player_names;
      IF v_players IS NULL OR cardinality(v_players) = 0 THEN
        RAISE EXCEPTION 'Winning team has no player names';
      END IF;
      -- One unique random prize per player (players beyond 5 get none;
      -- prizes beyond the player count surface later as team bonus prizes).
      WITH shuffled AS (
        SELECT p, row_number() OVER (ORDER BY random()) AS rn
        FROM jsonb_array_elements(v_sec.prizes) AS p
      ), plist AS (
        SELECT unnest(v_players) AS player, generate_series(1, cardinality(v_players)) AS rn
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'player',     plist.player,
        'prizeKey',   shuffled.p->>'key',
        'prizeName',  shuffled.p->>'name',
        'prizeImage', shuffled.p->>'image'
      ) ORDER BY plist.rn), '[]'::jsonb)
      INTO v_assignments
      FROM plist JOIN shuffled ON shuffled.rn = plist.rn;

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

  PERFORM showcase_publish(p_session_id);
  RETURN jsonb_build_object('status', 'ok', 'action', p_action);
END;
$$;

GRANT EXECUTE ON FUNCTION public.showcase_admin(uuid, bigint, text) TO authenticated;

-- ── Winning team's bid (draft save + optional lock) ─────────────────────────
CREATE OR REPLACE FUNCTION public.showcase_team_bid(
  p_session_id uuid,
  p_bid numeric,
  p_lock boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_sec showcase_secret%rowtype;
  v_team teams%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_bid IS NOT NULL AND p_bid < 0 THEN RAISE EXCEPTION 'Bid must be non-negative'; END IF;

  SELECT * INTO v_sec FROM showcase_secret WHERE session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Showcase has not started'; END IF;
  IF v_sec.phase NOT IN ('intro','bidding') THEN RAISE EXCEPTION 'Bidding is closed'; END IF;

  SELECT * INTO v_team FROM teams WHERE id = v_sec.winning_team_id;
  IF v_team.owner_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the winning team may bid';
  END IF;

  UPDATE showcase_secret SET
    bid_draft = COALESCE(p_bid, bid_draft),
    bid  = CASE WHEN p_lock THEN COALESCE(p_bid, bid_draft) ELSE bid END,
    phase = CASE WHEN p_lock THEN 'locked' ELSE phase END,
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

GRANT EXECUTE ON FUNCTION public.showcase_team_bid(uuid, numeric, boolean) TO authenticated;

COMMIT;
