-- Run in Supabase SQL Editor. Add last_fetched_at to Repos and create fetch_data table.

-- Add last_fetched_at to Repos (nullable; set when a fetch completes successfully)
alter table public."Repos"
  add column if not exists last_fetched_at timestamptz default null;

-- fetch_data: one row per repo per fetch run
create table if not exists public.fetch_data (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public."Repos"(id) on delete cascade,
  fetched_at timestamptz not null default now(),
  state text not null check (state in ('processing', 'success', 'failure')),
  raw_response jsonb
);

create index if not exists idx_fetch_data_repo_id on public.fetch_data(repo_id);
create index if not exists idx_fetch_data_fetched_at on public.fetch_data(fetched_at desc);
