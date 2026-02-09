import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseServer } from '@/lib/supabase';

/**
 * Diagnostic endpoint to check incidents and workflow runs
 * Usage: GET /api/debug/check-incidents?team_id=xxx&branch=dev
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { team_id, branch = 'dev' } = req.query;

  if (!team_id || typeof team_id !== 'string') {
    return res.status(400).json({ error: 'team_id required' });
  }

  try {
    // Get team's repos
    const { data: teamRepos } = await supabaseServer
      .from('team_repos')
      .select('repo_id')
      .eq('team_id', team_id);

    const repoIds = (teamRepos || []).map((tr: any) => tr.repo_id);

    if (repoIds.length === 0) {
      return res.json({ error: 'No repos found for team' });
    }

    // Get repos with branch info
    const { data: repos } = await supabaseServer
      .from('repos')
      .select('id, repo_name, dev_branch, stage_branch, prod_branch')
      .in('id', repoIds);

    // Get workflow runs on specified branch
    const { data: workflowRuns } = await supabaseServer
      .from('workflow_runs')
      .select('id, repo_id, run_id, name, head_branch, conclusion, status, created_at')
      .in('repo_id', repoIds)
      .order('created_at', { ascending: false })
      .limit(50);

    // Filter by branch
    const reposMap = new Map((repos || []).map((r: any) => [r.id, r]));
    const branchKey = branch === 'stage' ? 'stage_branch' : branch === 'dev' ? 'dev_branch' : 'prod_branch';
    
    const relevantRuns = (workflowRuns || []).filter((wr: any) => {
      const repo = reposMap.get(wr.repo_id);
      if (!repo) return false;
      const allowedBranch = repo[branchKey];
      return allowedBranch && wr.head_branch === allowedBranch;
    });

    // Get incidents
    const runIds = relevantRuns.map((wr: any) => wr.run_id);
    const { data: incidents } = await supabaseServer
      .from('incidents')
      .select('id, workflow_run_id, creation_date, resolved_date')
      .in('repo_id', repoIds)
      .in('workflow_run_id', runIds);

    // Get all incidents for comparison
    const { data: allIncidents } = await supabaseServer
      .from('incidents')
      .select('id, repo_id, workflow_run_id, creation_date, resolved_date')
      .in('repo_id', repoIds)
      .order('creation_date', { ascending: false })
      .limit(50);

    // Find failed runs without incidents
    const incidentRunIds = new Set((incidents || []).map((i: any) => i.workflow_run_id));
    const failedRunsWithoutIncidents = relevantRuns.filter(
      (wr: any) => wr.conclusion === 'failure' && !incidentRunIds.has(wr.run_id)
    );

    return res.json({
      summary: {
        team_id,
        branch_mode: branch,
        repos_count: repos?.length || 0,
        total_workflow_runs: workflowRuns?.length || 0,
        relevant_workflow_runs: relevantRuns.length,
        failed_runs_on_branch: relevantRuns.filter((wr: any) => wr.conclusion === 'failure').length,
        incidents_for_branch: incidents?.length || 0,
        total_incidents_all_branches: allIncidents?.length || 0,
        failed_runs_without_incidents: failedRunsWithoutIncidents.length
      },
      repos_config: repos?.map((r: any) => ({
        id: r.id,
        name: r.repo_name,
        dev_branch: r.dev_branch,
        stage_branch: r.stage_branch,
        prod_branch: r.prod_branch
      })),
      recent_workflow_runs_on_branch: relevantRuns.slice(0, 10).map((wr: any) => ({
        run_id: wr.run_id,
        name: wr.name,
        head_branch: wr.head_branch,
        conclusion: wr.conclusion,
        created_at: wr.created_at,
        has_incident: incidentRunIds.has(wr.run_id)
      })),
      failed_runs_without_incidents: failedRunsWithoutIncidents.slice(0, 10).map((wr: any) => ({
        run_id: wr.run_id,
        name: wr.name,
        head_branch: wr.head_branch,
        conclusion: wr.conclusion,
        created_at: wr.created_at
      })),
      all_incidents: allIncidents?.slice(0, 10).map((i: any) => ({
        id: i.id,
        workflow_run_id: i.workflow_run_id,
        creation_date: i.creation_date,
        resolved_date: i.resolved_date
      }))
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
