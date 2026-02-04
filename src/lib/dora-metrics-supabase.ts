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
  change_failure_rate: number;
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

export type BranchFilterOptions = {
  branchMode: 'PROD' | 'STAGE' | 'DEV';
  repoBranchMap: RepoBranchMap;
};

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
    ? 'first_commit_to_open, cycle_time, repo_id, base_branch'
    : 'first_commit_to_open, cycle_time';
  const { data: rawRows, error } = await supabase
    .from('pull_requests')
    .select(selectFields)
    .in('repo_id', repoIds)
    .eq('state', 'MERGED')
    .gte('updated_at', fromStr)
    .lte('updated_at', toStr);

  let rows = (rawRows || []) as { first_commit_to_open?: number | null; cycle_time?: number | null; repo_id?: string; base_branch?: string | null }[];
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
 * Deployment Frequency = count of PRs (state MERGED, updated_at in range) / time.
 * If branchFilter is provided, only PRs with base_branch matching the repo's prod/stage/dev branch are counted.
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

  const selectFields = branchFilter ? 'repo_id, base_branch' : '*';
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

  let rows = (rawRows || []) as { repo_id?: string; base_branch?: string | null }[];
  if (branchFilter && rows.length > 0) {
    rows = filterRowsByBranchMode(rows, branchFilter.branchMode, branchFilter.repoBranchMap);
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
 * Per-day count of MERGED PRs. If branchFilter provided, only PRs with base_branch matching repo's prod/stage/dev.
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

  const selectFields = branchFilter ? 'updated_at, repo_id, base_branch' : 'updated_at';
  const { data: rawRows, error } = await supabase
    .from('pull_requests')
    .select(selectFields)
    .in('repo_id', repoIds)
    .eq('state', 'MERGED')
    .gte('updated_at', fromStr)
    .lte('updated_at', toStr);

  if (error || !rawRows || rawRows.length === 0) return {};

  let rows = rawRows as { updated_at?: string | null; repo_id?: string; base_branch?: string | null }[];
  if (branchFilter && rows.length > 0) {
    rows = filterRowsByBranchMode(rows, branchFilter.branchMode, branchFilter.repoBranchMap);
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
 */
export async function getChangeFailureRateFromSupabase(
  supabase: SupabaseClient,
  teamId: string,
  fromDate: Date,
  toDate: Date
): Promise<SupabaseChangeFailureRateResult> {
  const repoIds = await getTeamRepoIds(supabase, teamId);
  if (repoIds.length === 0) {
    return {
      change_failure_rate: 0,
      failed_deployments: 0,
      total_deployments: 0,
    };
  }

  const fromStr = fromDate.toISOString();
  const toStr = toDate.toISOString();

  const [incidentsResult, workflowRunsResult] = await Promise.all([
    supabase
      .from('incidents')
      .select('*', { count: 'exact', head: true })
      .in('repo_id', repoIds)
      .not('creation_date', 'is', null)
      .gte('creation_date', fromStr)
      .lte('creation_date', toStr),
    supabase
      .from('workflow_runs')
      .select('*', { count: 'exact', head: true })
      .in('repo_id', repoIds)
      .gte('created_at', fromStr)
      .lte('created_at', toStr),
  ]);

  const failed_deployments = incidentsResult.count ?? 0;
  const total_deployments = workflowRunsResult.count ?? 0;
  const change_failure_rate =
    total_deployments > 0
      ? Math.round((failed_deployments / total_deployments) * 10000) / 100
      : 0;

  return {
    change_failure_rate,
    failed_deployments,
    total_deployments,
  };
}

/** Change failure rate trends: date string -> { change_failure_rate, failed_deployments, total_deployments }. */
export type ChangeFailureRateTrendsMap = Record<
  string,
  SupabaseChangeFailureRateResult
>;

/**
 * Per-day CFR: for each day, count incidents by creation_date and workflow_runs by created_at, then rate.
 */
export async function getChangeFailureRateTrendsFromSupabase(
  supabase: SupabaseClient,
  teamId: string,
  fromDate: Date,
  toDate: Date
): Promise<ChangeFailureRateTrendsMap> {
  const repoIds = await getTeamRepoIds(supabase, teamId);
  if (repoIds.length === 0) return {};

  const fromStr = fromDate.toISOString();
  const toStr = toDate.toISOString();

  const [incidentsRows, workflowRunsRows] = await Promise.all([
    supabase
      .from('incidents')
      .select('creation_date')
      .in('repo_id', repoIds)
      .not('creation_date', 'is', null)
      .gte('creation_date', fromStr)
      .lte('creation_date', toStr),
    supabase
      .from('workflow_runs')
      .select('created_at')
      .in('repo_id', repoIds)
      .gte('created_at', fromStr)
      .lte('created_at', toStr),
  ]);

  const byDate: Record<
    string,
    { failed: number; total: number }
  > = {};

  for (const r of (workflowRunsRows.data || []) as { created_at?: string | null }[]) {
    const dateStr = r.created_at ? format(parseISO(r.created_at), 'yyyy-MM-dd') : '';
    if (!dateStr) continue;
    if (!byDate[dateStr]) byDate[dateStr] = { failed: 0, total: 0 };
    byDate[dateStr].total += 1;
  }
  for (const r of (incidentsRows.data || []) as { creation_date?: string | null }[]) {
    const dateStr = r.creation_date ? format(parseISO(r.creation_date), 'yyyy-MM-dd') : '';
    if (!dateStr) continue;
    if (!byDate[dateStr]) byDate[dateStr] = { failed: 0, total: 0 };
    byDate[dateStr].failed += 1;
  }

  const out: ChangeFailureRateTrendsMap = {};
  for (const [dateStr, agg] of Object.entries(byDate)) {
    const total = agg.total;
    const failed = agg.failed;
    out[dateStr] = {
      change_failure_rate: total > 0 ? (failed / total) * 100 : 0,
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
 */
export async function getMeanTimeToRestoreFromSupabase(
  supabase: SupabaseClient,
  teamId: string,
  fromDate: Date,
  toDate: Date
): Promise<SupabaseMeanTimeToRestoreResult> {
  const repoIds = await getTeamRepoIds(supabase, teamId);
  if (repoIds.length === 0) {
    return { mean_time_to_recovery: 0, incident_count: 0 };
  }

  const fromStr = fromDate.toISOString();
  const toStr = toDate.toISOString();

  const { data: rows, error } = await supabase
    .from('incidents')
    .select('creation_date, resolved_date')
    .in('repo_id', repoIds)
    .gte('creation_date', fromStr)
    .lte('creation_date', toStr)
    .not('creation_date', 'is', null)
    .not('resolved_date', 'is', null);

  if (error || !rows || rows.length === 0) {
    return { mean_time_to_recovery: 0, incident_count: 0 };
  }

  let sumSeconds = 0;
  let count = 0;
  for (const r of rows as { creation_date: string | null; resolved_date: string | null }[]) {
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
 */
export async function getMeanTimeToRestoreTrendsFromSupabase(
  supabase: SupabaseClient,
  teamId: string,
  fromDate: Date,
  toDate: Date
): Promise<MeanTimeToRestoreTrendsMap> {
  const repoIds = await getTeamRepoIds(supabase, teamId);
  if (repoIds.length === 0) return {};

  const fromStr = fromDate.toISOString();
  const toStr = toDate.toISOString();

  const { data: rows, error } = await supabase
    .from('incidents')
    .select('creation_date, resolved_date')
    .in('repo_id', repoIds)
    .gte('creation_date', fromStr)
    .lte('creation_date', toStr)
    .not('creation_date', 'is', null)
    .not('resolved_date', 'is', null);

  if (error || !rows || rows.length === 0) return {};

  const byDate: Record<string, { sumSeconds: number; count: number }> = {};
  for (const r of rows as { creation_date: string | null; resolved_date: string | null }[]) {
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

  let prRows = rawPrRows as SupabaseLeadTimePRRow[];
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

  const selectFields = branchFilter ? 'first_commit_to_open, cycle_time, updated_at, repo_id, base_branch' : 'first_commit_to_open, cycle_time, updated_at';
  const { data: rawRows, error } = await supabase
    .from('pull_requests')
    .select(selectFields)
    .in('repo_id', repoIds)
    .eq('state', 'MERGED')
    .gte('updated_at', fromStr)
    .lte('updated_at', toStr);

  if (error || !rawRows || rawRows.length === 0) return {};

  let rows = rawRows as { first_commit_to_open?: number | null; cycle_time?: number | null; updated_at?: string | null; repo_id?: string; base_branch?: string | null }[];
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
