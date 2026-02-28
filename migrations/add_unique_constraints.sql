-- =============================================================================
-- Migration: Add UNIQUE constraints to prevent duplicate ingestion
-- =============================================================================
-- ROOT CAUSE: Without these constraints, PostgreSQL ignores the onConflict clause
-- in Supabase upserts and falls back to a plain INSERT on every sync → duplicates.
--
-- Run this once in the Supabase Dashboard → SQL Editor
-- =============================================================================

-- ── Step 1: Clean any remaining duplicates before adding constraints ──────────

-- workflow_runs: keep the row with the latest updated_at per (repo_id, run_id)
DELETE FROM public.workflow_runs
WHERE id NOT IN (
  SELECT DISTINCT ON (repo_id, run_id) id
  FROM public.workflow_runs
  WHERE run_id IS NOT NULL
  ORDER BY repo_id, run_id, updated_at DESC NULLS LAST
);

-- pull_requests: keep the row with the latest updated_at per (repo_id, pr_no)
DELETE FROM public.pull_requests
WHERE id NOT IN (
  SELECT DISTINCT ON (repo_id, pr_no) id
  FROM public.pull_requests
  WHERE pr_no IS NOT NULL
  ORDER BY repo_id, pr_no, updated_at DESC NULLS LAST
);

-- incidents: keep the row with the latest created_at per (repo_id, workflow_run_id)
DELETE FROM public.incidents
WHERE id NOT IN (
  SELECT DISTINCT ON (repo_id, workflow_run_id) id
  FROM public.incidents
  WHERE workflow_run_id IS NOT NULL
  ORDER BY repo_id, workflow_run_id, created_at DESC NULLS LAST
);

-- ── Step 2: Add UNIQUE constraints ───────────────────────────────────────────

-- workflow_runs: each GitHub run_id must appear only once per repo
ALTER TABLE public.workflow_runs
  ADD CONSTRAINT workflow_runs_repo_id_run_id_key UNIQUE (repo_id, run_id);

-- pull_requests: each PR number must appear only once per repo
ALTER TABLE public.pull_requests
  ADD CONSTRAINT pull_requests_repo_id_pr_no_key UNIQUE (repo_id, pr_no);

-- incidents: each failed workflow run can produce only one incident per repo
ALTER TABLE public.incidents
  ADD CONSTRAINT incidents_repo_id_workflow_run_id_key UNIQUE (repo_id, workflow_run_id);

-- ── Step 3: Fix actor column type (jsonb → text) ─────────────────────────────
-- The ingestion code now stores the actor's username as a plain string.
-- Changing from jsonb to text avoids type-mismatch errors.

ALTER TABLE public.workflow_runs
  ALTER COLUMN actor TYPE text USING (
    CASE
      WHEN actor IS NULL THEN NULL
      -- unwrap JSON string literal "username" → username
      WHEN jsonb_typeof(actor) = 'string' THEN actor #>> '{}'
      -- object like {"login":"username"} → extract first non-null field
      WHEN jsonb_typeof(actor) = 'object' THEN
        COALESCE(actor->>'username', actor->>'login', actor->>'name')
      ELSE actor::text
    END
  );

-- ── Step 4: Verify ───────────────────────────────────────────────────────────

SELECT
  'workflow_runs'   AS tbl,
  COUNT(*)          AS total_rows,
  COUNT(DISTINCT (repo_id::text || '|' || run_id::text)) AS unique_combos
FROM public.workflow_runs WHERE run_id IS NOT NULL

UNION ALL

SELECT
  'pull_requests'   AS tbl,
  COUNT(*)          AS total_rows,
  COUNT(DISTINCT (repo_id::text || '|' || pr_no::text)) AS unique_combos
FROM public.pull_requests WHERE pr_no IS NOT NULL

UNION ALL

SELECT
  'incidents'       AS tbl,
  COUNT(*)          AS total_rows,
  COUNT(DISTINCT (repo_id::text || '|' || workflow_run_id::text)) AS unique_combos
FROM public.incidents WHERE workflow_run_id IS NOT NULL;

-- Expected: total_rows = unique_combos for every table (zero duplicates).
