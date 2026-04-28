-- Supabase schema for training session tracking and load monitor
--
-- Usage:
-- 1. New deployment: execute the whole file.
-- 2. Existing deployment: execute the whole file or start from the
--    "Incremental patch" section. Every statement is idempotent.

-- ---------------------------------------------------------------------------
-- Base tables
-- ---------------------------------------------------------------------------

create table if not exists public.training_sessions (
    id uuid primary key,
    plan_date date not null,
    status text not null default 'active',
    rest_interval_seconds integer not null default 90,
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    notes text,
    session_name text,
    session_slot text,
    session_rpe numeric,
    duration_minutes integer,
    session_load numeric,
    metadata jsonb,
    inserted_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.training_sets (
    id uuid primary key,
    session_id uuid references public.training_sessions(id) on delete cascade,
    exercise text not null,
    set_number integer not null,
    group_name text,
    group_type text default 'single',
    round_number integer,
    component_index integer,
    component_name text,
    actual_reps integer,
    actual_metric_type text,
    actual_value numeric,
    actual_unit text,
    actual_weight text,
    rpe numeric,
    rest_seconds integer,
    notes text,
    completed_at timestamptz not null default now()
);

create table if not exists public.training_day_metrics (
    date date primary key,
    body_weight_kg numeric,
    fatigue_score numeric,
    pain_score numeric,
    daily_note text,
    metadata jsonb,
    inserted_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Incremental patch for existing deployments
-- ---------------------------------------------------------------------------

alter table if exists public.training_sessions
    add column if not exists notes text,
    add column if not exists session_name text,
    add column if not exists session_slot text,
    add column if not exists session_rpe numeric,
    add column if not exists duration_minutes integer,
    add column if not exists session_load numeric,
    add column if not exists metadata jsonb,
    add column if not exists inserted_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

alter table if exists public.training_sets
    add column if not exists actual_reps integer,
    add column if not exists actual_weight text,
    add column if not exists rpe numeric,
    add column if not exists rest_seconds integer,
    add column if not exists notes text,
    add column if not exists group_name text,
    add column if not exists group_type text default 'single',
    add column if not exists round_number integer,
    add column if not exists component_index integer,
    add column if not exists component_name text,
    add column if not exists actual_metric_type text,
    add column if not exists actual_value numeric,
    add column if not exists actual_unit text,
    add column if not exists completed_at timestamptz not null default now();

alter table if exists public.training_day_metrics
    add column if not exists body_weight_kg numeric,
    add column if not exists fatigue_score numeric,
    add column if not exists pain_score numeric,
    add column if not exists daily_note text,
    add column if not exists metadata jsonb,
    add column if not exists inserted_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists training_sessions_plan_date_idx
    on public.training_sessions (plan_date) where status = 'active';

create index if not exists training_sessions_plan_date_completed_idx
    on public.training_sessions (plan_date, completed_at desc);

create index if not exists training_sets_session_id_idx
    on public.training_sets (session_id);

create index if not exists training_sets_group_round_idx
    on public.training_sets (session_id, group_name, round_number, component_index);

alter table if exists public.training_sets
    drop constraint if exists training_sets_unique_set;

drop index if exists public.training_sets_unique_set;

create unique index if not exists training_sets_unique_set
    on public.training_sets (session_id, coalesce(group_name, exercise), set_number, component_index);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists training_sessions_set_updated on public.training_sessions;
create trigger training_sessions_set_updated
before update on public.training_sessions
for each row execute procedure public.touch_updated_at();

drop trigger if exists training_day_metrics_set_updated on public.training_day_metrics;
create trigger training_day_metrics_set_updated
before update on public.training_day_metrics
for each row execute procedure public.touch_updated_at();
