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
  const { id: teamId, days_prior } = req.payload;

  const { data: links } = await supabaseServer
    .from('team_repos')
    .select('repo_id')
    .eq('team_id', teamId);

  const repoIds = (links || []).map((r: { repo_id: string }) => r.repo_id);
  if (repoIds.length === 0) {
    return res.status(400).send({ error: 'Team has no repos' });
  }

  const { data: repos } = await supabaseServer
    .from('repos')
    .select('id, token_id, org_name, repo_name, cfr_type, workflow_file, last_fetched_at')
    .in('id', repoIds);

  if (!repos?.length) {
    return res.status(400).send({ error: 'Repos not found' });
  }

  const now = new Date();
  const toTime = now.toISOString().replace(/\.\d{3}Z$/, 'Z');

  for (const repo of repos as Array<{
    id: string;
    token_id: string;
    org_name: string;
    repo_name: string;
    cfr_type: string;
    workflow_file: string | null;
    last_fetched_at: string | null;
  }>) {
    const { data: tokenRow } = await supabaseServer
      .from('tokens')
      .select('token')
      .eq('id', repo.token_id)
      .single();

    const token = (tokenRow as { token?: string } | null)?.token?.trim();
    if (!token) {
      continue;
    }

    const fromTime = repo.last_fetched_at
      ? new Date(repo.last_fetched_at).toISOString().replace(/\.\d{3}Z$/, 'Z')
      : new Date(now.getTime() - days_prior * 24 * 60 * 60 * 1000)
          .toISOString()
          .replace(/\.\d{3}Z$/, 'Z');

    const type = repo.cfr_type === 'CI-CD' ? 2 : 1;
    const body = {
      github_pat_token: token,
      repos: [
        {
          org_name: repo.org_name,
          repo_name: repo.repo_name,
          deployment_type: 'PR_MERGE',
        },
      ],
      from_time: fromTime,
      to_time: toTime,
      type,
      ...(type === 2 && repo.workflow_file
        ? { workflow_file: repo.workflow_file }
        : {}),
    };

    const { data: fd, error: insertErr } = await supabaseServer
      .from('fetch_data')
      .insert({
        repo_id: repo.id,
        state: 'processing',
      })
      .select('id')
      .single();

    if (insertErr || !fd) {
      continue;
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
            repo.id,
            fetchDataId
          );
          await supabaseServer
            .from('repos')
            .update({ last_fetched_at: toTime })
            .eq('id', repo.id);
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
  }

  return res.status(202).send({ message: 'Fetch started', team_id: teamId });
});

export default endpoint.serve();
