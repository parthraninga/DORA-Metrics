import * as yup from 'yup';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { supabaseServer } from '@/lib/supabase';

const getSchema = yup.object({
  token_id: yup.string().uuid().required(),
});

const endpoint = new Endpoint(nullSchema);

endpoint.handle.GET(getSchema, async (req, res) => {
  const { token_id } = req.payload;

  const { data: tokenRow, error: tokenError } = await supabaseServer
    .from('tokens')
    .select('token, type')
    .eq('id', token_id)
    .single();

  if (tokenError || !tokenRow?.token) {
    return res.status(400).send({ error: 'Token not found' });
  }
  if (tokenRow.type !== 'github') {
    return res.status(400).send({ error: 'Only GitHub tokens are supported' });
  }

  const token = (tokenRow.token as string).trim();
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `token ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const ghRes = await fetch('https://api.github.com/user/orgs?per_page=100', {
    headers,
  });

  if (!ghRes.ok) {
    const body = await ghRes.json().catch(() => ({}));
    const err =
      typeof body === 'object' && body !== null && 'message' in body
        ? (body as { message: string }).message
        : 'GitHub API error';
    return res.status(ghRes.status).send({ error: err });
  }

  const body: unknown = await ghRes.json();
  const orgs = Array.isArray(body) ? body : [];
  const list = orgs.map((o: { id?: number; login?: string; avatar_url?: string }) => ({
    id: o.id ?? 0,
    login: o.login ?? '',
    avatar_url: o.avatar_url ?? '',
  })).filter((o) => o.login);
  return res.status(200).send(list);
});

export default endpoint.serve();
