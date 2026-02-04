import * as yup from 'yup';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { supabaseServer } from '@/lib/supabase';

const pathSchema = yup.object({
  id: yup.string().uuid().required(),
});

const endpoint = new Endpoint(pathSchema);

endpoint.handle.GET(nullSchema, async (req, res) => {
  const { id: teamId } = req.payload;

  const { data: links } = await supabaseServer
    .from('team_repos')
    .select('repo_id')
    .eq('team_id', teamId);

  const repoIds = (links || []).map((r: { repo_id: string }) => r.repo_id);
  if (repoIds.length === 0) {
    return res.status(200).send({ last_fetched_at: null });
  }

  const { data: repos } = await supabaseServer
    .from('repos')
    .select('last_fetched_at')
    .in('id', repoIds);

  const dates = (repos || [])
    .map((r: { last_fetched_at?: string | null }) => r.last_fetched_at)
    .filter(Boolean) as string[];
  const lastFetchedAt = dates.length
    ? dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
    : null;

  return res.status(200).send({ last_fetched_at: lastFetchedAt });
});

export default endpoint.serve();
