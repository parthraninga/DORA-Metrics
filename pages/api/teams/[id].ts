import * as yup from 'yup';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { supabaseServer } from '@/lib/supabase';

const pathSchema = yup.object({
  id: yup.string().uuid().required(),
});

const patchSchema = yup.object({
  name: yup.string().min(1).max(200).optional(),
  repo_ids: yup.array().of(yup.string().uuid()).optional(),
});

const endpoint = new Endpoint(pathSchema);

endpoint.handle.GET(nullSchema, async (req, res) => {
  const { id } = req.payload;

  const { data: team, error: teamError } = await supabaseServer
    .from('teams')
    .select('*')
    .eq('id', id)
    .single();

  if (teamError || !team) {
    return res.status(404).send({ error: 'Team not found' });
  }

  const { data: links } = await supabaseServer
    .from('team_repos')
    .select('repo_id')
    .eq('team_id', id);

  const repoIds = (links || []).map((r: { repo_id: string }) => r.repo_id);

  const { data: repos } = repoIds.length
    ? await supabaseServer.from('repos').select('*').in('id', repoIds)
    : { data: [] };

  return res.status(200).send({
    id: team.id,
    name: team.name,
    created_at: team.created_at,
    repo_ids: repoIds,
    repos: repos || [],
  });
});

endpoint.handle.PATCH(patchSchema, async (req, res) => {
  const { id, name, repo_ids } = req.payload;

  if (name !== undefined) {
    const { error: updateError } = await supabaseServer
      .from('teams')
      .update({ name })
      .eq('id', id);
    if (updateError) {
      return res.status(500).send({ error: updateError.message });
    }
  }

  if (repo_ids !== undefined) {
    const { error: delError } = await supabaseServer
      .from('team_repos')
      .delete()
      .eq('team_id', id);
    if (delError) {
      return res.status(500).send({ error: delError.message });
    }
    if (repo_ids.length > 0) {
      const { error: insertError } = await supabaseServer
        .from('team_repos')
        .insert(repo_ids.map((repo_id: string) => ({ team_id: id, repo_id })));
      if (insertError) {
        return res.status(500).send({ error: insertError.message });
      }
    }
  }

  const { data: team } = await supabaseServer
    .from('teams')
    .select('*')
    .eq('id', id)
    .single();

  const { data: links } = await supabaseServer
    .from('team_repos')
    .select('repo_id')
    .eq('team_id', id);

  const repoIds = (links || []).map((r: { repo_id: string }) => r.repo_id);

  return res.status(200).send({
    id: team.id,
    name: team.name,
    created_at: team.created_at,
    repo_ids: repoIds,
  });
});

endpoint.handle.DELETE(nullSchema, async (req, res) => {
  const { id } = req.payload;

  const { error: delReposError } = await supabaseServer
    .from('team_repos')
    .delete()
    .eq('team_id', id);
  if (delReposError) {
    return res.status(500).send({ error: delReposError.message });
  }

  const { error: delTeamError } = await supabaseServer
    .from('teams')
    .delete()
    .eq('id', id);
  if (delTeamError) {
    return res.status(500).send({ error: delTeamError.message });
  }

  return res.status(200).send({ status: 'OK' });
});

export default endpoint.serve();
