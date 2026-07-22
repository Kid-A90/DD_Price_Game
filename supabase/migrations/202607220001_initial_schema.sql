-- Designs Direct Live Price Game
-- Initial durable schema. Private answers and store metadata never live in the public-state table.

create extension if not exists pgcrypto;

create type public.game_phase as enum (
  'lobby',
  'question_ready',
  'question_open',
  'question_locked',
  'tie_break_open',
  'tie_break_locked',
  'reveal',
  'leaderboard',
  'showcase',
  'complete'
);

create type public.team_color as enum ('red', 'blue', 'yellow', 'green');
create type public.submission_status as enum ('draft', 'locked', 'auto_locked', 'no_submission', 'late');

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{4,8}$'),
  title text not null default 'Designs Direct Live Price Game',
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  phase public.game_phase not null default 'lobby',
  lobby_locked boolean not null default false,
  current_question_id uuid,
  state_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  color public.team_color not null,
  display_name text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  player_names text[] not null default '{}',
  total_score integer not null default 0,
  claimed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (session_id, color),
  unique (session_id, owner_user_id),
  check (cardinality(player_names) <= 5)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  public_name text not null,
  category text,
  brand_public text,
  retailer_private text,
  paid_price numeric(10,2),
  candidate_paid_price numeric(10,2),
  regular_price_private numeric(10,2),
  benchmark_cost numeric(10,2),
  public_image_path text,
  source_image_path_private text,
  image_status text not null default 'needs_exact_product_cleanup',
  ready_for_game boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (paid_price is null or paid_price >= 0),
  check (benchmark_cost is null or benchmark_cost >= 0)
);

create table public.session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  position integer not null,
  round_key text not null,
  timer_seconds integer not null check (timer_seconds between 5 and 300),
  public_name_snapshot text not null,
  public_image_path_snapshot text,
  answer_paid_price numeric(10,2) not null,
  benchmark_cost numeric(10,2),
  opened_at timestamptz,
  deadline_at timestamptz,
  closed_at timestamptz,
  revealed_at timestamptz,
  pending_score_plan jsonb,
  final_awards jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, position)
);

alter table public.game_sessions
  add constraint game_sessions_current_question_fk
  foreign key (current_question_id) references public.session_questions(id) on delete set null;

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.session_questions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  retail_draft numeric(10,2),
  retail_final numeric(10,2),
  status public.submission_status not null default 'draft',
  draft_updated_at timestamptz,
  locked_at timestamptz,
  tie_eligible boolean not null default false,
  benchmark_guess numeric(10,2),
  benchmark_locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, team_id),
  check (retail_draft is null or retail_draft >= 0),
  check (retail_final is null or retail_final >= 0),
  check (benchmark_guess is null or benchmark_guess >= 0)
);

create table public.score_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  question_id uuid references public.session_questions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  points integer not null,
  reason text not null,
  event_key text not null unique,
  created_at timestamptz not null default now()
);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- This is the only broad realtime table. It contains no unrevealed answer or store metadata.
create table public.session_public_state (
  session_id uuid primary key references public.game_sessions(id) on delete cascade,
  code text not null unique,
  phase public.game_phase not null default 'lobby',
  current_question_id uuid,
  round_label text,
  question_label text,
  product_name text,
  public_image_path text,
  deadline_at timestamptz,
  team_statuses jsonb not null default '[]'::jsonb,
  tie_break_eligible_colors text[] not null default '{}',
  reveal_paid_price numeric(10,2),
  point_awards jsonb,
  leaderboard jsonb not null default '[]'::jsonb,
  animation_cue text,
  state_version bigint not null default 0,
  updated_at timestamptz not null default now()
);

create index submissions_question_idx on public.submissions(question_id);
create index teams_session_idx on public.teams(session_id);
create index questions_session_position_idx on public.session_questions(session_id, position);
create index score_events_session_idx on public.score_events(session_id, created_at);

-- Realtime publication. Safe public state and each team's own submission rows are enough for the UI.
alter publication supabase_realtime add table public.session_public_state;
alter publication supabase_realtime add table public.teams;
alter publication supabase_realtime add table public.submissions;
