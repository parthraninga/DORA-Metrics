import * as yup from 'yup';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { supabaseServer } from '@/lib/supabase';

const pathSchema = yup.object({
  id: yup.string().uuid().required(),
});

const LAMBDA_FETCH_URL =
  process.env.LAMBDA_FETCH_URL ||
  'https://rorxix2ixb5u74brkfubsv7rw40asact.lambda-url.ap-south-1.on.aws/';

const endpoint = new Endpoint(pathSchema);

endpoint.handle.GET(nullSchema, async (req, res) => {
  const { id: repoId } = req.payload;

  console.log('🔍 Debug request for repo:', repoId);

  const { data: repo, error: repoError } = await supabaseServer
    .from('repos')
    .select('id, token_id, org_name, repo_name, cfr_type, workflow_file, last_fetched_at, dev_branch')
    .eq('id', repoId)
    .single();

  if (repoError || !repo) {
    return res.status(404).send({ error: 'Repo not found', details: repoError });
  }

  const repoRow = repo as {
    id: string;
    token_id: string;
    org_name: string;
    repo_name: string;
    cfr_type: string;
    workflow_file: string | null;
    last_fetched_at: string | null;
    dev_branch: string;
  };

  const { data: tokenRow, error: tokenError } = await supabaseServer
    .from('tokens')
    .select('id, name, type, token')
    .eq('id', repoRow.token_id)
    .single();

  const tokenExists = !!tokenRow;
  const tokenValid = tokenExists && !!(tokenRow as any)?.token?.trim();

  // Test Lambda connectivity
  let lambdaStatus = 'unknown';
  let lambdaError = null;
  try {
    const testResponse = await fetch(LAMBDA_FETCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true }),
    });
    lambdaStatus = `${testResponse.status} ${testResponse.statusText}`;
  } catch (err) {
    lambdaError = String(err);
    lambdaStatus = 'unreachable';
  }

  const diagnostics = {
    repo: {
      id: repoRow.id,
      name: `${repoRow.org_name}/${repoRow.repo_name}`,
      org_name: repoRow.org_name,
      repo_name: repoRow.repo_name,
      cfr_type: repoRow.cfr_type,
      workflow_file: repoRow.workflow_file,
      dev_branch: repoRow.dev_branch,
      last_fetched_at: repoRow.last_fetched_at,
    },
    token: {
      exists: tokenExists,
      valid: tokenValid,
      id: tokenRow ? (tokenRow as any).id : null,
      name: tokenRow ? (tokenRow as any).name : null,
      type: tokenRow ? (tokenRow as any).type : null,
      masked: tokenRow && tokenValid 
        ? `${(tokenRow as any).token.substring(0, 8)}...${(tokenRow as any).token.substring((tokenRow as any).token.length - 4)}`
        : 'N/A',
      error: tokenError?.message || null,
    },
    lambda: {
      url: LAMBDA_FETCH_URL,
      status: lambdaStatus,
      error: lambdaError,
    },
    validation: {
      has_token: tokenExists,
      has_valid_token: tokenValid,
      has_org_name: !!repoRow.org_name,
      has_repo_name: !!repoRow.repo_name,
      has_dev_branch: !!repoRow.dev_branch,
      ready_to_fetch: tokenValid && !!repoRow.org_name && !!repoRow.repo_name,
    },
  };

  console.log('📊 Diagnostics result:', diagnostics);

  return res.status(200).json(diagnostics);
});

export default endpoint.serve();
