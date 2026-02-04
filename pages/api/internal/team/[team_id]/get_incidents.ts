import { endOfDay, startOfDay } from 'date-fns';
import { isNil, reject } from 'ramda';
import * as yup from 'yup';

import { handleRequest } from '@/api-helpers/axios';
import { Endpoint } from '@/api-helpers/global';
import { updatePrFilterParams } from '@/api-helpers/team';
import { getTeamRepoIds } from '@/lib/dora-metrics-supabase';
import { supabaseServer } from '@/lib/supabase';
import { mockDeploymentsWithIncidents } from '@/mocks/incidents';
import {
  DeploymentWithIncidents,
  IncidentApiResponseType,
  ActiveBranchMode,
  Incident,
  IncidentStatus,
  WorkflowRunInPeriod
} from '@/types/resources';
import { getWeekStartAndEndInterval } from '@/utils/date';
import { getBranchesAndRepoFilter } from '@/utils/filterUtils';

const pathSchema = yup.object().shape({
  team_id: yup.string().uuid().required()
});

const getSchema = yup.object().shape({
  from_date: yup.date().required(),
  to_date: yup.date().required(),
  branches: yup.string().optional().nullable(),
  repo_filters: yup.mixed().optional().nullable(),
  org_id: yup.string().uuid().optional().nullable(),
  branch_mode: yup.string().oneOf(Object.values(ActiveBranchMode)).required()
});

const endpoint = new Endpoint(pathSchema);

/**
 * Fetch deployments with incidents and all workflow runs in period from Supabase
 * when no org_id (code provider) is linked.
 */
async function getDeploymentsWithIncidentsFromSupabase(
  teamId: string,
  fromDate: Date,
  toDate: Date
): Promise<{
  deployments: DeploymentWithIncidents[];
  workflow_runs_in_period: WorkflowRunInPeriod[];
}> {
  const repoIds = await getTeamRepoIds(supabaseServer, teamId);
  if (repoIds.length === 0) {
    return { deployments: [], workflow_runs_in_period: [] };
  }

  const fromStr = fromDate.toISOString();
  const toStr = toDate.toISOString();

  const [incidentsRes, workflowRunsRes] = await Promise.all([
    supabaseServer
      .from('incidents')
      .select('id, repo_id, workflow_run_id, created_at, creation_date, resolved_date')
      .in('repo_id', repoIds)
      .not('creation_date', 'is', null)
      .gte('creation_date', fromStr)
      .lte('creation_date', toStr),
    supabaseServer
      .from('workflow_runs')
      .select('id, repo_id, run_id, name, head_branch, conclusion, status, created_at, updated_at, html_url')
      .in('repo_id', repoIds)
      .gte('created_at', fromStr)
      .lte('created_at', toStr)
  ]);

  const incidentsRows = (incidentsRes.data || []) as {
    id: string;
    repo_id: string;
    workflow_run_id: number;
    created_at: string | null;
    creation_date: string | null;
    resolved_date: string | null;
  }[];
  const workflowRunsRows = (workflowRunsRes.data || []) as {
    id: string;
    repo_id: string;
    run_id: number | null;
    name: string | null;
    head_branch: string | null;
    conclusion: string | null;
    status: string | null;
    created_at: string | null;
    updated_at: string | null;
    html_url: string | null;
  }[];

  const runKey = (repoId: string, runId: number) => `${repoId}:${runId}`;
  const runsMap = new Map<string, (typeof workflowRunsRows)[0]>();
  for (const wr of workflowRunsRows) {
    if (wr.run_id != null) runsMap.set(runKey(wr.repo_id, wr.run_id), wr);
  }

  // Recovery run = workflow run with conclusion success and created_at = incident.resolved_date (next success after failure)
  const recoveryRunKey = (repoId: string, createdAt: string) => `${repoId}:${createdAt}`;
  const recoveryRunsMap = new Map<string, (typeof workflowRunsRows)[0]>();
  for (const wr of workflowRunsRows) {
    if ((wr.conclusion ?? '').toLowerCase() === 'success' && wr.created_at)
      recoveryRunsMap.set(recoveryRunKey(wr.repo_id, wr.created_at), wr);
  }

  const incidentsByRun = new Map<string, typeof incidentsRows>();
  for (const inc of incidentsRows) {
    const key = runKey(inc.repo_id, inc.workflow_run_id);
    if (!incidentsByRun.has(key)) incidentsByRun.set(key, []);
    incidentsByRun.get(key)!.push(inc);
  }

  type WorkflowRunPayload = {
    run_id: number | null;
    name: string | null;
    conclusion: string | null;
    status: string | null;
    created_at: string;
    updated_at: string;
    html_url: string | null;
    head_branch: string | null;
  };

  const out: DeploymentWithIncidents[] = [];
  for (const [key, incs] of incidentsByRun) {
    const wr = runsMap.get(key);
    if (!wr || incs.length === 0) continue;

    const createdAt = wr.created_at ?? new Date().toISOString();
    const updatedAt = wr.updated_at ?? createdAt;
    const runDurationSeconds =
      wr.created_at && wr.updated_at
        ? Math.round(
            (new Date(wr.updated_at).getTime() - new Date(wr.created_at).getTime()) / 1000
          )
        : 0;

    const firstResolvedDate = incs[0]?.resolved_date ?? null;
    const recoveryRun = firstResolvedDate
      ? recoveryRunsMap.get(recoveryRunKey(incs[0].repo_id, firstResolvedDate))
      : undefined;

    const incidentList: Incident[] = incs.map((i) => {
      const creationDate = i.creation_date ?? i.created_at ?? createdAt;
      const resolvedDate = i.resolved_date ?? i.creation_date ?? i.created_at ?? createdAt;
      return {
        id: i.id,
        title: 'Workflow incident',
        summary: '',
        key: i.id,
        incident_number: 0,
        provider: 'zenduty',
        status: IncidentStatus.RESOLVED,
        creation_date: creationDate,
        resolved_date: resolvedDate,
        acknowledged_date: creationDate,
        assigned_to: { username: '' },
        assignees: [],
        url: wr.html_url ?? ''
      };
    });

    const deployment: DeploymentWithIncidents & {
      workflow_run?: WorkflowRunPayload;
      recovery_workflow_run?: WorkflowRunPayload;
    } = {
      id: wr.id,
      status: (wr.conclusion === 'success' ? 'SUCCESS' : 'FAILURE') as 'SUCCESS' | 'FAILURE',
      head_branch: wr.head_branch ?? '',
      event_actor: { username: '' },
      created_at: createdAt,
      updated_at: updatedAt,
      conducted_at: createdAt,
      pr_count: 0,
      run_duration: runDurationSeconds,
      html_url: wr.html_url ?? '',
      repo_workflow_id: wr.id,
      incidents: incidentList,
      workflow_run: {
        run_id: wr.run_id,
        name: wr.name,
        conclusion: wr.conclusion,
        status: wr.status,
        created_at: createdAt,
        updated_at: updatedAt,
        html_url: wr.html_url,
        head_branch: wr.head_branch
      }
    };
    if (recoveryRun) {
      const recCreated = recoveryRun.created_at ?? '';
      const recUpdated = recoveryRun.updated_at ?? recCreated;
      deployment.recovery_workflow_run = {
        run_id: recoveryRun.run_id,
        name: recoveryRun.name,
        conclusion: recoveryRun.conclusion,
        status: recoveryRun.status,
        created_at: recCreated,
        updated_at: recUpdated,
        html_url: recoveryRun.html_url,
        head_branch: recoveryRun.head_branch
      };
    }
    out.push(deployment);
  }

  // All workflow runs in period, ascending by created_at (for "no incidents" view)
  const workflowRunsInPeriod: WorkflowRunInPeriod[] = [...workflowRunsRows]
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    .map((wr) => ({
      id: wr.id,
      repo_id: wr.repo_id,
      run_id: wr.run_id,
      name: wr.name,
      head_branch: wr.head_branch,
      conclusion: wr.conclusion,
      status: wr.status,
      created_at: wr.created_at,
      updated_at: wr.updated_at,
      html_url: wr.html_url
    }));

  return { deployments: out, workflow_runs_in_period: workflowRunsInPeriod };
}

endpoint.handle.GET(getSchema, async (req, res) => {
  if (req.meta?.features?.use_mock_data)
    return res.send(mockDeploymentsWithIncidents);

  const {
    team_id,
    from_date: rawFromDate,
    to_date: rawToDate,
    branches,
    org_id,
    branch_mode
  } = req.payload;
  const from_date = startOfDay(new Date(rawFromDate));
  const to_date = endOfDay(new Date(rawToDate));

  if (org_id == null || org_id === '') {
    const { deployments, workflow_runs_in_period } =
      await getDeploymentsWithIncidentsFromSupabase(team_id, from_date, to_date);
    return res.send({
      deployments_with_incidents: deployments,
      workflow_runs_in_period,
      summary_prs: [],
      revert_prs: []
    } as IncidentApiResponseType);
  }

  const branchAndRepoFilters = await getBranchesAndRepoFilter({
    orgId: org_id,
    teamId: team_id,
    branchMode: branch_mode as ActiveBranchMode,
    branches
  });
  const prFilter = await updatePrFilterParams(
    team_id,
    {},
    branchAndRepoFilters
  ).then(({ pr_filter }) => ({
    pr_filter
  }));

  const deploymentsWithIncident = await getTeamIncidentsWithDeployment({
    team_id,
    from_date,
    to_date,
    pr_filter: prFilter.pr_filter
  });

  return res.send({
    deployments_with_incidents: deploymentsWithIncident,
    summary_prs: [],
    revert_prs: []
  } as IncidentApiResponseType);
});

export const getTeamIncidentsWithDeployment = async (params: {
  team_id: ID;
  from_date: DateString | Date;
  to_date: DateString | Date;
  pr_filter: any;
}) => {
  const [from_time, to_time] = getWeekStartAndEndInterval(
    params.from_date,
    params.to_date
  );

  return handleRequest<DeploymentWithIncidents[]>(
    `/teams/${params.team_id}/deployments_with_related_incidents`,
    {
      params: reject(isNil, {
        from_time,
        to_time,
        pr_filter: params.pr_filter
      })
    }
  );
};

export default endpoint.serve();
