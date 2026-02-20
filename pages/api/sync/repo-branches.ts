import * as yup from 'yup';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { supabaseServer } from '@/lib/supabase';

const getSchema = yup.object({
  token_id: yup.string().uuid().required(),
  org_name: yup.string().required().min(1),
  repo_name: yup.string().required().min(1),
});

const endpoint = new Endpoint(nullSchema);

function bitbucketAuth(email: string, token: string): string {
  const encoded = Buffer.from(`${email}:${token}`, 'utf8').toString('base64');
  return `Basic ${encoded}`;
}

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
    const email = (tokenRow.email as string)?.trim();
    if (!email) {
      return res.status(400).send({ error: 'Bitbucket token is missing email' });
    }
    const auth = bitbucketAuth(email, token);
    const workspace = encodeURIComponent(org_name);
    const repoSlug = encodeURIComponent(repo_name);
    const bbRes = await fetch(
      `https://api.bitbucket.org/2.0/repositories/${workspace}/${repoSlug}/refs/branches?pagelen=100`,
      { headers: { Authorization: auth, Accept: 'application/json' } }
    );
    if (!bbRes.ok) {
      const err = (await bbRes.text()) || 'Bitbucket API error';
      return res.status(bbRes.status).send({ error: err });
    }
    const data = await bbRes.json();
    const values = Array.isArray(data.values) ? data.values : [];
    const names = values
      .map((b: { name?: string }) => b.name)
      .filter((n): n is string => typeof n === 'string');
    return res.status(200).send(names);
  }

  if (type !== 'github') {
    return res.status(400).send({ error: 'Only GitHub and Bitbucket tokens are supported for listing branches' });
  }

  const owner = encodeURIComponent(org_name);
  const repo = encodeURIComponent(repo_name);
  const url = `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`;

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
  const branches = Array.isArray(data) ? data : [];
  const names = branches
    .map((b: { name?: string }) => b.name)
    .filter((n): n is string => typeof n === 'string');
  return res.status(200).send(names);
});

export default endpoint.serve();
