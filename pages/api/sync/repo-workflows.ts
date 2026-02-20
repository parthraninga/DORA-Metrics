import * as yup from 'yup';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { supabaseServer } from '@/lib/supabase';

const getSchema = yup.object({
  token_id: yup.string().uuid().required(),
  org_name: yup.string().required().min(1),
  repo_name: yup.string().required().min(1),
});

const endpoint = new Endpoint(nullSchema);

endpoint.handle.GET(getSchema, async (req, res) => {
  const { token_id, org_name, repo_name } = req.payload;

  const { data: tokenRow, error: tokenError } = await supabaseServer
    .from('tokens')
    .select('token, type, email')
    .eq('id', token_id)
    .single();

  if (tokenError || !tokenRow?.token) {
    return res.status(400).send({ error: 'Token not found' });
  }

  const token = (tokenRow.token as string).trim();
  const type = tokenRow.type as string;

  if (type === 'bitbucket') {
    // Bitbucket Pipelines use a single config file: bitbucket-pipelines.yml
    const list = [
      { id: 0, name: 'Bitbucket Pipelines', path: 'bitbucket-pipelines.yml', state: 'active' },
    ];
    return res.status(200).send(list);
  }

  if (type !== 'github') {
    return res.status(400).send({ error: 'Only GitHub and Bitbucket tokens are supported for workflows' });
  }

  const owner = encodeURIComponent(org_name);
  const repo = encodeURIComponent(repo_name);
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows?per_page=100`;

  const ghRes = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `token ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!ghRes.ok) {
    const err = await ghRes.text();
    return res.status(ghRes.status).send({ error: err || 'GitHub API error' });
  }

  const data = await ghRes.json();
  const workflows = Array.isArray(data?.workflows) ? data.workflows : [];
  const list = workflows
    .map((w: { id?: number; name?: string; path?: string; state?: string }) => ({
      id: w.id ?? 0,
      name: w.name ?? '',
      path: w.path ?? '',
      state: w.state ?? '',
    }))
    .filter((w) => w.path);
  return res.status(200).send(list);
});

export default endpoint.serve();
