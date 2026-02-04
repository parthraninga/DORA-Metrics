import * as yup from 'yup';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { supabaseServer } from '@/lib/supabase';

const postSchema = yup.object({
  name: yup.string().required().min(1).max(200),
  repo_ids: yup.array().of(yup.string().uuid()).optional().default([]),
});

const endpoint = new Endpoint(nullSchema);

endpoint.handle.GET(nullSchema, async (_req, res) => {
  const { data: teams, error: teamsError } = await supabaseServer
    .from('teams')
    .select('*')
    .order('created_at', { ascending: false });

  if (teamsError) {
    return res.status(500).send({ error: teamsError.message });
  }

  const { data: teamReposRows } = await supabaseServer
    .from('team_repos')
    .select('team_id, repo_id');

  const repoIdsByTeam = (teamReposRows || []).reduce(
    (acc: Record<string, string[]>, row: { team_id: string; repo_id: string }) => {
      if (!acc[row.team_id]) acc[row.team_id] = [];
      acc[row.team_id].push(row.repo_id);
      return acc;
    },
    {}
  );

  const allRepoIds = [...new Set((teamReposRows || []).map((r: { repo_id: string }) => r.repo_id))];
  const { data: reposRows } = allRepoIds.length
    ? await supabaseServer.from('Repos').select('id, repo_name, org_name, last_fetched_at').in('id', allRepoIds)
    : { data: [] };
  const reposById = (reposRows || []).reduce(
    (acc: Record<string, { id: string; repo_name: string; org_name: string; last_fetched_at?: string | null }>, r: { id: string; repo_name: string; org_name: string; last_fetched_at?: string | null }) => {
      acc[r.id] = r;
      return acc;
    },
    {}
  );

  const list = (teams || []).map((t: { id: string; name: string; created_at: string }) => {
    const repoIds = repoIdsByTeam[t.id] || [];
    const repos = repoIds.map((rid: string) => reposById[rid]).filter(Boolean);
    const lastFetchedDates = repos
      .map((r) => r.last_fetched_at)
      .filter(Boolean) as string[];
    const last_fetched_at = lastFetchedDates.length
      ? lastFetchedDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
      : null;
    return {
      id: t.id,
      name: t.name,
      created_at: t.created_at,
      repo_ids: repoIds,
      repos,
      last_fetched_at,
    };
  });

  return res.status(200).send(list);
});

endpoint.handle.POST(postSchema, async (req, res) => {
  const { name, repo_ids } = req.payload;

  const { data: team, error: teamError } = await supabaseServer
    .from('teams')
    .insert({ name })
    .select()
    .single();

  if (teamError || !team) {
    return res.status(500).send({ error: teamError?.message || 'Failed to create team' });
  }

  if (Array.isArray(repo_ids) && repo_ids.length > 0) {
    const { error: linkError } = await supabaseServer
      .from('team_repos')
      .insert(repo_ids.map((repo_id: string) => ({ team_id: team.id, repo_id })));

    if (linkError) {
      return res.status(500).send({ error: linkError.message });
    }
  }

  return res.status(201).send({
    id: team.id,
    name: team.name,
    created_at: team.created_at,
    repo_ids: repo_ids || [],
  });
});

export default endpoint.serve();
