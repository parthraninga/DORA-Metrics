import * as yup from 'yup';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { supabaseServer } from '@/lib/supabase';

const getSchema = yup.object({
  token_id: yup.string().uuid().required(),
});

const endpoint = new Endpoint(nullSchema);

function bitbucketAuth(email: string, token: string): string {
  const encoded = Buffer.from(`${email}:${token}`, 'utf8').toString('base64');
  return `Basic ${encoded}`;
}

endpoint.handle.GET(getSchema, async (req, res) => {
  const { token_id } = req.payload;

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
    const email = (tokenRow.email as string)?.trim();
    if (!email) {
      return res.status(400).send({ error: 'Bitbucket token is missing email' });
    }
    const auth = bitbucketAuth(email, token);
    const bbRes = await fetch('https://api.bitbucket.org/2.0/workspaces?pagelen=100', {
      headers: { Authorization: auth, Accept: 'application/json' },
    });
    if (!bbRes.ok) {
      const errBody = await bbRes.json().catch(() => ({}));
      const err =
        typeof errBody === 'object' && errBody !== null && 'error' in errBody
          ? (errBody as { error?: { message?: string } }).error?.message
          : await bbRes.text() || 'Bitbucket API error';
      return res.status(bbRes.status).send({ error: String(err) });
    }
    const body = await bbRes.json();
    const values = Array.isArray(body.values) ? body.values : [];
    const list = values.map(
      (w: { uuid?: string; slug?: string; name?: string; links?: { avatar?: { href?: string } } }, i: number) => ({
        id: i,
        login: (w.slug ?? w.name ?? '').toString(),
        avatar_url: (typeof w.links?.avatar?.href === 'string' ? w.links.avatar.href : '') as string,
      })
    ).filter((o: { login: string }) => o.login);
    return res.status(200).send(list);
  }

  if (type !== 'github') {
    return res.status(400).send({ error: 'Only GitHub and Bitbucket tokens are supported' });
  }

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
