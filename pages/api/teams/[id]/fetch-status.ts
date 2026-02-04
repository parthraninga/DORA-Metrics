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
    return res.status(200).send({ items: [] });
  }

  const { data: rows } = await supabaseServer
    .from('fetch_data')
    .select('id, repo_id, fetched_at, state, raw_response')
    .in('repo_id', repoIds)
    .order('fetched_at', { ascending: false })
    .limit(100);

  return res.status(200).send({ items: rows || [] });
});

export default endpoint.serve();
