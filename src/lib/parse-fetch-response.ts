import type { SupabaseClient } from '@supabase/supabase-js';

type RelatedPr = {
  no?: number;
  number?: number;
  title?: string;
  author?: string | { username?: string; login?: string };
  first_commit_to_open?: number;
  cycle_time?: number;
  created_at?: string;
  updated_at?: string;
  state?: string;
  incidents?: unknown[];
  base_branch?: string;
  head_branch?: string;
  commits?: number;
  additions?: number;
  deletions?: number;
  comments?: number;
};

type DeploymentLike = {
  related_prs?: RelatedPr[];
  incidents?: unknown[];
};

type WorkflowRunLike = {
  id?: number;
  run_id?: number;
  name?: string;
  head_branch?: string;
  status?: string;
  conclusion?: string;
  created_at?: string;
  updated_at?: string;
  html_url?: string;
  actor?: unknown;
  workflow_id?: number;
};

function toAuthorString(a: RelatedPr['author']): string | null {
  if (a == null) return null;
  if (typeof a === 'string') return a;
  if (typeof a === 'object' && a !== null) {
    const u = (a as { username?: string; login?: string }).username ?? (a as { login?: string }).login;
    return typeof u === 'string' ? u : null;
  }
  return null;
}

function parseWorkflowRunId(incident: unknown): number | null {
  if (typeof incident === 'number' && Number.isInteger(incident)) return incident;
  if (typeof incident === 'object' && incident !== null) {
    const o = incident as Record<string, unknown>;
    const keyVal = o.key;
    if (typeof keyVal === 'string') {
      const m = /workflow-(\d+)/i.exec(keyVal);
      if (m) return parseInt(m[1], 10);
    }
    const id = o.workflow_run_id ?? o.run_id ?? o.id;
    if (typeof id === 'number') return id;
    if (typeof id === 'string' && /^\d+$/.test(id)) return parseInt(id, 10);
    for (const key of Object.keys(o)) {
      const m = /^workflow-(\d+)$/i.exec(key);
      if (m) return parseInt(m[1], 10);
    }
  }
  if (typeof incident === 'string') {
    const m = /workflow-(\d+)/i.exec(incident);
    if (m) return parseInt(m[1], 10);
    if (/^\d+$/.test(incident)) return parseInt(incident, 10);
  }
  return null;
}

function toTimestamp(s: unknown): string | null {
  if (s == null) return null;
  if (typeof s === 'string') return s;
  if (typeof s === 'number') return new Date(s).toISOString();
  return null;
}

type RepoLike = {
  deployments?: DeploymentLike[];
  incidents?: unknown[];
  workflow_runs?: WorkflowRunLike[];
};

/**
 * Parse Lambda raw_response and insert into pull_requests, workflow_runs, incidents.
 * Actual shape: { repos: [ { deployments: [...], related_prs inside each deployment, incidents: [...], workflow_runs: [...] } ] }.
 */
export async function parseAndStoreFetchResponse(
  supabase: SupabaseClient,
  rawResponse: unknown,
  repoId: string,
  fetchDataId: string
): Promise<{ pullRequests: number; workflowRuns: number; incidents: number }> {
  const result = { pullRequests: 0, workflowRuns: 0, incidents: 0 };
  if (rawResponse == null || typeof rawResponse !== 'object') return result;

  const root = rawResponse as Record<string, unknown>;
  const data = (root.data as Record<string, unknown>) ?? root;
  const repos = (data.repos as RepoLike[] | undefined) ?? [];

  const relatedPrs: { pr: RelatedPr; prNo: number }[] = [];
  const seenPrNo = new Set<number>();
  for (const repo of Array.isArray(repos) ? repos : []) {
    const deployments = (repo.deployments as DeploymentLike[] | undefined) ?? [];
    for (const dep of deployments) {
      const prs = dep.related_prs ?? [];
      for (const pr of Array.isArray(prs) ? prs : []) {
        const no = pr.no ?? pr.number;
        if (no == null) continue;
        const prNo = typeof no === 'number' ? no : parseInt(String(no), 10);
        if (Number.isNaN(prNo) || seenPrNo.has(prNo)) continue;
        seenPrNo.add(prNo);
        relatedPrs.push({ pr, prNo });
      }
    }
  }

  const prNoToId = new Map<number, string>();

  const toInt = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
  };

  for (const { pr, prNo } of relatedPrs) {
    const { data: inserted, error } = await supabase
      .from('pull_requests')
      .insert({
        repo_id: repoId,
        fetch_data_id: fetchDataId,
        pr_no: prNo,
        title: pr.title ?? null,
        author: toAuthorString(pr.author) ?? null,
        first_commit_to_open: pr.first_commit_to_open ?? null,
        cycle_time: pr.cycle_time ?? null,
        created_at: toTimestamp(pr.created_at) ?? null,
        updated_at: toTimestamp(pr.updated_at) ?? null,
        state: pr.state ?? null,
        base_branch: typeof pr.base_branch === 'string' ? pr.base_branch : null,
        head_branch: typeof pr.head_branch === 'string' ? pr.head_branch : null,
        commits: toInt(pr.commits),
        additions: toInt(pr.additions),
        deletions: toInt(pr.deletions),
        comments: toInt(pr.comments),
      })
      .select('id')
      .single();

    if (!error && inserted) {
      prNoToId.set(prNo, (inserted as { id: string }).id);
      result.pullRequests += 1;
    }
  }

  const workflowRunsRaw: WorkflowRunLike[] = [];
  for (const repo of Array.isArray(repos) ? repos : []) {
    const wrs = (repo.workflow_runs as WorkflowRunLike[] | undefined) ?? [];
    workflowRunsRaw.push(...wrs);
  }
  const dataWrs = (data.workflow_runs as WorkflowRunLike[] | undefined) ?? [];
  if (dataWrs.length) workflowRunsRaw.push(...dataWrs);

  for (const wr of workflowRunsRaw) {
    const runId = wr.id ?? wr.run_id ?? (typeof wr.name === 'string' ? /Run\s+(\d+)/i.exec(wr.name)?.[1] : null);
    const { error } = await supabase.from('workflow_runs').insert({
      repo_id: repoId,
      fetch_data_id: fetchDataId,
      run_id: runId != null ? (typeof runId === 'number' ? runId : parseInt(String(runId), 10)) : null,
      name: wr.name ?? null,
      head_branch: wr.head_branch ?? null,
      status: wr.status ?? null,
      conclusion: wr.conclusion ?? null,
      created_at: toTimestamp(wr.created_at) ?? null,
      updated_at: toTimestamp(wr.updated_at) ?? null,
      html_url: typeof wr.html_url === 'string' ? wr.html_url : null,
      actor: wr.actor != null ? wr.actor : null,
      workflow_id: wr.workflow_id ?? null,
    });
    if (!error) result.workflowRuns += 1;
  }

  // Derive incidents from workflow_runs: failure = creation, next success = resolved
  const runsWithMeta: { runId: number; created_at: string; conclusion: string | null }[] = [];
  for (const wr of workflowRunsRaw) {
    const runId = wr.id ?? wr.run_id ?? (typeof wr.name === 'string' ? /Run\s+(\d+)/i.exec(wr.name)?.[1] : null);
    const created = toTimestamp(wr.created_at);
    if (runId == null || created == null) continue;
    const id = typeof runId === 'number' ? runId : parseInt(String(runId), 10);
    if (Number.isNaN(id)) continue;
    runsWithMeta.push({
      runId: id,
      created_at: created,
      conclusion: typeof wr.conclusion === 'string' ? wr.conclusion : null,
    });
  }
  runsWithMeta.sort((a, b) => a.created_at.localeCompare(b.created_at));

  for (let i = 0; i < runsWithMeta.length; i++) {
    const run = runsWithMeta[i];
    const isFailure = (run.conclusion ?? '').toLowerCase() === 'failure';
    if (!isFailure) continue;

    let resolvedDate: string | null = null;
    for (let j = i + 1; j < runsWithMeta.length; j++) {
      const next = runsWithMeta[j];
      if ((next.conclusion ?? '').toLowerCase() === 'success') {
        resolvedDate = next.created_at;
        break;
      }
    }

    const { error } = await supabase.from('incidents').insert({
      repo_id: repoId,
      fetch_data_id: fetchDataId,
      pull_request_id: null,
      workflow_run_id: run.runId,
      pr_no: null,
      creation_date: run.created_at,
      resolved_date: resolvedDate,
    });
    if (!error) result.incidents += 1;
  }

  return result;
}
