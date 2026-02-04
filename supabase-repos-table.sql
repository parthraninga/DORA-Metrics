-- Run in Supabase SQL Editor. Creates public.repos for Sync Repos page.
-- Use lowercase name so Supabase schema cache and .from('repos') work.

create table if not exists public.repos (
  id uuid primary key default gen_random_uuid(),
  repo_name text not null,
  created_at timestamptz default now(),
  prod_branch text,
  stage_branch text,
  dev_branch text not null,
  org_name text not null,
  cfr_type text not null check (cfr_type in ('CI-CD', 'PR_MERGE')),
  token_id uuid not null,
  workflow_file text,
  pr_merge_config jsonb
);

-- workflow_file: set when cfr_type = 'CI-CD'. pr_merge_config: set when cfr_type = 'PR_MERGE'.
