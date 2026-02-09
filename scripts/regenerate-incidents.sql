-- Script to regenerate incidents from workflow_runs
-- This creates incidents by finding failure runs followed by success runs
-- Run this if incidents are missing or out of sync with workflow_runs

-- First, clear existing incidents (optional - comment out if you want to keep existing ones)
-- DELETE FROM incidents;

-- Create incidents from workflow_runs
-- For each failure run, find the next success run as the resolution
WITH ordered_runs AS (
  SELECT 
    wr.id,
    wr.repo_id,
    wr.fetch_data_id,
    wr.run_id,
    wr.head_branch,
    wr.conclusion,
    wr.created_at,
    wr.updated_at,
    ROW_NUMBER() OVER (PARTITION BY wr.repo_id ORDER BY wr.created_at) as rn
  FROM workflow_runs wr
  WHERE wr.conclusion IN ('success', 'failure')
),
failures AS (
  SELECT 
    repo_id,
    fetch_data_id,
    run_id,
    head_branch,
    created_at as creation_date,
    rn as failure_rn
  FROM ordered_runs
  WHERE conclusion = 'failure'
),
resolutions AS (
  SELECT DISTINCT ON (f.repo_id, f.run_id)
    f.repo_id,
    f.fetch_data_id,
    f.run_id as workflow_run_id,
    f.head_branch,
    f.creation_date,
    s.created_at as resolved_date
  FROM failures f
  LEFT JOIN ordered_runs s ON 
    f.repo_id = s.repo_id 
    AND s.conclusion = 'success' 
    AND s.rn > f.failure_rn
  ORDER BY f.repo_id, f.run_id, s.created_at
)
INSERT INTO incidents (repo_id, fetch_data_id, workflow_run_id, creation_date, resolved_date, created_at, updated_at)
SELECT 
  repo_id,
  fetch_data_id,
  workflow_run_id,
  creation_date,
  resolved_date,
  NOW() as created_at,
  NOW() as updated_at
FROM resolutions
ON CONFLICT (repo_id, workflow_run_id) DO UPDATE SET
  resolved_date = EXCLUDED.resolved_date,
  updated_at = NOW();

-- Check results
SELECT 
  COUNT(*) as total_incidents,
  COUNT(CASE WHEN resolved_date IS NOT NULL THEN 1 END) as resolved_incidents,
  COUNT(CASE WHEN resolved_date IS NULL THEN 1 END) as unresolved_incidents
FROM incidents;

-- Show recent incidents
SELECT 
  i.id,
  i.workflow_run_id,
  wr.head_branch,
  wr.conclusion,
  i.creation_date,
  i.resolved_date,
  CASE 
    WHEN i.resolved_date IS NOT NULL THEN 
      EXTRACT(EPOCH FROM (i.resolved_date::timestamp - i.creation_date::timestamp)) / 60
    ELSE NULL 
  END as recovery_time_minutes
FROM incidents i
JOIN workflow_runs wr ON wr.run_id = i.workflow_run_id AND wr.repo_id = i.repo_id
ORDER BY i.creation_date DESC
LIMIT 20;
