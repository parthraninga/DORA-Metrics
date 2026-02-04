import * as yup from 'yup';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { parseAndStoreFetchResponse } from '@/lib/parse-fetch-response';
import { supabaseServer } from '@/lib/supabase';

const pathSchema = yup.object({
  id: yup.string().uuid().required(),
});

const postSchema = yup.object({
  days_prior: yup.number().optional().default(90),
});

const LAMBDA_FETCH_URL =
  process.env.LAMBDA_FETCH_URL ||
  'https://rorxix2ixb5u74brkfubsv7rw40asact.lambda-url.ap-south-1.on.aws/';

const endpoint = new Endpoint(pathSchema);

endpoint.handle.POST(postSchema, async (req, res) => {
  const { id: repoId, days_prior } = req.payload;

  const { data: repo, error: repoError } = await supabaseServer
    .from('Repos')
    .select('id, token_id, org_name, repo_name, cfr_type, workflow_file, last_fetched_at')
    .eq('id', repoId)
    .single();

  if (repoError || !repo) {
    return res.status(404).send({ error: 'Repo not found' });
  }

  const { data: tokenRow } = await supabaseServer
    .from('Tokens')
    .select('token')
    .eq('id', (repo as { token_id: string }).token_id)
    .single();

  const token = (tokenRow as { token?: string } | null)?.token?.trim();
  if (!token) {
    return res.status(400).send({ error: 'Repo token not found or invalid' });
  }

  const repoRow = repo as {
    id: string;
    token_id: string;
    org_name: string;
    repo_name: string;
    cfr_type: string;
    workflow_file: string | null;
    last_fetched_at: string | null;
  };

  const now = new Date();
  const toTime = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const fromTime = repoRow.last_fetched_at
    ? new Date(repoRow.last_fetched_at).toISOString().replace(/\.\d{3}Z$/, 'Z')
    : new Date(now.getTime() - (days_prior ?? 90) * 24 * 60 * 60 * 1000)
        .toISOString()
        .replace(/\.\d{3}Z$/, 'Z');

  const type = repoRow.cfr_type === 'CI-CD' ? 2 : 1;
  const body = {
    github_pat_token: token,
    repos: [
      {
        org_name: repoRow.org_name,
        repo_name: repoRow.repo_name,
        deployment_type: 'PR_MERGE',
      },
    ],
    from_time: fromTime,
    to_time: toTime,
    type,
    ...(type === 2 && repoRow.workflow_file
      ? { workflow_file: repoRow.workflow_file }
      : {}),
  };

  const { data: fd, error: insertErr } = await supabaseServer
    .from('fetch_data')
    .insert({
      repo_id: repoId,
      state: 'processing',
    })
    .select('id')
    .single();

  if (insertErr || !fd) {
    return res.status(500).send({ error: 'Failed to create fetch_data entry' });
  }

  const fetchDataId = (fd as { id: string }).id;

  (async () => {
    try {
      const response = await fetch(LAMBDA_FETCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const raw = await response.text();
      let rawResponse: unknown = raw;
      try {
        rawResponse = JSON.parse(raw);
      } catch {
        // keep as string
      }
      const state = response.ok ? 'success' : 'failure';

      await supabaseServer
        .from('fetch_data')
        .update({ state, raw_response: rawResponse })
        .eq('id', fetchDataId);

      if (state === 'success') {
        await parseAndStoreFetchResponse(
          supabaseServer,
          rawResponse,
          repoId,
          fetchDataId
        );
        await supabaseServer
          .from('Repos')
          .update({ last_fetched_at: toTime })
          .eq('id', repoId);
      }
    } catch (err) {
      await supabaseServer
        .from('fetch_data')
        .update({
          state: 'failure',
          raw_response: { error: String(err) },
        })
        .eq('id', fetchDataId);
    }
  })();

  return res.status(202).send({ message: 'Fetch started', repo_id: repoId });
});

export default endpoint.serve();
