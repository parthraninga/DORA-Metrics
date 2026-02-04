-- Run this in Supabase Dashboard: SQL Editor → New query → paste → Run
-- Creates public.Tokens so the app stops showing: Could not find the table 'public.Tokens' in the schema cache

create table if not exists public."Tokens" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token text not null,
  type text not null check (type in ('github', 'gitlab', 'bitbucket')),
  created_at timestamptz default now()
);

-- Refresh schema cache (Supabase may need a moment to pick up the new table)
-- If the error persists, go to Database → Tables and confirm "Tokens" appears.
