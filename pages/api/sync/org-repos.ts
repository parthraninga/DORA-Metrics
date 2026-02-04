import * as yup from 'yup';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { supabaseServer } from '@/lib/supabase';

const getSchema = yup.object({
  token_id: yup.string().uuid().required(),
  org_name: yup.string().required().min(1),
});

const endpoint = new Endpoint(nullSchema);

endpoint.handle.GET(getSchema, async (req, res) => {
  const { token_id, org_name } = req.payload;

  const { data: tokenRow, error: tokenError } = await supabaseServer
    .from('Tokens')
    .select('token, type')
    .eq('id', token_id)
    .single();

  if (tokenError || !tokenRow?.token) {
    return res.status(400).send({ error: 'Token not found' });
  }
  if (tokenRow.type !== 'github') {
    return res.status(400).send({ error: 'Only GitHub tokens are supported for listing repos' });
  }

  const token = (tokenRow.token as string).trim();
  const encoded = encodeURIComponent(org_name);
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `token ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // Try orgs endpoint first (for GitHub organizations)
  let ghRes = await fetch(
    `https://api.github.com/orgs/${encoded}/repos?per_page=100&sort=full_name`,
    { headers }
  );
  let body: unknown = await ghRes.json();

  // If 404, "org" might be a user account — try users endpoint
  if (ghRes.status === 404) {
    ghRes = await fetch(
      `https://api.github.com/users/${encoded}/repos?per_page=100&sort=full_name`,
      { headers }
    );
    body = await ghRes.json();
  }

  if (!ghRes.ok) {
    const err = typeof body === 'object' && body !== null && 'message' in body
      ? (body as { message: string }).message
      : typeof body === 'string'
        ? body
        : 'GitHub API error';
    return res.status(ghRes.status).send({ error: err });
  }

  const repos = Array.isArray(body) ? body : [];
  const list = repos
    .map((r: { id?: number; name?: string; full_name?: string }) => ({
      id: r.id ?? 0,
      name: r.name ?? '',
      full_name: r.full_name ?? r.name ?? '',
    }))
    .filter((r) => r.name);
  return res.status(200).send(list);
});

export default endpoint.serve();
