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
  IncidentStatus
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
 * Fetch deployments with incidents from Supabase (incidents + workflow_runs)
 * when no org_id (code provider) is linked.
 */
async function getDeploymentsWithIncidentsFromSupabase(
  teamId: string,
  fromDate: Date,
  toDate: Date
): Promise<DeploymentWithIncidents[]> {
  const repoIds = await getTeamRepoIds(supabaseServer, teamId);
  if (repoIds.length === 0) return [];

  const fromStr = fromDate.toISOString();
  const toStr = toDate.toISOString();

  const [incidentsRes, workflowRunsRes] = await Promise.all([
    supabaseServer
      .from('incidents')
      .select('id, repo_id, workflow_run_id, created_at, creation_date, resolved_date')
      .in('repo_id', repoIds)
      .gte('created_at', fromStr)
      .lte('created_at', toStr),
    supabaseServer
      .from('workflow_runs')
      .select('id, repo_id, run_id, head_branch, conclusion, created_at, updated_at, html_url')
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
    head_branch: string | null;
    conclusion: string | null;
    created_at: string | null;
    updated_at: string | null;
    html_url: string | null;
  }[];

  const runKey = (repoId: string, runId: number) => `${repoId}:${runId}`;
  const runsMap = new Map<string, (typeof workflowRunsRows)[0]>();
  for (const wr of workflowRunsRows) {
    if (wr.run_id != null) runsMap.set(runKey(wr.repo_id, wr.run_id), wr);
  }

  const incidentsByRun = new Map<string, typeof incidentsRows>();
  for (const inc of incidentsRows) {
    const key = runKey(inc.repo_id, inc.workflow_run_id);
    if (!incidentsByRun.has(key)) incidentsByRun.set(key, []);
    incidentsByRun.get(key)!.push(inc);
  }

  const out: DeploymentWithIncidents[] = [];
  for (const [key, incs] of incidentsByRun) {
    const wr = runsMap.get(key);
    if (!wr || incs.length === 0) continue;

    const createdAt = wr.created_at ?? new Date().toISOString();
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
        url: ''
      };
    });

    out.push({
      id: wr.id,
      status: (wr.conclusion === 'success' ? 'SUCCESS' : 'FAILURE') as 'SUCCESS' | 'FAILURE',
      head_branch: wr.head_branch ?? '',
      event_actor: { username: '' },
      created_at: createdAt,
      updated_at: wr.updated_at ?? createdAt,
      conducted_at: createdAt,
      pr_count: 0,
      run_duration: 0,
      html_url: wr.html_url ?? '',
      repo_workflow_id: wr.id,
      incidents: incidentList
    });
  }

  return out;
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
    const deploymentsWithIncident =
      await getDeploymentsWithIncidentsFromSupabase(team_id, from_date, to_date);
    return res.send({
      deployments_with_incidents: deploymentsWithIncident,
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
