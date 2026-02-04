import type { NextApiRequest, NextApiResponse } from 'next';
import { parseAndStoreFetchResponse } from '@/lib/parse-fetch-response';
import { supabaseServer } from '@/lib/supabase';

/**
 * POST: Re-parse the latest fetch_data row's raw_response and insert into
 * pull_requests, workflow_runs, incidents. Deletes existing parsed rows for
 * that fetch_data first so re-parse is idempotent.
 * Remove or restrict this route in production.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { data: row, error: fetchError } = await supabaseServer
      .from('fetch_data')
      .select('id, repo_id, state, raw_response')
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'No fetch_data row found' });
    }

    const fetchDataId = (row as { id: string }).id;
    const repoId = (row as { repo_id: string }).repo_id;
    const state = (row as { state: string }).state;
    const rawResponse = (row as { raw_response?: unknown }).raw_response;

    if (state !== 'success') {
      return res.status(400).json({
        error: `Latest fetch_data state is "${state}", not "success". Re-parse only works for successful fetches.`,
        fetch_data_id: fetchDataId,
      });
    }
    if (rawResponse == null) {
      return res.status(400).json({
        error: 'Latest fetch_data has no raw_response.',
        fetch_data_id: fetchDataId,
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

    return res.status(200).json({
      message: 'Re-parsed latest fetch',
      fetch_data_id: fetchDataId,
      repo_id: repoId,
      ...result,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e) });
  }
}
