import type { SupabaseClient } from '@supabase/supabase-js';
import { differenceInDays, format, parseISO } from 'date-fns';

export type SupabaseLeadTimeResult = {
  lead_time: number;
  first_commit_to_open: number;
  first_response_time: number;
  rework_time: number;
  merge_time: number;
  merge_to_deploy: number;
  pr_count: number;
};

export type SupabaseDeploymentFrequencyResult = {
  total_deployments: number;
  avg_daily_deployment_frequency: number;
  avg_weekly_deployment_frequency: number;
  avg_monthly_deployment_frequency: number;
};

export type SupabaseChangeFailureRateResult = {
  /**
   * Percentage in [0, 100], or null when there are no deployments in the window.
   * Guaranteed never to exceed 100 because failed_deployments is derived solely
   * from the same filtered workflow_runs set used for total_deployments.
   */
  change_failure_rate: number | null;
  failed_deployments: number;
  total_deployments: number;
};

/**
 * Get team's repo_ids from Supabase team_repos.
 */
export async function getTeamRepoIds(
  supabase: SupabaseClient,
  teamId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('team_repos')
    .select('repo_id')
    .eq('team_id', teamId);
  if (error || !data) return [];
  return (data as { repo_id: string }[]).map((r) => r.repo_id);
}

export type RepoBranchMap = Record<
  string,
  { dev_branch: string | null; stage_branch: string | null; prod_branch: string | null }
>;

/**
 * Get per-repo branch names (dev_branch, stage_branch, prod_branch) from Repos for team's repos.
 */
export async function getTeamReposBranchMap(
  supabase: SupabaseClient,
  teamId: string
): Promise<RepoBranchMap> {
  const repoIds = await getTeamRepoIds(supabase, teamId);
  if (repoIds.length === 0) return {};
  const { data, error } = await supabase
    .from('repos')
    .select('id, dev_branch, stage_branch, prod_branch')
    .in('id', repoIds);
  if (error || !data) return {};
  const map: RepoBranchMap = {};
  for (const r of data as { id: string; dev_branch?: string | null; stage_branch?: string | null; prod_branch?: string | null }[]) {
    map[r.id] = {
      dev_branch: r.dev_branch ?? null,
      stage_branch: r.stage_branch ?? null,
      prod_branch: r.prod_branch ?? null
    };
  }
  return map;
}

export type DeploymentPipelineCounts = {
  dev: number;
  stage: number;
  uat?: number;
  prod: number;
};

/**
 * Count MERGED pull_requests in date range by environment: dev (base_branch = repo's dev_branch),
 * stage (base_branch = repo's stage_branch), uat (base_branch = repo's uat_branch), prod (base_branch = repo's prod_branch).
 * Used for the deployment pipeline funnel; independent of branch dropdown.
 */
export async function getDeploymentPipelineFromSupabase(
  supabase: SupabaseClient,
  teamId: string,
  fromDate: Date,
  toDate: Date
): Promise<DeploymentPipelineCounts> {
  const repoIds = await getTeamRepoIds(supabase, teamId);
  const repoBranchMap = await getTeamReposBranchMap(supabase, teamId);
  if (repoIds.length === 0) {
    return { dev: 0, stage: 0, prod: 0 };
  }

  const fromStr = fromDate.toISOString();
  const toStr = toDate.toISOString();

  const { data: rows, error } = await supabase
    .from('pull_requests')
    .select('repo_id, base_branch')
    .in('repo_id', repoIds)
    .eq('state', 'MERGED')
    .gte('updated_at', fromStr)
    .lte('updated_at', toStr);

  if (error || !rows) return { dev: 0, stage: 0, prod: 0 };

  let dev = 0;
  let stage = 0;
  let uat = 0;
  let prod = 0;
  for (const row of rows as { repo_id: string; base_branch?: string | null }[]) {
    const branches = repoBranchMap[row.repo_id];
    const base = (row.base_branch ?? '').trim();
    if (!branches) continue;
    if (branches.dev_branch != null && branches.dev_branch !== '' && base === branches.dev_branch) {
      dev += 1;
    } else if (branches.stage_branch != null && branches.stage_branch !== '' && base === branches.stage_branch) {
      stage += 1;
    } else if (branches.uat_branch != null && branches.uat_branch !== '' && base === branches.uat_branch) {
      uat += 1;
    } else if (branches.prod_branch != null && branches.prod_branch !== '' && base === branches.prod_branch) {
      prod += 1;
    }
  }
  // Only include UAT in result if it has deployments
  const result: DeploymentPipelineCounts = { dev, stage, prod };
  if (uat > 0) {
    result.uat = uat;
  }
  return result;
}

function filterRowsByBranchMode<T extends { repo_id: string; base_branch?: string | null }>(
  rows: T[],
  branchMode: 'PROD' | 'STAGE' | 'DEV',
  repoBranchMap: RepoBranchMap
): T[] {
  const key = branchMode === 'PROD' ? 'prod_branch' : branchMode === 'STAGE' ? 'stage_branch' : 'dev_branch';
  return rows.filter((row) => {
    const allowed = repoBranchMap[row.repo_id]?.[key];
    return allowed != null && allowed !== '' && (row.base_branch ?? '') === allowed;
  });
}

/**
 * Filter workflow runs by head_branch matching the repo's prod/stage/dev branch.
 * Used for CFR/MTTR to only count relevant workflow runs.
 *
 * DORA rule: remediation branches (hotfix/*, revert/*, rollback/*) are ALWAYS
 * included regardless of branch filter, because they represent a failure caused
 * by a prior production deployment — stripping them would hide real CFR events.
 */
function filterWorkflowRunsByBranchMode<T extends { repo_id: string; head_branch?: string | null }>(
  rows: T[],
  branchMode: 'PROD' | 'STAGE' | 'DEV',
  repoBranchMap: RepoBranchMap
): T[] {
  const key = branchMode === 'PROD' ? 'prod_branch' : branchMode === 'STAGE' ? 'stage_branch' : 'dev_branch';
  const REMEDIATION_PREFIXES = ['hotfix/', 'hotfix-', 'revert/', 'revert-', 'rollback/', 'rollback-'];
  return rows.filter((row) => {
    const branch = (row.head_branch ?? '').toLowerCase();
    // Always include remediation branches — they are CFR signals for any prod branch
    if (REMEDIATION_PREFIXES.some((p) => branch.startsWith(p))) return true;
    // Otherwise apply normal branch filter
    const allowed = repoBranchMap[row.repo_id]?.[key];
    return allowed != null && allowed !== '' && (row.head_branch ?? '') === allowed;
  });
}

export type BranchFilterOptions = {
  branchMode: 'PROD' | 'STAGE' | 'DEV';
  repoBranchMap: RepoBranchMap;
};

/**
 * Returns true when a workflow run itself signals a production failure,
 * independent of whether it is also linked to an incidents row.
 *
 * Failure signals:
 *   1. conclusion === 'failure'           — pipeline broke
 *   2. head_branch matches hotfix/*       — hotfix deployment
 *   3. head_branch matches revert/*       — branch-level revert
 *   4. head_branch matches rollback/*     — explicit rollback branch
 *   5. workflow name contains rollback    — rollback workflow
 *   6. workflow name contains revert      — revert workflow
 *   7. workflow name contains hotfix      — hotfix workflow
 *
 * A workflow run counts as a CFR failure when ANY of the following is true:
 *   1. conclusion === 'failure'              — the pipeline/deployment broke
 *   2. head_branch starts with hotfix/*      — emergency fix for a prior release
 *   3. head_branch starts with revert/*      — branch-level revert of a prior release
 *   4. head_branch starts with rollback/*    — rollback of a prior release
 *   5. workflow name contains hotfix/revert/rollback
 *   6. run_id appears in incidents table     — direct incident linkage (Step E/F)
 *
 * All keyword checks are case-insensitive.
 */
function isFailureSignal(run: {
  conclusion?: string | null;
  head_branch?: string | null;
  name?: string | null;
}): boolean {
  const conclusion   = (run.conclusion  ?? '').toLowerCase();
  const branch       = (run.head_branch ?? '').toLowerCase();
  const workflowName = (run.name        ?? '').toLowerCase();

  // A failed pipeline deployment is a change failure — something broke
  if (conclusion === 'failure') return true;

  // Branch-name conventions that signal a remediation deployment
  const BRANCH_PREFIXES = ['hotfix/', 'hotfix-', 'revert/', 'revert-', 'rollback/', 'rollback-'];
  if (BRANCH_PREFIXES.some((p) => branch.startsWith(p))) return true;

  // Workflow names that explicitly represent rollback / revert / hotfix flows
  const NAME_KEYWORDS = ['rollback', 'revert', 'hotfix'];
  if (NAME_KEYWORDS.some((kw) => workflowName.includes(kw))) return true;

  return false;
}

/**
 * Deduplicate pull_request rows by (repo_id, pr_no).
 * The pull_requests table can contain two rows per PR due to dual ingestion paths
 * (Source 1: upsert with UUID id; Source 2: plain insert that gets a new UUID auto-generated
 * by the DB). Keeping only the first occurrence per composite key prevents double-counting
 * in every metric that aggregates merged PRs.
 */
function deduplicateByRepoPrNo<T extends { repo_id?: string | null; pr_no?: number | string | null }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.repo_id ?? ''}:${r.pr_no ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Lead Time = mean of (first_commit_to_open + cycle_time) for pull_requests
 * where state = 'MERGED' and updated_at in [fromDate, toDate], repo_id in team's repos.
 * If branchFilter is provided, only PRs with base_branch matching the repo's prod/stage/dev branch are included.
 */
export async function getLeadTimeFromSupabase(
  supabase: SupabaseClient,
  teamId: string,
  fromDate: Date,
  toDate: Date,
  branchFilter?: BranchFilterOptions
): Promise<SupabaseLeadTimeResult> {
  const repoIds = await getTeamRepoIds(supabase, teamId);
  if (repoIds.length === 0) {
    return {
      lead_time: 0,
      first_commit_to_open: 0,
      first_response_time: 0,
      rework_time: 0,
      merge_time: 0,
      merge_to_deploy: 0,
      pr_count: 0,
    };
  }

  const fromStr = fromDate.toISOString();
  const toStr = toDate.toISOString();

  const selectFields = branchFilter
    ? 'pr_no, repo_id, first_commit_to_open, cycle_time, base_branch'
    : 'pr_no, repo_id, first_commit_to_open, cycle_time';
  const { data: rawRows, error } = await supabase
    .from('pull_requests')
    .select(selectFields)
    .in('repo_id', repoIds)
    .eq('state', 'MERGED')
    .gte('updated_at', fromStr)
    .lte('updated_at', toStr);

  let rows = deduplicateByRepoPrNo((rawRows || []) as { pr_no?: number | string | null; first_commit_to_open?: number | null; cycle_time?: number | null; repo_id?: string; base_branch?: string | null }[]);
  if (branchFilter && rows.length > 0) {
    rows = filterRowsByBranchMode(rows, branchFilter.branchMode, branchFilter.repoBranchMap);
  }

  if (error || rows.length === 0) {
    return {
      lead_time: 0,
      first_commit_to_open: 0,
      first_response_time: 0,
      rework_time: 0,
      merge_time: 0,
      merge_to_deploy: 0,
      pr_count: 0,
    };
  }

  const prs = rows;
  let sumLeadTime = 0;
  let sumFirstCommitToOpen = 0;
  for (const pr of prs) {
    const fco = Number(pr.first_commit_to_open) || 0;
    const ct = Number(pr.cycle_time) || 0;
    sumLeadTime += fco + ct;
    sumFirstCommitToOpen += fco;
  }
  const n = prs.length;
  const lead_time = n > 0 ? sumLeadTime / n : 0;
  const first_commit_to_open = n > 0 ? sumFirstCommitToOpen / n : 0;

  return {
    lead_time,
    first_commit_to_open,
    first_response_time: 0,
    rework_time: 0,
    merge_time: 0,
    merge_to_deploy: 0,
    pr_count: n,
  };
}

/**
 * Deployment Frequency = count of unique merged PRs (updated_at in range) / time.
 * Uses pull_requests as source of truth — same pool as the Deployment Pipeline panel —
 * so the "N total deployments" label matches the pipeline's per-environment counts.
 * Duplicate DB rows (from dual ingestion) are removed by deduplicateByRepoPrNo.
 * If branchFilter is provided, only PRs with base_branch matching the repo's
 * prod/stage/dev branch are counted.
 */
export async function getDeploymentFrequencyFromSupabase(
  supabase: SupabaseClient,
  teamId: string,
  fromDate: Date,
  toDate: Date,
  branchFilter?: BranchFilterOptions
): Promise<SupabaseDeploymentFrequencyResult> {
  const repoIds = await getTeamRepoIds(supabase, teamId);
  if (repoIds.length === 0) {
    return {
      total_deployments: 0,
      avg_daily_deployment_frequency: 0,
      avg_weekly_deployment_frequency: 0,
      avg_monthly_deployment_frequency: 0,
    };
  }

  const fromStr = fromDate.toISOString();
  const toStr = toDate.toISOString();

  const selectFields = branchFilter ? 'pr_no, repo_id, base_branch' : 'pr_no, repo_id';
  const { data: rawRows, error } = await supabase
    .from('pull_requests')
    .select(selectFields)
    .in('repo_id', repoIds)
    .eq('state', 'MERGED')
    .gte('updated_at', fromStr)
    .lte('updated_at', toStr);

  if (error) {
    return {
      total_deployments: 0,
      avg_daily_deployment_frequency: 0,
      avg_weekly_deployment_frequency: 0,
      avg_monthly_deployment_frequency: 0,
    };
  }

  let rows = deduplicateByRepoPrNo((rawRows || []) as unknown as { pr_no?: number | string | null; repo_id: string; base_branch?: string | null }[]);
  if (branchFilter && rows.length > 0) {
    rows = filterRowsByBranchMode(rows, branchFilter.branchMode, branchFilter.repoBranchMap) as typeof rows;
  }
  const total_deployments = rows.length;
  const days = Math.max(1, differenceInDays(toDate, fromDate) + 1);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const avg_daily_deployment_frequency = round2(total_deployments / days);
  const avg_weekly_deployment_frequency = round2(total_deployments / (days / 7));
  const avg_monthly_deployment_frequency = round2(total_deployments / (days / 30));

  return {
    total_deployments,
    avg_daily_deployment_frequency,
    avg_weekly_deployment_frequency,
    avg_monthly_deployment_frequency,
  };
}

/** Deployment frequency trends: date string -> { count }. */
export type DeploymentFrequencyTrendsMap = Record<string, { count: number }>;

/**
 * Per-day count of unique merged PRs. If branchFilter provided, only PRs with
 * base_branch matching repo's prod/stage/dev.
 * Deduplicates by (repo_id, pr_no) to remove dual-ingestion duplicates.
 */
export async function getDeploymentFrequencyTrendsFromSupabase(
  supabase: SupabaseClient,
  teamId: string,
  fromDate: Date,
  toDate: Date,
  branchFilter?: BranchFilterOptions
): Promise<DeploymentFrequencyTrendsMap> {
  const repoIds = await getTeamRepoIds(supabase, teamId);
  if (repoIds.length === 0) return {};

  const fromStr = fromDate.toISOString();
  const toStr = toDate.toISOString();

  const selectFields = branchFilter ? 'pr_no, repo_id, updated_at, base_branch' : 'pr_no, repo_id, updated_at';
  const { data: rawRows, error } = await supabase
    .from('pull_requests')
    .select(selectFields)
    .in('repo_id', repoIds)
    .eq('state', 'MERGED')
    .gte('updated_at', fromStr)
    .lte('updated_at', toStr);

  if (error || !rawRows || rawRows.length === 0) return {};

  let rows = deduplicateByRepoPrNo(rawRows as unknown as { pr_no?: number | string | null; updated_at?: string | null; repo_id: string; base_branch?: string | null }[]);
  if (branchFilter && rows.length > 0) {
    rows = filterRowsByBranchMode(rows, branchFilter.branchMode, branchFilter.repoBranchMap) as typeof rows;
  }

  const byDate: Record<string, number> = {};
  for (const r of rows) {
    const dateStr = r.updated_at ? format(parseISO(r.updated_at), 'yyyy-MM-dd') : '';
    if (!dateStr) continue;
    byDate[dateStr] = (byDate[dateStr] ?? 0) + 1;
  }
  const out: DeploymentFrequencyTrendsMap = {};
  for (const [dateStr, count] of Object.entries(byDate)) {
    out[dateStr] = { count };
  }
  return out;
}

/**
 * Change Failure Rate = (incidents in range / workflow_runs in range) × 100.
 * Incidents are filtered by creation_date (when the failure occurred); workflow_runs by created_at.
 * An incident = a run with conclusion = 'failure' followed by conclusion = 'success' (resolved).
 * If branchFilter is provided, only workflow runs with head_branch matching the repo's prod/stage/dev branch are counted.
 */
/**
 * Change Failure Rate: the percentage of deployments in the window that caused a failure.
 *
 * Deployment source of truth: workflow_runs table, windowed by created_at.
 * Branch filtering is applied once to the fetched run set and reused for both
 * total_deployments and failure detection — guaranteeing CFR is in [0, 100].
 *
 * CFR = (failed deployments / total deployments) × 100
 *
 * A deployment is a FAILURE when: conclusion='failure' OR branch is hotfix/revert/rollback
 * OR workflow name contains hotfix/revert/rollback OR run_id is in incidents table.
 *
 * Incidents are never counted independently — duplicate incident rows referencing
 * the same run_id collapse to 1 via Set. Incidents outside the filtered window are ignored.
 *
 * Returns null (not 0) when there are no deployments in the window.
 */
export async function getChangeFailureRateFromSupabase(
  supabase: SupabaseClient,
  teamId: string,
  fromDate: Date,
  toDate: Date,
  branchFilter?: BranchFilterOptions
): Promise<SupabaseChangeFailureRateResult> {
  const repoIds = await getTeamRepoIds(supabase, teamId);
  if (repoIds.length === 0) {
    return { change_failure_rate: null, failed_deployments: 0, total_deployments: 0 };
  }

  const fromStr = fromDate.toISOString();
  const toStr = toDate.toISOString();

  // ── Step A: fetch all workflow runs in the window ─────────────────────────
  // Include `name` so isFailureSignal can check workflow names for hotfix/rollback/revert.
  const { data: runData } = await supabase
    .from('workflow_runs')
    .select('run_id, repo_id, head_branch, conclusion, name')
    .in('repo_id', repoIds)
    .gte('created_at', fromStr)
    .lte('created_at', toStr);

  // ── Step B: apply branch filter once to get the canonical deployment set ──
  let deploymentRuns = (runData || []) as {
    run_id: string | number;
    repo_id: string;
    head_branch?: string | null;
    conclusion?: string | null;
    name?: string | null;
  }[];
  if (branchFilter) {
    deploymentRuns = filterWorkflowRunsByBranchMode(
      deploymentRuns,
      branchFilter.branchMode,
      branchFilter.repoBranchMap
    );
  }

  // ── Step C ────────────────────────────────────────────────────────────────
  const total_deployments = deploymentRuns.length;
  if (total_deployments === 0) {
    return { change_failure_rate: null, failed_deployments: 0, total_deployments: 0 };
  }

  // ── Step D: seed failed set — conclusion, hotfix, revert, rollback signals ─
  const failedRunIds = new Set<string | number>();
  for (const run of deploymentRuns) {
    if (isFailureSignal(run)) {
      failedRunIds.add(run.run_id);
    }
  }

  // ── Step E: query incidents scoped to this run set only ───────────────────
  // No time filter on incidents — the window is already enforced by the run set.
  const allRunIds = deploymentRuns.map((r) => r.run_id);
  const { data: incidentData } = await supabase
    .from('incidents')
    .select('workflow_run_id')
    .in('repo_id', repoIds)
    .in('workflow_run_id', allRunIds);

  // ── Step F: union incident-linked run_ids into the failed set ─────────────
  for (const inc of incidentData || []) {
    if (inc.workflow_run_id != null) {
      failedRunIds.add(inc.workflow_run_id);
    }
  }

  // ── Step G/H: compute CFR ─────────────────────────────────────────────────
  const failed_deployments = failedRunIds.size;
  const change_failure_rate =
    Math.round((failed_deployments / total_deployments) * 10000) / 100;

  return { change_failure_rate, failed_deployments, total_deployments };
}

/** Change failure rate trends: date string -> { change_failure_rate, failed_deployments, total_deployments }. */
export type ChangeFailureRateTrendsMap = Record<
  string,
  SupabaseChangeFailureRateResult
>;

/**
 * Per-day Change Failure Rate trends.
 *
 * Uses the same single-source-of-truth model as getChangeFailureRateFromSupabase:
 *   - workflow_runs (windowed by created_at) are the canonical deployment set.
 *   - Branch filter is applied once; the filtered set drives both totals and failures.
 *   - A run is failed if isFailureSignal() is true (conclusion=failure, hotfix/revert/rollback
 *     branch or workflow name) OR its run_id is in incidents.
 *   - Per-day failure counts use a Set<run_id> so duplicate incident rows collapse to 1.
 *   - Incidents without a matching run_id in the filtered set are ignored.
 *   - Days with no workflow runs are omitted from the result map.
 *   - change_failure_rate is null (not 0) for days that have no deployments at all,
 *     but such days are not emitted anyway since they have total_deployments = 0.
 */
export async function getChangeFailureRateTrendsFromSupabase(
  supabase: SupabaseClient,
  teamId: string,
  fromDate: Date,
  toDate: Date,
  branchFilter?: BranchFilterOptions
): Promise<ChangeFailureRateTrendsMap> {
  const repoIds = await getTeamRepoIds(supabase, teamId);
  if (repoIds.length === 0) return {};

  const fromStr = fromDate.toISOString();
  const toStr = toDate.toISOString();

  // ── Step A: fetch all workflow runs in the window ─────────────────────────
  // Include `name` so isFailureSignal can check workflow names for hotfix/rollback/revert.
  const { data: runData } = await supabase
    .from('workflow_runs')
    .select('run_id, repo_id, head_branch, conclusion, created_at, name')
    .in('repo_id', repoIds)
    .gte('created_at', fromStr)
    .lte('created_at', toStr);

  // ── Step B: apply branch filter once ─────────────────────────────────────
  let deploymentRuns = (runData || []) as {
    run_id: string | number;
    repo_id: string;
    head_branch?: string | null;
    conclusion?: string | null;
    created_at?: string | null;
    name?: string | null;
  }[];
  if (branchFilter) {
    deploymentRuns = filterWorkflowRunsByBranchMode(
      deploymentRuns,
      branchFilter.branchMode,
      branchFilter.repoBranchMap
    );
  }

  if (deploymentRuns.length === 0) return {};

  // ── Step C/D: bucket totals and seed per-day failure sets ─────────────────
  // runIdToDate maps each run_id → 'yyyy-MM-dd' for incident look-up below.
  const byDate: Record<string, { total: number; failedSet: Set<string | number> }> = {};
  const runIdToDate = new Map<string | number, string>();

  for (const run of deploymentRuns) {
    const dateStr = run.created_at ? format(parseISO(run.created_at), 'yyyy-MM-dd') : '';
    if (!dateStr) continue;
    runIdToDate.set(run.run_id, dateStr);
    if (!byDate[dateStr]) byDate[dateStr] = { total: 0, failedSet: new Set() };
    byDate[dateStr].total += 1;
    if (isFailureSignal(run)) {
      byDate[dateStr].failedSet.add(run.run_id);
    }
  }

  // ── Step E: query incidents scoped to this run set only ───────────────────
  // No time filter on incidents — the window is enforced by the run set.
  const allRunIds = deploymentRuns.map((r) => r.run_id);
  const { data: incidentData } = await supabase
    .from('incidents')
    .select('workflow_run_id')
    .in('repo_id', repoIds)
    .in('workflow_run_id', allRunIds);

  // ── Step F: union incident-linked run_ids into the per-day failure sets ───
  for (const inc of incidentData || []) {
    if (inc.workflow_run_id == null) continue;
    const dateStr = runIdToDate.get(inc.workflow_run_id);
    // Ignore incidents whose run_id is not in the filtered set (Step B)
    if (!dateStr || !byDate[dateStr]) continue;
    byDate[dateStr].failedSet.add(inc.workflow_run_id);
  }

  // ── Step G/H: build output map ────────────────────────────────────────────
  const out: ChangeFailureRateTrendsMap = {};
  for (const [dateStr, agg] of Object.entries(byDate)) {
    const total = agg.total;
    const failed = agg.failedSet.size;
    out[dateStr] = {
      change_failure_rate:
        total > 0 ? Math.round((failed / total) * 10000) / 100 : null,
      failed_deployments: failed,
      total_deployments: total,
    };
  }
  return out;
}

export type SupabaseMeanTimeToRestoreResult = {
  mean_time_to_recovery: number;
  incident_count: number;
};

/**
 * Mean Time to Recovery = mean(resolved_date - creation_date) in seconds for incidents
 * where both creation_date and resolved_date exist, filtered by team repos and creation_date in [fromDate, toDate].
 * Incidents are derived from workflow_runs (ascending by created_at): conclusion = 'failure' = incident start;
 * the next workflow run with conclusion = 'success' gives resolved_date (time to recovery = resolved_date - creation_date).
 * If branchFilter is provided, only incidents from workflow runs on the prod/stage/dev branch are counted.
 */
export async function getMeanTimeToRestoreFromSupabase(
  supabase: SupabaseClient,
  teamId: string,
  fromDate: Date,
  toDate: Date,
  branchFilter?: BranchFilterOptions
): Promise<SupabaseMeanTimeToRestoreResult> {
  const repoIds = await getTeamRepoIds(supabase, teamId);
  if (repoIds.length === 0) {
    return { mean_time_to_recovery: 0, incident_count: 0 };
  }

  const fromStr = fromDate.toISOString();
  const toStr = toDate.toISOString();

  const selectFields = branchFilter ? 'creation_date, resolved_date, repo_id, workflow_run_id' : 'creation_date, resolved_date';
  const { data: rows, error } = await supabase
    .from('incidents')
    .select(selectFields)
    .in('repo_id', repoIds)
    .gte('creation_date', fromStr)
    .lte('creation_date', toStr)
    .not('creation_date', 'is', null)
    .not('resolved_date', 'is', null);

  if (error || !rows || rows.length === 0) {
    return { mean_time_to_recovery: 0, incident_count: 0 };
  }

  let filteredRows = rows as { creation_date: string | null; resolved_date: string | null; repo_id?: string; workflow_run_id?: number }[];
  
  // Filter incidents by workflow runs on production branch if filter provided
  if (branchFilter && filteredRows.length > 0) {
    const incidentRunIds = filteredRows.map(i => i.workflow_run_id).filter(Boolean) as number[];
    if (incidentRunIds.length > 0) {
      const { data: incidentWorkflowRuns } = await supabase
        .from('workflow_runs')
        .select('run_id, repo_id, head_branch')
        .in('repo_id', repoIds)
        .in('run_id', incidentRunIds);
      
      const filteredRuns = filterWorkflowRunsByBranchMode(
        (incidentWorkflowRuns || []) as { run_id?: number; repo_id: string; head_branch?: string | null }[],
        branchFilter.branchMode,
        branchFilter.repoBranchMap
      );
      const allowedRunIds = new Set(filteredRuns.map((r: any) => r.run_id));
      filteredRows = filteredRows.filter(i => i.workflow_run_id && allowedRunIds.has(i.workflow_run_id));
    }
  }

  let sumSeconds = 0;
  let count = 0;
  for (const r of filteredRows) {
    const created = r.creation_date ? new Date(r.creation_date).getTime() : NaN;
    const resolved = r.resolved_date ? new Date(r.resolved_date).getTime() : NaN;
    if (Number.isFinite(created) && Number.isFinite(resolved) && resolved >= created) {
      sumSeconds += (resolved - created) / 1000;
      count += 1;
    }
  }

  const mean_time_to_recovery = count > 0 ? sumSeconds / count : 0;
  return { mean_time_to_recovery, incident_count: count };
}

export type MeanTimeToRestoreTrendsMap = Record<
  string,
  SupabaseMeanTimeToRestoreResult
>;

/**
 * Per-day MTTR: for each day (by creation_date), mean(resolved_date - creation_date) in seconds.
 * If branchFilter is provided, only incidents from workflow runs on the prod/stage/dev branch are counted.
 */
export async function getMeanTimeToRestoreTrendsFromSupabase(
  supabase: SupabaseClient,
  teamId: string,
  fromDate: Date,
  toDate: Date,
  branchFilter?: BranchFilterOptions
): Promise<MeanTimeToRestoreTrendsMap> {
  const repoIds = await getTeamRepoIds(supabase, teamId);
  if (repoIds.length === 0) return {};

  const fromStr = fromDate.toISOString();
  const toStr = toDate.toISOString();

  const selectFields = branchFilter ? 'creation_date, resolved_date, repo_id, workflow_run_id' : 'creation_date, resolved_date';
  const { data: rows, error } = await supabase
    .from('incidents')
    .select(selectFields)
    .in('repo_id', repoIds)
    .gte('creation_date', fromStr)
    .lte('creation_date', toStr)
    .not('creation_date', 'is', null)
    .not('resolved_date', 'is', null);

  if (error || !rows || rows.length === 0) return {};

  let filteredRows = rows as { creation_date: string | null; resolved_date: string | null; repo_id?: string; workflow_run_id?: number }[];
  
  // Filter incidents by workflow runs on production branch if filter provided
  if (branchFilter && filteredRows.length > 0) {
    const incidentRunIds = filteredRows.map(i => i.workflow_run_id).filter(Boolean) as number[];
    if (incidentRunIds.length > 0) {
      const { data: incidentWorkflowRuns } = await supabase
        .from('workflow_runs')
        .select('run_id, repo_id, head_branch')
        .in('repo_id', repoIds)
        .in('run_id', incidentRunIds);
      
      const filteredRuns = filterWorkflowRunsByBranchMode(
        (incidentWorkflowRuns || []) as { run_id?: number; repo_id: string; head_branch?: string | null }[],
        branchFilter.branchMode,
        branchFilter.repoBranchMap
      );
      const allowedRunIds = new Set(filteredRuns.map((r: any) => r.run_id));
      filteredRows = filteredRows.filter(i => i.workflow_run_id && allowedRunIds.has(i.workflow_run_id));
    }
  }

  const byDate: Record<string, { sumSeconds: number; count: number }> = {};
  for (const r of filteredRows) {
    const created = r.creation_date ? new Date(r.creation_date).getTime() : NaN;
    const resolved = r.resolved_date ? new Date(r.resolved_date).getTime() : NaN;
    if (!Number.isFinite(created) || !Number.isFinite(resolved) || resolved < created) continue;
    const dateStr = r.creation_date ? format(parseISO(r.creation_date), 'yyyy-MM-dd') : '';
    if (!dateStr) continue;
    if (!byDate[dateStr]) byDate[dateStr] = { sumSeconds: 0, count: 0 };
    byDate[dateStr].sumSeconds += (resolved - created) / 1000;
    byDate[dateStr].count += 1;
  }

  const out: MeanTimeToRestoreTrendsMap = {};
  for (const [dateStr, agg] of Object.entries(byDate)) {
    out[dateStr] = {
      mean_time_to_recovery: agg.count > 0 ? agg.sumSeconds / agg.count : 0,
      incident_count: agg.count,
    };
  }
  return out;
}

/** Minimal PR-like shape for lead time details (see details overlay). */
export type SupabaseLeadTimePRRow = {
  id: string;
  repo_id: string;
  pr_no: number;
  title: string | null;
  author: string | null;
  first_commit_to_open: number | null;
  cycle_time: number | null;
  created_at: string | null;
  updated_at: string | null;
  state: string | null;
  base_branch: string | null;
  head_branch: string | null;
  commits: number | null;
  additions: number | null;
  deletions: number | null;
  comments: number | null;
  repo_name?: string;
};

/** Lead time trends: date string -> { lead_time, first_commit_to_open, ..., pr_count }. */
export type LeadTimeTrendsMap = Record<
  string,
  {
    lead_time: number;
    first_commit_to_open: number;
    first_response_time: number;
    rework_time: number;
    merge_time: number;
    merge_to_deploy: number;
    pr_count: number;
  }
>;

/**
 * Fetch merged PRs in date range for team with repo name, for lead time "see details" (PR list).
 * If branchFilter provided, only PRs with base_branch matching repo's prod/stage/dev are returned.
 */
export async function getLeadTimePRsFromSupabase(
  supabase: SupabaseClient,
  teamId: string,
  fromDate: Date,
  toDate: Date,
  branchFilter?: BranchFilterOptions
): Promise<SupabaseLeadTimePRRow[]> {
  const repoIds = await getTeamRepoIds(supabase, teamId);
  if (repoIds.length === 0) return [];

  const fromStr = fromDate.toISOString();
  const toStr = toDate.toISOString();

  const { data: rawPrRows, error } = await supabase
    .from('pull_requests')
    .select('id, repo_id, pr_no, title, author, first_commit_to_open, cycle_time, created_at, updated_at, state, base_branch, head_branch, commits, additions, deletions, comments')
    .in('repo_id', repoIds)
    .eq('state', 'MERGED')
    .gte('updated_at', fromStr)
    .lte('updated_at', toStr);

  if (error || !rawPrRows || rawPrRows.length === 0) return [];

  // Deduplicate: the pull_requests table can have two rows per PR due to
  // dual ingestion paths (one upsert + one plain insert). Remove duplicates
  // before any further processing so the overlay shows each PR only once.
  let prRows = deduplicateByRepoPrNo(rawPrRows as SupabaseLeadTimePRRow[]);
  if (branchFilter && prRows.length > 0) {
    prRows = filterRowsByBranchMode(prRows, branchFilter.branchMode, branchFilter.repoBranchMap);
  }

  const repoIdsUnique = [...new Set(prRows.map((r) => r.repo_id))];
  const { data: reposData } = await supabase
    .from('repos')
    .select('id, repo_name')
    .in('id', repoIdsUnique);
  const repoNameById: Record<string, string> = {};
  (reposData || []).forEach((r: { id: string; repo_name: string }) => {
    repoNameById[r.id] = r.repo_name ?? '';
  });

  return (prRows as SupabaseLeadTimePRRow[]).map((pr) => ({
    ...pr,
    repo_name: repoNameById[pr.repo_id] ?? ''
  }));
}

/**
 * Build lead time trends (per-day aggregates) for chart. If branchFilter provided, only PRs with base_branch matching repo's prod/stage/dev.
 */
export async function getLeadTimeTrendsFromSupabase(
  supabase: SupabaseClient,
  teamId: string,
  fromDate: Date,
  toDate: Date,
  branchFilter?: BranchFilterOptions
): Promise<LeadTimeTrendsMap> {
  const repoIds = await getTeamRepoIds(supabase, teamId);
  if (repoIds.length === 0) return {};

  const fromStr = fromDate.toISOString();
  const toStr = toDate.toISOString();

  const selectFields = branchFilter ? 'pr_no, repo_id, first_commit_to_open, cycle_time, updated_at, base_branch' : 'pr_no, repo_id, first_commit_to_open, cycle_time, updated_at';
  const { data: rawRows, error } = await supabase
    .from('pull_requests')
    .select(selectFields)
    .in('repo_id', repoIds)
    .eq('state', 'MERGED')
    .gte('updated_at', fromStr)
    .lte('updated_at', toStr);

  if (error || !rawRows || rawRows.length === 0) return {};

  let rows = deduplicateByRepoPrNo(rawRows as { pr_no?: number | string | null; first_commit_to_open?: number | null; cycle_time?: number | null; updated_at?: string | null; repo_id?: string; base_branch?: string | null }[]);
  if (branchFilter && rows.length > 0) {
    rows = filterRowsByBranchMode(rows, branchFilter.branchMode, branchFilter.repoBranchMap);
  }

  const byDate: Record<
    string,
    { leadTimeSum: number; fcoSum: number; cycleSum: number; count: number }
  > = {};

  for (const r of rows) {
    const fco = Number(r.first_commit_to_open) || 0;
    const ct = Number(r.cycle_time) || 0;
    const dateStr = r.updated_at ? format(parseISO(r.updated_at), 'yyyy-MM-dd') : '';
    if (!dateStr) continue;
    if (!byDate[dateStr]) {
      byDate[dateStr] = { leadTimeSum: 0, fcoSum: 0, cycleSum: 0, count: 0 };
    }
    byDate[dateStr].leadTimeSum += fco + ct;
    byDate[dateStr].fcoSum += fco;
    byDate[dateStr].cycleSum += ct;
    byDate[dateStr].count += 1;
  }

  const out: LeadTimeTrendsMap = {};
  for (const [dateStr, agg] of Object.entries(byDate)) {
    const n = agg.count;
    out[dateStr] = {
      lead_time: n > 0 ? agg.leadTimeSum / n : 0,
      first_commit_to_open: n > 0 ? agg.fcoSum / n : 0,
      first_response_time: 0,
      rework_time: 0,
      merge_time: n > 0 ? agg.cycleSum / n : 0,
      merge_to_deploy: 0,
      pr_count: n,
    };
  }
  return out;
}
