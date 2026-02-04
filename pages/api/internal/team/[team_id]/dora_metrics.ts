import { endOfDay, startOfDay } from 'date-fns';
import * as yup from 'yup';

import { getTeamRepos } from '@/api/resources/team_repos';
import { getUnsyncedRepos } from '@/api/resources/teams/[team_id]/unsynced_repos';
import { Endpoint } from '@/api-helpers/global';
import { updatePrFilterParams } from '@/api-helpers/team';
import {
  getChangeFailureRateFromSupabase,
  getChangeFailureRateTrendsFromSupabase,
  getDeploymentFrequencyFromSupabase,
  getDeploymentFrequencyTrendsFromSupabase,
  getLeadTimeFromSupabase,
  getLeadTimePRsFromSupabase,
  getLeadTimeTrendsFromSupabase,
  getTeamRepoIds,
  type SupabaseLeadTimePRRow
} from '@/lib/dora-metrics-supabase';
import { mockDoraMetrics } from '@/mocks/dora_metrics';
import { supabaseServer } from '@/lib/supabase';
import {
  ActiveBranchMode,
  PR,
  TeamDoraMetricsApiResponseType
} from '@/types/resources';
import {
  fetchLeadTimeStats,
  fetchChangeFailureRateStats,
  fetchMeanTimeToRestoreStats
} from '@/utils/cockpitMetricUtils';
import { isoDateString, getAggregateAndTrendsIntervalTime } from '@/utils/date';
import {
  getBranchesAndRepoFilter,
  getWorkFlowFiltersAsPayloadForSingleTeam
} from '@/utils/filterUtils';

import type { SupabaseDeploymentFrequencyResult } from '@/lib/dora-metrics-supabase';
import { getTeamLeadTimePRs } from './insights';

function buildDeploymentFrequencyStatsFromSupabase(
  current: SupabaseDeploymentFrequencyResult,
  previous: SupabaseDeploymentFrequencyResult
): TeamDoraMetricsApiResponseType['deployment_frequency_stats'] {
  const toStats = (data: SupabaseDeploymentFrequencyResult, prevDuration?: 'day' | 'week' | 'month') => {
    const {
      total_deployments,
      avg_daily_deployment_frequency,
      avg_weekly_deployment_frequency,
      avg_monthly_deployment_frequency
    } = data;
    let duration: 'day' | 'week' | 'month' = prevDuration ?? 'month';
    let avg_deployment_frequency = avg_monthly_deployment_frequency;
    if (avg_daily_deployment_frequency >= 1) {
      duration = 'day';
      avg_deployment_frequency = avg_daily_deployment_frequency;
    } else if (avg_weekly_deployment_frequency >= 1) {
      duration = 'week';
      avg_deployment_frequency = avg_weekly_deployment_frequency;
    } else {
      duration = 'month';
      avg_deployment_frequency = avg_monthly_deployment_frequency;
    }
    return {
      total_deployments,
      avg_daily_deployment_frequency,
      avg_weekly_deployment_frequency,
      avg_monthly_deployment_frequency,
      avg_deployment_frequency,
      duration,
    };
  };
  const currentStats = toStats(current);
  const previousStats = toStats(previous, currentStats.duration);
  return {
    current: currentStats,
    previous: previousStats,
  };
}

const pathSchema = yup.object().shape({
  team_id: yup.string().uuid().required()
});

const getSchema = yup.object().shape({
  org_id: yup.string().uuid().optional(),
  branches: yup.string().optional().nullable(),
  from_date: yup.date().required(),
  to_date: yup.date().required(),
  branch_mode: yup.string().oneOf(Object.values(ActiveBranchMode)).optional().default(ActiveBranchMode.ALL)
});

const endpoint = new Endpoint(pathSchema);

endpoint.handle.GET(getSchema, async (req, res) => {
  if (req.meta?.features?.use_mock_data) {
    return res.send(mockDoraMetrics);
  }

  const {
    org_id,
    team_id: teamId,
    from_date: rawFromDate,
    to_date: rawToDate,
    branches,
    branch_mode
  } = req.payload;

  const from_date = isoDateString(startOfDay(new Date(rawFromDate)));
  const to_date = isoDateString(endOfDay(new Date(rawToDate)));

  if (org_id == null || org_id === '') {
    const {
      prevCycleStartDay,
      prevCycleEndDay
    } = getAggregateAndTrendsIntervalTime(from_date, to_date);
    const currStart = startOfDay(new Date(rawFromDate));
    const currEnd = endOfDay(new Date(rawToDate));

    const [
      leadTimeCurrent,
      leadTimePrev,
      deploymentFreqCurrent,
      deploymentFreqPrev,
      deploymentFreqTrendsCurrent,
      deploymentFreqTrendsPrev,
      cfrCurrent,
      cfrPrev,
      cfrTrendsCurrent,
      cfrTrendsPrev,
      repoIds,
      leadTimePRsRows,
      leadTimeTrendsCurrent,
      leadTimeTrendsPrev
    ] = await Promise.all([
      getLeadTimeFromSupabase(supabaseServer, teamId, currStart, currEnd),
      getLeadTimeFromSupabase(
        supabaseServer,
        teamId,
        prevCycleStartDay,
        prevCycleEndDay
      ),
      getDeploymentFrequencyFromSupabase(supabaseServer, teamId, currStart, currEnd),
      getDeploymentFrequencyFromSupabase(
        supabaseServer,
        teamId,
        prevCycleStartDay,
        prevCycleEndDay
      ),
      getDeploymentFrequencyTrendsFromSupabase(supabaseServer, teamId, currStart, currEnd),
      getDeploymentFrequencyTrendsFromSupabase(
        supabaseServer,
        teamId,
        prevCycleStartDay,
        prevCycleEndDay
      ),
      getChangeFailureRateFromSupabase(supabaseServer, teamId, currStart, currEnd),
      getChangeFailureRateFromSupabase(
        supabaseServer,
        teamId,
        prevCycleStartDay,
        prevCycleEndDay
      ),
      getChangeFailureRateTrendsFromSupabase(supabaseServer, teamId, currStart, currEnd),
      getChangeFailureRateTrendsFromSupabase(
        supabaseServer,
        teamId,
        prevCycleStartDay,
        prevCycleEndDay
      ),
      getTeamRepoIds(supabaseServer, teamId),
      getLeadTimePRsFromSupabase(supabaseServer, teamId, currStart, currEnd),
      getLeadTimeTrendsFromSupabase(supabaseServer, teamId, currStart, currEnd),
      getLeadTimeTrendsFromSupabase(
        supabaseServer,
        teamId,
        prevCycleStartDay,
        prevCycleEndDay
      )
    ]);

    const lead_time_prs: PR[] = (leadTimePRsRows || []).map(
      (row: SupabaseLeadTimePRRow): PR => {
        const fco = Number(row.first_commit_to_open) || 0;
        const ct = Number(row.cycle_time) || 0;
        const leadTime = fco + ct;
        return {
          id: row.id,
          number: String(row.pr_no),
          title: row.title ?? '',
          state: (row.state as 'MERGED' | 'CLOSED' | 'OPEN') ?? 'MERGED',
          first_commit_to_open: fco,
          first_response_time: 0,
          rework_time: 0,
          merge_time: ct,
          cycle_time: ct,
          merge_to_deploy: 0,
          lead_time: leadTime,
          author: { username: row.author ?? '' },
          reviewers: [],
          repo_name: row.repo_name ?? '',
          pr_link: '',
          base_branch: row.base_branch ?? '',
          head_branch: row.head_branch ?? '',
          created_at: row.created_at ?? '',
          updated_at: row.updated_at ?? '',
          state_changed_at: row.updated_at ?? '',
          commits: Number(row.commits) || 0,
          additions: Number(row.additions) || 0,
          deletions: Number(row.deletions) || 0,
          changed_files: 0,
          comments: Number(row.comments) || 0,
          provider: 'github'
        };
      }
    );

    const { data: reposRows } =
      repoIds.length > 0
        ? await supabaseServer
            .from('Repos')
            .select('id, repo_name, org_name')
            .in('id', repoIds)
        : { data: [] };
    const assigned_repos = (reposRows || []).map(
      (r: { id: string; repo_name: string; org_name?: string }) => ({
        id: r.id,
        name: r.repo_name,
        org_name: r.org_name ?? '',
        team_id: teamId
      })
    );

    return res.send({
      lead_time_stats: {
        current: leadTimeCurrent,
        previous: leadTimePrev
      },
      lead_time_trends: {
        current: leadTimeTrendsCurrent ?? {},
        previous: leadTimeTrendsPrev ?? {}
      },
      mean_time_to_restore_stats: {
        current: { mean_time_to_recovery: 0, incident_count: 0 },
        previous: { mean_time_to_recovery: 0, incident_count: 0 }
      },
      mean_time_to_restore_trends: {
        current: {},
        previous: {}
      },
      change_failure_rate_stats: {
        current: cfrCurrent,
        previous: cfrPrev
      },
      change_failure_rate_trends: {
        current: cfrTrendsCurrent ?? {},
        previous: cfrTrendsPrev ?? {}
      },
      deployment_frequency_stats: buildDeploymentFrequencyStatsFromSupabase(
        deploymentFreqCurrent,
        deploymentFreqPrev
      ),
      deployment_frequency_trends: {
        current: deploymentFreqTrendsCurrent ?? {},
        previous: deploymentFreqTrendsPrev ?? {}
      },
      lead_time_prs,
      assigned_repos,
      unsynced_repos: []
    } as TeamDoraMetricsApiResponseType);
  }

  const [branchAndRepoFilters, unsyncedRepos] = await Promise.all([
    getBranchesAndRepoFilter({
      orgId: org_id,
      teamId,
      branchMode: branch_mode as ActiveBranchMode,
      branches
    }),
    getUnsyncedRepos(teamId)
  ]);
  const [prFilters, workflowFilters] = await Promise.all([
    updatePrFilterParams(teamId, {}, branchAndRepoFilters).then(
      ({ pr_filter }) => ({
        pr_filter
      })
    ),
    getWorkFlowFiltersAsPayloadForSingleTeam({
      orgId: org_id,
      teamId: teamId
    })
  ]);

  const {
    currTrendsTimeObject,
    prevTrendsTimeObject,
    prevCycleStartDay,
    prevCycleEndDay,
    currentCycleStartDay,
    currentCycleEndDay
  } = getAggregateAndTrendsIntervalTime(from_date, to_date);

  const currStart = startOfDay(new Date(rawFromDate));
  const currEnd = endOfDay(new Date(rawToDate));

  const [
    leadTimeResponse,
    meanTimeToRestoreResponse,
    changeFailureRateResponse,
    deploymentFreqCurrent,
    deploymentFreqPrev,
    deploymentFreqTrendsCurrent,
    deploymentFreqTrendsPrev,
    leadtimePrs,
    teamRepos
  ] = await Promise.all([
    fetchLeadTimeStats({
      teamId,
      currStatsTimeObject: {
        from_time: isoDateString(currentCycleStartDay),
        to_time: isoDateString(currentCycleEndDay)
      },
      prevStatsTimeObject: {
        from_time: isoDateString(prevCycleStartDay),
        to_time: isoDateString(prevCycleEndDay)
      },
      currTrendsTimeObject,
      prevTrendsTimeObject,
      prFilter: prFilters
    }),
    fetchMeanTimeToRestoreStats({
      teamId,
      currStatsTimeObject: {
        from_time: isoDateString(currentCycleStartDay),
        to_time: isoDateString(currentCycleEndDay)
      },
      prevStatsTimeObject: {
        from_time: isoDateString(prevCycleStartDay),
        to_time: isoDateString(prevCycleEndDay)
      },
      currTrendsTimeObject,
      prevTrendsTimeObject,
      prFilter: prFilters
    }),
    fetchChangeFailureRateStats({
      teamId,
      currStatsTimeObject: {
        from_time: isoDateString(currentCycleStartDay),
        to_time: isoDateString(currentCycleEndDay)
      },
      prevStatsTimeObject: {
        from_time: isoDateString(prevCycleStartDay),
        to_time: isoDateString(prevCycleEndDay)
      },
      currTrendsTimeObject,
      prevTrendsTimeObject,
      prFilter: prFilters,
      workflowFilter: workflowFilters
    }),
    getDeploymentFrequencyFromSupabase(supabaseServer, teamId, currStart, currEnd),
    getDeploymentFrequencyFromSupabase(
      supabaseServer,
      teamId,
      prevCycleStartDay,
      prevCycleEndDay
    ),
    getDeploymentFrequencyTrendsFromSupabase(
      supabaseServer,
      teamId,
      currStart,
      currEnd
    ),
    getDeploymentFrequencyTrendsFromSupabase(
      supabaseServer,
      teamId,
      prevCycleStartDay,
      prevCycleEndDay
    ),
    getTeamLeadTimePRs(teamId, from_date, to_date, prFilters).then(
      (r) => r.data
    ),
    getTeamRepos(teamId)
  ]);

  const deploymentFrequencyStats = buildDeploymentFrequencyStatsFromSupabase(
    deploymentFreqCurrent,
    deploymentFreqPrev
  );

  return res.send({
    lead_time_stats: leadTimeResponse.lead_time_stats,
    lead_time_trends: leadTimeResponse.lead_time_trends,
    mean_time_to_restore_stats:
      meanTimeToRestoreResponse.mean_time_to_restore_stats,
    mean_time_to_restore_trends:
      meanTimeToRestoreResponse.mean_time_to_restore_trends,
    change_failure_rate_stats:
      changeFailureRateResponse.change_failure_rate_stats,
    change_failure_rate_trends:
      changeFailureRateResponse.change_failure_rate_trends,
    deployment_frequency_stats: deploymentFrequencyStats,
    deployment_frequency_trends: {
      current: deploymentFreqTrendsCurrent ?? {},
      previous: deploymentFreqTrendsPrev ?? {}
    },
    lead_time_prs: leadtimePrs,
    assigned_repos: teamRepos,
    unsynced_repos: unsyncedRepos
  } as TeamDoraMetricsApiResponseType);
});

export default endpoint.serve();
