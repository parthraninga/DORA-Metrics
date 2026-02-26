import { getDoraScore } from '@/utils/dora';
import {
  TeamDoraMetricsApiResponseType,
  PR
} from '@/types/resources';

// lead_time_prs and deployment_pipeline are available — include them in scope
type MetricsSummary = Omit<
  TeamDoraMetricsApiResponseType,
  'assigned_repos' | 'unsynced_repos'
>;

// ── Primitive helpers ────────────────────────────────────────────────────────

const r2 = (n: number | null | undefined): number =>
  n == null ? 0 : Math.round(n * 100) / 100;

const secToHrs = (v: number | null | undefined): number =>
  v == null || v === 0 ? 0 : r2(v / 3600);

const secToMinsStr = (v: number | null | undefined): string => {
  if (v == null || v === 0) return '0m 0s';
  const secs = Math.round(v);
  if (secs >= 3600)
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m ${secs % 60}s`;
  if (secs >= 60)
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${secs}s`;
};

/** Format ISO timestamp → "YYYY-MM-DD HH:mm" (UTC) */
const fmtDT = (iso: string | null | undefined): string => {
  if (!iso) return '0';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

const todayStr = (): string => fmtDT(new Date().toISOString());

/** Escape a value for CSV */
const c = (v: string | number | null | undefined): string => {
  const s = v == null ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n'))
    return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const row = (...cols: (string | number | null | undefined)[]): string =>
  cols.map(c).join(',');

// ── Duration helpers ─────────────────────────────────────────────────────────

function durationHrsStr(seconds: number | null | undefined): string {
  const hrs = secToHrs(seconds);
  if (hrs === 0) return '0.00 hrs';
  if (hrs < 1) return `${r2(hrs * 60)} min`;
  const days = Math.floor(hrs / 24);
  const remHrs = r2(hrs % 24);
  if (days > 0) return `${days}d ${remHrs}h`;
  return `${hrs} hrs`;
}

// ── Median helper ─────────────────────────────────────────────────────────────

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? r2((sorted[mid - 1] + sorted[mid]) / 2)
    : r2(sorted[mid]);
}

// ── Performance tiers ─────────────────────────────────────────────────────────

function ltTier(hrs: number): string {
  if (hrs === 0) return 'No Data';
  if (hrs < 1)   return 'Elite';
  if (hrs < 24)  return 'High';
  if (hrs < 168) return 'Medium';
  return 'Low';
}

function dfTier(weekly: number): string {
  if (weekly >= 2)    return 'Elite';
  if (weekly >= 1)    return 'High';
  if (weekly >= 0.25) return 'Medium';
  return 'Low';
}

function cfrTier(pct: number): string {
  if (pct <= 5)  return 'Elite';
  if (pct <= 10) return 'High';
  if (pct <= 15) return 'Medium';
  return 'Low';
}

function mttrTier(hrs: number): string {
  if (hrs === 0)  return 'No Data';
  if (hrs < 1)    return 'Elite';
  if (hrs < 24)   return 'High';
  if (hrs < 168)  return 'Medium';
  return 'Low';
}

// ── Period start/end ──────────────────────────────────────────────────────────

function getPeriod(m: MetricsSummary): { start: string; end: string } {
  const allKeys = [
    ...Object.keys(m.deployment_frequency_trends?.current ?? {}),
    ...Object.keys(m.lead_time_trends?.current ?? {}),
    ...Object.keys(m.change_failure_rate_trends?.current ?? {}),
    ...Object.keys(m.mean_time_to_restore_trends?.current ?? {})
  ].sort();
  return {
    start: allKeys[0] ?? todayStr().slice(0, 10),
    end: allKeys[allKeys.length - 1] ?? todayStr().slice(0, 10)
  };
}

// ── Main report builder ───────────────────────────────────────────────────────

function buildReport(
  m: MetricsSummary,
  projectName: string,
  dateRangeLabel?: string,
  doraScoreStats?: ReturnType<typeof getDoraScore>
): string {
  const lines: string[] = [];

  // ── Gather scalar values ───────────────────────────────────────────────
  const ltSec         = m.lead_time_stats?.current?.lead_time;
  const ltHrs         = secToHrs(ltSec ?? 0);
  const dfTotal       = m.deployment_frequency_stats?.current?.total_deployments ?? 0;
  const dfWeeklyRaw   = m.deployment_frequency_stats?.current?.avg_weekly_deployment_frequency;
  const dfWeekly      = r2(dfWeeklyRaw ?? 0);
  const cfrTotal      = m.change_failure_rate_stats?.current?.total_deployments ?? 0;
  const cfrPctRaw     = m.change_failure_rate_stats?.current?.change_failure_rate;
  const cfrPct        = r2(cfrPctRaw ?? 0);
  const cfrFailed     = m.change_failure_rate_stats?.current?.failed_deployments ?? 0;
  const mttrSec       = m.mean_time_to_restore_stats?.current?.mean_time_to_recovery;
  const mttrHrs       = secToHrs(mttrSec ?? 0);
  const incidentCount = m.mean_time_to_restore_stats?.current?.incident_count ?? 0;
  const prs: PR[]     = (m as any).lead_time_prs ?? [];
  const pipeline      = m.deployment_pipeline;
  const period        = getPeriod(m);

  // DORA score — use the UI's already-calculated score (with integration checks applied)
  // If not provided, calculate it (fallback for direct calls)
  const doraScore = doraScoreStats?.avg ?? getDoraScore({ 
    lt: typeof ltSec === 'number' ? ltSec : null,
    df: typeof dfWeeklyRaw === 'number' ? dfWeeklyRaw : null,
    cfr: typeof cfrPctRaw === 'number' ? cfrPctRaw : null,
    mttr: typeof mttrSec === 'number' ? mttrSec : null
  }).avg ?? 0;

  const prTriggeredCount = prs.length;
  const manualCount      = Math.max(0, dfTotal - prTriggeredCount);
  const successfulCount  = Math.max(0, dfTotal - cfrFailed);

  const repoSet  = new Set<string>(prs.map((p) => p.repo_name ?? 'Unknown').filter(Boolean));
  const repoList = repoSet.size > 0 ? Array.from(repoSet).join(' | ') : 'N/A';

  // ── GLOBAL HEADER ──────────────────────────────────────────────────────────
  lines.push('DORA EXECUTIVE REPORT');
  lines.push('');
  lines.push(row('Project Name',             projectName));
  lines.push(row('Repositories Included',    repoList));
  lines.push(row('Report Period',            dateRangeLabel || (period.start + ' to ' + period.end)));
  lines.push(row('Generated Date',           todayStr()));
  lines.push(row('DORA Score',               doraScore + ' / 10'));

  lines.push('');

  // ── DEPLOYMENT PIPELINE FUNNEL ─────────────────────────────────────────────
  lines.push('DEPLOYMENT PIPELINE FUNNEL');
  lines.push(row('Stage', 'Deployments'));
  lines.push(row('Dev Deployments',        pipeline?.dev   ?? 0));
  lines.push(row('Stage Deployments',      pipeline?.stage ?? 0));
  lines.push(row('Production Deployments', pipeline?.prod  ?? 0));
  lines.push('');

  // ══════════════════════════════════════════════════════════════════════
  // SECTION 1 — DEPLOYMENT FREQUENCY
  // ══════════════════════════════════════════════════════════════════════
  lines.push('SECTION 1 - DEPLOYMENT FREQUENCY');
  lines.push('');
  lines.push('SUMMARY');
  lines.push(row('Metric', 'Value'));
  lines.push(row('Total Deployments',        dfTotal));
  lines.push(row('Successful Deployments',   successfulCount));
  lines.push(row('Failed Deployments',       cfrFailed));
  lines.push(row('PR-triggered Deployments', prTriggeredCount));
  lines.push(row('Manual Deployments',       manualCount));
  lines.push(row('Avg Deployments per Week', dfWeekly));
  lines.push(row('Performance Tier',         dfTier(dfWeekly)));
  lines.push('');

  lines.push('DEPLOYMENT LOG');
  lines.push(row('Deployment ID', 'Repository', 'Environment', 'Trigger Type', 'Workflow / Branch', 'Status', 'Started Time', 'Finished Time', 'Duration'));

  if (prs.length > 0) {
    for (const pr of prs) {
      const durationSec = (pr.first_commit_to_open ?? 0) + (pr.cycle_time ?? 0);
      lines.push(row(
        'PR#' + pr.number,
        pr.repo_name ?? 'Unknown',
        pr.base_branch ?? 'production',
        'PR Merge',
        pr.head_branch ?? pr.title ?? 'N/A',
        'SUCCESS',
        fmtDT(pr.created_at),
        fmtDT(pr.state_changed_at ?? pr.updated_at),
        durationHrsStr(durationSec)
      ));
    }
  } else {
    const dfTrends = m.deployment_frequency_trends?.current ?? {};
    let depIdx = 0;
    for (const [date, val] of Object.entries(dfTrends).sort()) {
      const cnt = (val as { count: number }).count ?? 0;
      for (let i = 0; i < cnt; i++) {
        depIdx++;
        lines.push(row('DEP-' + date.replace(/-/g, '') + '-' + depIdx, repoList, 'production', 'Workflow Run', 'N/A', 'SUCCESS', date + ' 00:00', date + ' 00:00', 'N/A'));
      }
    }
  }
  lines.push('');

  // ══════════════════════════════════════════════════════════════════════
  // SECTION 2 — LEAD TIME FOR CHANGES
  // ══════════════════════════════════════════════════════════════════════
  lines.push('SECTION 2 - LEAD TIME FOR CHANGES');
  lines.push('');

  const ltValues = prs.map((pr) => secToHrs((pr.first_commit_to_open ?? 0) + (pr.cycle_time ?? 0))).filter((v) => v > 0);
  const avgLtHrs    = ltValues.length > 0 ? r2(ltValues.reduce((a, b) => a + b, 0) / ltValues.length) : ltHrs;
  const medianLtHrs = ltValues.length > 0 ? median(ltValues) : 0;

  lines.push('SUMMARY');
  lines.push(row('Metric', 'Value'));
  lines.push(row('Average Lead Time',    durationHrsStr(avgLtHrs * 3600)));
  lines.push(row('Median Lead Time',     durationHrsStr(medianLtHrs * 3600)));
  lines.push(row('Total PR Deployments', prTriggeredCount));
  lines.push(row('Performance Tier',     ltTier(avgLtHrs)));

  lines.push('');

  lines.push('PR DELIVERY TABLE');
  lines.push(row('PR Number', 'Repository', 'Author', 'Commit to PR Open (hrs)', 'PR Open to First Review (hrs)', 'Rework Time (hrs)', 'Merge Time (hrs)', 'Merge to Deployment (hrs)', 'Total Lead Time (hrs)', 'Deployment Date'));

  if (prs.length > 0) {
    for (const pr of prs) {
      const fco   = secToHrs(pr.first_commit_to_open);
      const resp  = secToHrs(pr.first_response_time);
      const rwk   = secToHrs(pr.rework_time);
      const mrg   = secToHrs(pr.merge_time ?? pr.cycle_time);
      const m2d   = secToHrs(pr.merge_to_deploy);
      const total = r2(fco + resp + rwk + mrg + m2d) || secToHrs((pr.first_commit_to_open ?? 0) + (pr.cycle_time ?? 0));
      lines.push(row(
        '#' + pr.number,
        pr.repo_name ?? 'Unknown',
        pr.author?.linked_user?.name ?? pr.author?.username ?? 'Unknown',
        fco, resp, rwk, mrg, m2d, total,
        fmtDT(pr.state_changed_at ?? pr.updated_at)
      ));
    }
  } else {
    lines.push(row('No PR data available', '', '', '', '', '', '', '', '', ''));
  }
  lines.push('');

  // ══════════════════════════════════════════════════════════════════════
  // SECTION 3 — CHANGE FAILURE RATE
  // ══════════════════════════════════════════════════════════════════════
  lines.push('SECTION 3 - CHANGE FAILURE RATE');
  lines.push('');
  lines.push('SUMMARY');
  lines.push(row('Metric', 'Value'));
  lines.push(row('Total Deployments (Workflow Runs)', cfrTotal));
  lines.push(row('Failed Deployments', cfrFailed));
  lines.push(row('Failure Rate %',     cfrPct + '%'));
  lines.push(row('Incident Count',     incidentCount));
  lines.push(row('Performance Tier',   cfrTier(cfrPct)));

  lines.push('');

  lines.push('FAILURE EVENTS TABLE');
  lines.push(row('Deployment ID', 'Repository', 'Environment', 'Failure Time', 'Failure Reason', 'Incident Created', 'Incident Resolved', 'Recovery Duration'));

  const cfrTrendsData  = m.change_failure_rate_trends?.current ?? {};
  const mttrTrendsData = m.mean_time_to_restore_trends?.current ?? {};

  const failureDays = Object.entries(cfrTrendsData as Record<string, { change_failure_rate: number; failed_deployments: number; total_deployments: number }>)
    .filter(([, v]) => (v.failed_deployments ?? 0) > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  if (failureDays.length > 0) {
    for (let fi = 0; fi < failureDays.length; fi++) {
      const [date] = failureDays[fi];
      const mttrDay    = (mttrTrendsData as any)[date] ?? {};
      const mttrRecSec = mttrDay.mean_time_to_recovery ?? 0;
      const resolvedAt = mttrRecSec > 0
        ? fmtDT(new Date(new Date(date).getTime() + mttrRecSec * 1000).toISOString())
        : 'N/A';
      lines.push(row(
        'FAIL-' + date.replace(/-/g, '') + '-' + (fi + 1),
        repoList, 'production',
        date + ' 00:00',
        'Pipeline failure / Remediation deployment',
        date + ' 00:00',
        resolvedAt,
        secToMinsStr(mttrRecSec)
      ));
    }
  } else {
    lines.push(row('No failure events in period', '', '', '', '', '', '', ''));
  }
  lines.push('');

  // ══════════════════════════════════════════════════════════════════════
  // SECTION 4 — MEAN TIME TO RECOVERY
  // ══════════════════════════════════════════════════════════════════════
  lines.push('SECTION 4 - MEAN TIME TO RECOVERY');
  lines.push('');

  const mttrEntries = Object.entries(mttrTrendsData as Record<string, { mean_time_to_recovery: number; incident_count: number }>)
    .filter(([, v]) => (v.incident_count ?? 0) > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  const mttrSecsArr = mttrEntries.map(([, v]) => v.mean_time_to_recovery ?? 0).filter((s) => s > 0);
  const fastestSec  = mttrSecsArr.length > 0 ? Math.min(...mttrSecsArr) : 0;
  const slowestSec  = mttrSecsArr.length > 0 ? Math.max(...mttrSecsArr) : 0;

  lines.push('SUMMARY');
  lines.push(row('Metric', 'Value'));
  lines.push(row('Average Recovery Time', secToMinsStr(mttrSec)));
  lines.push(row('Fastest Recovery',      secToMinsStr(fastestSec)));
  lines.push(row('Slowest Recovery',      secToMinsStr(slowestSec)));
  lines.push(row('Incident Count',        incidentCount));
  lines.push(row('Performance Tier',      mttrTier(mttrHrs)));

  lines.push('');

  lines.push('INCIDENT LOG');
  lines.push(row('Incident ID', 'Repository', 'Environment', 'Detected At', 'Resolved At', 'Avg Recovery Duration', 'Incident Count'));

  if (mttrEntries.length > 0) {
    let incIdx = 1;
    for (const [date, v] of mttrEntries) {
      const recSec     = v.mean_time_to_recovery ?? 0;
      const detectedAt = date + ' 00:00';
      const resolvedAt = recSec > 0
        ? fmtDT(new Date(new Date(date).getTime() + recSec * 1000).toISOString())
        : 'N/A';
      // One row per day — recSec is already the daily average, repeating it N times is misleading
      lines.push(row(
        'INC-' + date.replace(/-/g, '') + '-' + String(incIdx).padStart(3, '0'),
        repoList, 'production',
        detectedAt, resolvedAt,
        secToMinsStr(recSec),
        v.incident_count ?? 1
      ));
      incIdx++;
    }
  } else {
    lines.push(row('No incidents in period', '', '', '', '', '', ''));
  }

  return lines.join('\n');
}

// ── Download trigger ─────────────────────────────────────────────────────────

function triggerCsvDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Public API ───────────────────────────────────────────────────────────────

export function downloadDoraReport(
  metrics_summary: MetricsSummary | null,
  dateRangeLabel: string,
  projectName = 'Engineering Team',
  doraScoreStats?: ReturnType<typeof getDoraScore>
): void {
  if (!metrics_summary) return;

  const safeLabel = dateRangeLabel.replace(/[^a-zA-Z0-9\s\-]/g, '').replace(/\s+/g, '_');
  const csv = buildReport(metrics_summary, projectName, dateRangeLabel, doraScoreStats);
  triggerCsvDownload(csv, `DORA_Executive_Report_${safeLabel}.csv`);
}

