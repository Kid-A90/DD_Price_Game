-- RLS and team-facing RPCs.

alter table public.game_sessions enable row level security;
alter table public.teams enable row level security;
alter table public.products enable row level security;
alter table public.session_questions enable row level security;
alter table public.submissions enable row level security;
alter table public.score_events enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.session_public_state enable row level security;

-- Anonymous sign-ins use the authenticated role in Supabase.
create policy "public state is readable by signed-in event devices"
  on public.session_public_state for select to authenticated using (true);

create policy "team roster is readable by signed-in event devices"
  on public.teams for select to authenticated using (true);

create policy "team owners can read their submissions"
  on public.submissions for select to authenticated
  using (owner_user_id = (select auth.uid()));

create policy "team owners can create their submissions"
  on public.submissions for insert to authenticated
  with check (owner_user_id = (select auth.uid()));

create policy "team owners can update their submissions"
  on public.submissions for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

create policy "session admin can read session row"
  on public.game_sessions for select to authenticated
  using (admin_user_id = (select auth.uid()));

create policy "session admin can update session row"
  on public.game_sessions for update to authenticated
  using (admin_user_id = (select auth.uid()))
  with check (admin_user_id = (select auth.uid()));

-- No client policies are intentionally created for products, questions, score events, or audit logs.
-- They contain answers or private metadata and are accessed by server code or security-definer RPCs only.

create or replace function public.claim_team(
  p_session_code text,
  p_color public.team_color,
  p_player_names text[]
)
returns table (
  team_id uuid,
  session_id uuid,
  color public.team_color,
  display_name text,
  player_names text[]
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.game_sessions%rowtype;
  v_team public.teams%rowtype;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Anonymous authentication is required'; end if;
  if cardinality(p_player_names) < 1 or cardinality(p_player_names) > 5 then
    raise exception 'Enter between one and five player names';
  end if;

  select * into v_session
  from public.game_sessions
  where code = upper(trim(p_session_code))
  for update;

  if not found then raise exception 'Session not found'; end if;
  if v_session.lobby_locked then raise exception 'Lobby is locked'; end if;

  if exists (
    select 1 from public.teams t2
    where t2.session_id = v_session.id
      and t2.owner_user_id = v_uid
      and t2.color <> p_color
  ) then
    raise exception 'This device already owns another team';
  end if;

  select * into v_team
  from public.teams
  where teams.session_id = v_session.id and teams.color = p_color
  for update;

  if not found then raise exception 'Team not found'; end if;
  if v_team.owner_user_id is not null and v_team.owner_user_id <> v_uid then
    raise exception 'Team is already claimed';
  end if;

  update public.teams
  set owner_user_id = v_uid,
      player_names = p_player_names,
      claimed_at = coalesce(claimed_at, now()),
      updated_at = now()
  where id = v_team.id
  returning * into v_team;

  return query select v_team.id, v_team.session_id, v_team.color, v_team.display_name, v_team.player_names;
end;
$$;

grant execute on function public.claim_team(text, public.team_color, text[]) to authenticated;

create or replace function public.save_retail_draft(
  p_question_id uuid,
  p_guess numeric
)
returns public.submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_question public.session_questions%rowtype;
  v_session public.game_sessions%rowtype;
  v_team public.teams%rowtype;
  v_submission public.submissions%rowtype;
begin
  if v_uid is null then raise exception 'Anonymous authentication is required'; end if;
  if p_guess is not null and p_guess < 0 then raise exception 'Guess must be non-negative'; end if;

  select * into v_question from public.session_questions where id = p_question_id;
  if not found then raise exception 'Question not found'; end if;

  select * into v_session from public.game_sessions where id = v_question.session_id;
  if v_session.phase <> 'question_open' then raise exception 'Question is not open'; end if;
  if v_question.deadline_at is null or now() > v_question.deadline_at then raise exception 'Deadline has passed'; end if;

  select * into v_team
  from public.teams
  where session_id = v_question.session_id and owner_user_id = v_uid;
  if not found then raise exception 'This device does not own a team in the session'; end if;

  insert into public.submissions (
    question_id, team_id, owner_user_id, retail_draft, status, draft_updated_at, updated_at
  ) values (
    p_question_id, v_team.id, v_uid, p_guess, 'draft', now(), now()
  )
  on conflict (question_id, team_id) do update
    set retail_draft = excluded.retail_draft,
        status = 'draft',
        draft_updated_at = now(),
        updated_at = now()
  returning * into v_submission;

  return v_submission;
end;
$$;

grant execute on function public.save_retail_draft(uuid, numeric) to authenticated;

create or replace function public.lock_retail_guess(p_question_id uuid)
returns public.submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_question public.session_questions%rowtype;
  v_team public.teams%rowtype;
  v_submission public.submissions%rowtype;
begin
  select * into v_question from public.session_questions where id = p_question_id;
  if not found then raise exception 'Question not found'; end if;
  if v_question.deadline_at is null or now() > v_question.deadline_at then raise exception 'Deadline has passed'; end if;

  select * into v_team from public.teams
  where session_id = v_question.session_id and owner_user_id = v_uid;
  if not found then raise exception 'Team ownership not found'; end if;

  update public.submissions
  set retail_final = retail_draft,
      status = case when retail_draft is null then 'no_submission' else 'locked' end,
      locked_at = now(),
      updated_at = now()
  where question_id = p_question_id and team_id = v_team.id and owner_user_id = v_uid
  returning * into v_submission;

  if not found then raise exception 'No draft exists'; end if;
  return v_submission;
end;
$$;

grant execute on function public.lock_retail_guess(uuid) to authenticated;

create or replace function public.save_benchmark_guess(
  p_question_id uuid,
  p_guess numeric
)
returns public.submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.game_sessions%rowtype;
  v_team public.teams%rowtype;
  v_submission public.submissions%rowtype;
begin
  if p_guess is null or p_guess < 0 then raise exception 'Benchmark guess must be valid'; end if;

  select gs.* into v_session
  from public.game_sessions gs
  join public.session_questions q on q.session_id = gs.id
  where q.id = p_question_id;

  if v_session.phase <> 'tie_break_open' then raise exception 'Tie-break is not open'; end if;

  select * into v_team from public.teams
  where session_id = v_session.id and owner_user_id = v_uid;
  if not found then raise exception 'Team ownership not found'; end if;

  update public.submissions
  set benchmark_guess = p_guess,
      benchmark_locked_at = now(),
      updated_at = now()
  where question_id = p_question_id
    and team_id = v_team.id
    and owner_user_id = v_uid
    and tie_eligible = true
  returning * into v_submission;

  if not found then raise exception 'Team is not eligible for this tie-break'; end if;
  return v_submission;
end;
$$;

grant execute on function public.save_benchmark_guess(uuid, numeric) to authenticated;
