-- showcase_admin changed game_sessions.phase but never called
-- sync_public_state, so session_public_state.phase stayed on the old value
-- and no screen ever entered the showcase. Sync before publishing the
-- sanitized showcase feed (publish must come last: sync does not touch the
-- showcase column, so ordering keeps both fresh).

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

  PERFORM sync_public_state(p_session_id);
  PERFORM showcase_publish(p_session_id);
  RETURN jsonb_build_object('status', 'ok', 'action', p_action);
END;
$$;
