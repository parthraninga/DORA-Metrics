CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.repos (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    repo_name text NOT NULL,
    created_at timestamptz DEFAULT now(),
    prod_branch text,
    stage_branch text,
    dev_branch text NOT NULL,
    org_name text NOT NULL,
    cfr_type text NOT NULL,
    token_id uuid NOT NULL,
    workflow_file text,
    pr_merge_config jsonb,
    last_fetched_at timestamptz
);

CREATE TABLE public.tokens (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    token text NOT NULL,
    type text NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.teams (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.team_repos (
    team_id uuid NOT NULL,
    repo_id uuid NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.fetch_data (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    repo_id uuid NOT NULL,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    state text NOT NULL,
    raw_response jsonb
);

CREATE TABLE public.pull_requests (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    repo_id uuid NOT NULL,
    fetch_data_id uuid NOT NULL,
    pr_no bigint NOT NULL,
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
    comments bigint
);

CREATE TABLE public.workflow_runs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    repo_id uuid NOT NULL,
    fetch_data_id uuid NOT NULL,
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

CREATE TABLE public.incidents (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    repo_id uuid NOT NULL,
    fetch_data_id uuid NOT NULL,
    pull_request_id uuid,
    workflow_run_id bigint NOT NULL,
    created_at timestamptz DEFAULT now(),
    pr_no bigint,
    creation_date timestamptz,
    resolved_date timestamptz
);