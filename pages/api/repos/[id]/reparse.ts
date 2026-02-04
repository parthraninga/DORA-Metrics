import * as yup from 'yup';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { parseAndStoreFetchResponse } from '@/lib/parse-fetch-response';
import { supabaseServer } from '@/lib/supabase';

const pathSchema = yup.object({
  id: yup.string().uuid().required(),
});

const endpoint = new Endpoint(pathSchema);

/**
 * POST: Re-parse the latest successful fetch_data for this repo.
 * Deletes existing pull_requests, workflow_runs, incidents for that fetch_data_id,
 * then re-runs the parser on raw_response. Idempotent per fetch_data.
 */
endpoint.handle.POST(nullSchema, async (req, res) => {
  const { id: repoId } = req.payload;

  const { data: row, error: fetchError } = await supabaseServer
    .from('fetch_data')
    .select('id, repo_id, state, raw_response')
    .eq('repo_id', repoId)
    .eq('state', 'success')
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    return res.status(500).send({ error: fetchError.message });
  }
  if (!row) {
    return res.status(404).send({
      error: 'No successful fetch_data found for this repo. Fetch data first.',
      repo_id: repoId,
    });
  }

  const fetchDataId = (row as { id: string }).id;
  const rawResponse = (row as { raw_response?: unknown }).raw_response;

  if (rawResponse == null) {
    return res.status(400).send({
      error: 'Latest fetch_data has no raw_response.',
      fetch_data_id: fetchDataId,
      repo_id: repoId,
    });
  }

  await supabaseServer.from('pull_requests').delete().eq('fetch_data_id', fetchDataId);
  await supabaseServer.from('incidents').delete().eq('fetch_data_id', fetchDataId);
  await supabaseServer.from('workflow_runs').delete().eq('fetch_data_id', fetchDataId);

  const result = await parseAndStoreFetchResponse(
    supabaseServer,
    rawResponse,
    repoId,
    fetchDataId
  );

  return res.status(200).send({
    message: 'Re-parsed latest fetch for repo',
    fetch_data_id: fetchDataId,
    repo_id: repoId,
    ...result,
  });
});

export default endpoint.serve();
