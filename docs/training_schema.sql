-- Supabase schema for training session tracking

create table if not exists public.training_sessions (
    id uuid primary key,
    plan_date date not null,
    status text not null default 'active',
    rest_interval_seconds integer not null default 90,
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    notes text,
    metadata jsonb,
    inserted_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists training_sessions_plan_date_idx
    on public.training_sessions (plan_date) where status = 'active';

create table if not exists public.training_sets (
    id uuid primary key,
    session_id uuid references public.training_sessions(id) on delete cascade,
    exercise text not null,
    set_number integer not null,
    actual_reps integer,
    actual_weight text,
    rpe numeric,
    rest_seconds integer,
    notes text,
    completed_at timestamptz not null default now()
);

create index if not exists training_sets_session_id_idx
    on public.training_sets (session_id);

create unique index if not exists training_sets_unique_set
    on public.training_sets (session_id, exercise, set_number);

-- Trigger to keep updated_at fresh
create or replace function public.touch_training_sessions()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger training_sessions_set_updated
before update on public.training_sessions
for each row execute procedure public.touch_training_sessions();
