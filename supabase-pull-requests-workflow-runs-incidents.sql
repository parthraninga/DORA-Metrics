-- Run in Supabase SQL Editor. Tables for parsed fetch_data: pull_requests, workflow_runs, incidents.

-- pull_requests: from deployments.related_prs
create table if not exists public.pull_requests (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repos(id) on delete cascade,
  fetch_data_id uuid not null references public.fetch_data(id) on delete cascade,
  pr_no bigint not null,
  title text,
  author text,
  first_commit_to_open numeric,
  cycle_time numeric,
  created_at timestamptz,
  updated_at timestamptz,
  state text,
  base_branch text,
  head_branch text,
  commits bigint,
  additions bigint,
  deletions bigint,
  comments bigint,
  unique (repo_id, fetch_data_id, pr_no)
);

-- Add columns if table already exists (run once after initial create)
alter table public.pull_requests add column if not exists base_branch text;
alter table public.pull_requests add column if not exists head_branch text;
alter table public.pull_requests add column if not exists commits bigint;
alter table public.pull_requests add column if not exists additions bigint;
alter table public.pull_requests add column if not exists deletions bigint;
alter table public.pull_requests add column if not exists comments bigint;

create index if not exists idx_pull_requests_repo_id on public.pull_requests(repo_id);
create index if not exists idx_pull_requests_fetch_data_id on public.pull_requests(fetch_data_id);

-- workflow_runs: from Lambda workflow_runs array
create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repos(id) on delete cascade,
  fetch_data_id uuid not null references public.fetch_data(id) on delete cascade,
  run_id bigint,
  name text,
  head_branch text,
  status text,
  conclusion text,
  created_at timestamptz,
  updated_at timestamptz,
  html_url text,
  actor jsonb,
  workflow_id bigint
);

create index if not exists idx_workflow_runs_repo_id on public.workflow_runs(repo_id);
create index if not exists idx_workflow_runs_fetch_data_id on public.workflow_runs(fetch_data_id);
create index if not exists idx_workflow_runs_run_id on public.workflow_runs(run_id);

-- incidents: derived from workflow_runs (failure = creation, next success = resolved)
create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repos(id) on delete cascade,
  fetch_data_id uuid not null references public.fetch_data(id) on delete cascade,
  pull_request_id uuid references public.pull_requests(id) on delete set null,
  workflow_run_id bigint not null,
  pr_no bigint,
  created_at timestamptz default now(),
  creation_date timestamptz,
  resolved_date timestamptz
);

alter table public.incidents add column if not exists pr_no bigint;
alter table public.incidents add column if not exists creation_date timestamptz;
alter table public.incidents add column if not exists resolved_date timestamptz;
create index if not exists idx_incidents_repo_id on public.incidents(repo_id);
create index if not exists idx_incidents_fetch_data_id on public.incidents(fetch_data_id);
create index if not exists idx_incidents_workflow_run_id on public.incidents(workflow_run_id);
