import * as yup from 'yup';
import axios from 'axios';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { parseAndStoreFetchResponse } from '@/lib/parse-fetch-response';
import {
  FETCH_CACHE_TTL,
  fetchCacheKey,
  getRedis,
} from '@/lib/redis';
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

const BITBUCKET_LAMBDA_FETCH_URL =
  process.env.BITBUCKET_LAMBDA_FETCH_URL ||
  'https://5hmjbahzmdlhp7fbi4qqu4iuoi0yaopc.lambda-url.ap-south-1.on.aws/';

const endpoint = new Endpoint(pathSchema);

endpoint.handle.POST(postSchema, async (req, res) => {
  const { id: repoId, days_prior } = req.payload;

  const { data: repo, error: repoError } = await supabaseServer
    .from('repos')
    .select('id, token_id, org_name, repo_name, cfr_type, workflow_file, last_fetched_at')
    .eq('id', repoId)
    .single();

  if (repoError || !repo) {
    return res.status(404).send({ error: 'Repo not found' });
  }

  const { data: tokenRow } = await supabaseServer
    .from('tokens')
    .select('token, type, email')
    .eq('id', (repo as { token_id: string }).token_id)
    .single();

  const token = (tokenRow as { token?: string } | null)?.token?.trim();
  if (!token) {
    return res.status(400).send({ error: 'Repo token not found or invalid' });
  }

  const tokenType = ((tokenRow as { type?: string } | null)?.type ?? '').toLowerCase();
  const fetchUrl = tokenType === 'bitbucket' ? BITBUCKET_LAMBDA_FETCH_URL : LAMBDA_FETCH_URL;

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
  const reposPayload = [
    {
      org_name: repoRow.org_name,
      repo_name: repoRow.repo_name,
      deployment_type: 'PR_MERGE' as const,
    },
  ];

  let body: Record<string, unknown>;
  if (tokenType === 'bitbucket') {
    const email = (tokenRow as { email?: string | null } | null)?.email?.trim();
    if (!email) {
      return res.status(400).send({ error: 'Bitbucket token is missing email. Set it in Integrations.' });
    }
    body = {
      email,
      bitbucket_pat_token: token,
      repos: reposPayload,
      from_time: fromTime,
      to_time: toTime,
      type,
      ...(type === 2 && repoRow.workflow_file ? { workflow_file: repoRow.workflow_file } : {}),
    };
  } else {
    body = {
      github_pat_token: token,
      repos: reposPayload,
      from_time: fromTime,
      to_time: toTime,
      type,
      ...(type === 2 && repoRow.workflow_file ? { workflow_file: repoRow.workflow_file } : {}),
    };
  }

  const provider = tokenType === 'bitbucket' ? 'Bitbucket' : 'GitHub';
  const bodyForLog = {
    ...body,
    ...(body.github_pat_token ? { github_pat_token: '***MASKED***' } : {}),
    ...(body.bitbucket_pat_token ? { bitbucket_pat_token: '***MASKED***' } : {}),
  };
  console.log('========== FETCH: API & INPUT ==========');
  console.log('Which API:', fetchUrl);
  console.log('Token type (DB):', tokenType || 'github');
  console.log('Input (body, tokens masked):', JSON.stringify(bodyForLog, null, 2));
  console.log('========================================');
  console.log(`🚀 Fetch Request Details: Using ${provider} Lambda`, {
    repoId,
    repo: `${repoRow.org_name}/${repoRow.repo_name}`,
    fromTime,
    toTime,
    type: type === 2 ? 'CI-CD' : 'PR_MERGE',
    workflow: repoRow.workflow_file || 'N/A',
    tokenType: tokenType || 'github',
    lambdaUrl: fetchUrl
  });

  // Redis: serve from cache when available
  const redis = getRedis();
  const cacheKey = fetchCacheKey(repoId, fromTime, toTime);
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        let rawResponse: unknown;
        try {
          rawResponse = JSON.parse(cached);
        } catch {
          // invalid cache, fall through to Lambda
        }
        if (typeof rawResponse !== 'undefined') {
          const { data: fd, error: insertErr } = await supabaseServer
            .from('fetch_data')
            .insert({
              repo_id: repoId,
              state: 'success',
              raw_response: rawResponse,
            })
            .select('id')
            .single();
          if (!insertErr && fd) {
            const fetchDataId = (fd as { id: string }).id;
            await parseAndStoreFetchResponse(
              supabaseServer,
              rawResponse,
              repoId,
              fetchDataId
            );
            await supabaseServer
              .from('repos')
              .update({ last_fetched_at: toTime })
              .eq('id', repoId);
            return res.status(202).send({
              message: 'Fetch completed (from cache)',
              repo_id: repoId,
              provider: tokenType === 'bitbucket' ? 'bitbucket' : 'github',
            });
          }
        }
      }
    } catch {
      // Redis error: fall through to Lambda
    }
  }

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
      console.log('📡 Calling Lambda now:', fetchUrl);

      let response;
      let rawResponse: unknown;
      
      const headers = { 'Content-Type': 'application/json' };
      try {
        // Use axios for better error handling and SSL support
        // No timeout - let Lambda take as long as it needs
        response = await axios.post(fetchUrl, body, {
          headers,
          timeout: 0, // No timeout - wait indefinitely
          validateStatus: () => true, // Don't throw on any status code
        });
        
        console.log('📥 Lambda Response Status:', response.status, response.statusText);
        console.log('📄 Lambda Response Body (first 500 chars):', JSON.stringify(response.data).substring(0, 500));
        
        rawResponse = response.data;
        
      } catch (fetchErr: any) {
        console.error('❌ Axios Error Details:', {
          name: fetchErr?.name,
          message: fetchErr?.message,
          code: fetchErr?.code,
          errno: fetchErr?.errno,
          syscall: fetchErr?.syscall,
          hostname: fetchErr?.hostname,
          config: {
            url: fetchErr?.config?.url,
            method: fetchErr?.config?.method,
            timeout: fetchErr?.config?.timeout
          },
          response: fetchErr?.response ? {
            status: fetchErr?.response?.status,
            data: JSON.stringify(fetchErr?.response?.data).substring(0, 200)
          } : null
        });
        
        const errorMsg = fetchErr?.response?.data 
          ? JSON.stringify(fetchErr.response.data)
          : `${fetchErr?.message || 'Unknown error'} (code: ${fetchErr?.code || 'N/A'})`;
        
        throw new Error(`Lambda request failed: ${errorMsg}`);
      }
      
      const state = (response.status >= 200 && response.status < 300) ? 'success' : 'failure';
      
      console.log(`${state === 'success' ? '✅' : '❌'} Fetch ${state}:`, {
        status: response.status,
        repoId,
        fetchDataId
      });

      await supabaseServer
        .from('fetch_data')
        .update({ state, raw_response: rawResponse })
        .eq('id', fetchDataId);

      if (state === 'success') {
        try {
          const r = getRedis();
          if (r) {
            await r.set(
              fetchCacheKey(repoId, fromTime, toTime),
              typeof rawResponse === 'string'
                ? rawResponse
                : JSON.stringify(rawResponse),
              'EX',
              FETCH_CACHE_TTL
            );
          }
        } catch (cacheErr) {
          console.error('⚠️ Redis cache error:', cacheErr);
        }
        
        await supabaseServer
          .from('repos')
          .update({ last_fetched_at: toTime })
          .eq('id', repoId);
      }
    } catch (err) {
      console.error('❌ Fetch Error:', err);
      console.error('Error details:', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        repoId,
        fetchDataId
      });
      
      await supabaseServer
        .from('fetch_data')
        .update({
          state: 'failure',
          raw_response: { 
            error: String(err),
            message: err instanceof Error ? err.message : String(err),
            timestamp: new Date().toISOString()
          },
        })
        .eq('id', fetchDataId);
    }
  })();

  return res.status(202).send({
    message: 'Fetch started',
    repo_id: repoId,
    provider: tokenType === 'bitbucket' ? 'bitbucket' : 'github',
  });
});

export default endpoint.serve();
