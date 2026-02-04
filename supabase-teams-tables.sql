-- Run in Supabase SQL Editor. Teams and many-to-many with Repos.

-- Teams: id, name, created_at
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- Junction table: team_id, repo_id, created_at (many-to-many teams <-> Repos)
create table if not exists public.team_repos (
  team_id uuid not null references public.teams(id) on delete cascade,
  repo_id uuid not null references public."Repos"(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (team_id, repo_id)
);

create index if not exists idx_team_repos_team_id on public.team_repos(team_id);
create index if not exists idx_team_repos_repo_id on public.team_repos(repo_id);
