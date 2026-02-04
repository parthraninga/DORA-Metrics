import * as yup from 'yup';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { supabaseServer } from '@/lib/supabase';

const getSchema = yup.object({});

const postSchema = yup.object({
  repo_name: yup.string().required().min(1).max(500),
  org_name: yup.string().required().min(1).max(500),
  dev_branch: yup.string().required().min(1).max(500),
  prod_branch: yup.string().max(500).optional().nullable(),
  stage_branch: yup.string().max(500).optional().nullable(),
  cfr_type: yup.string().oneOf(['CI-CD', 'PR_MERGE']).required(),
  token_id: yup.string().uuid().required(),
  workflow_file: yup.string().max(500).optional().nullable(),
  pr_merge_config: yup.object().optional().nullable(),
});

const endpoint = new Endpoint(nullSchema);

endpoint.handle.GET(getSchema, async (_req, res) => {
  const { data, error } = await supabaseServer
    .from('Repos')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).send({ error: error.message });
  }
  return res.status(200).send(data || []);
});

endpoint.handle.POST(postSchema, async (req, res) => {
  const {
    repo_name,
    org_name,
    dev_branch,
    prod_branch,
    stage_branch,
    cfr_type,
    token_id,
    workflow_file,
    pr_merge_config,
  } = req.payload;

  const insert: Record<string, unknown> = {
    repo_name,
    org_name,
    dev_branch,
    cfr_type,
    token_id,
  };
  if (prod_branch != null && prod_branch !== '') insert.prod_branch = prod_branch;
  if (stage_branch != null && stage_branch !== '') insert.stage_branch = stage_branch;
  if (cfr_type === 'CI-CD' && workflow_file != null) insert.workflow_file = workflow_file;
  if (cfr_type === 'PR_MERGE' && pr_merge_config != null) insert.pr_merge_config = pr_merge_config;

  const { data, error } = await supabaseServer
    .from('Repos')
    .insert(insert)
    .select()
    .single();

  if (error) {
    return res.status(500).send({ error: error.message });
  }
  return res.status(201).send(data);
});

export default endpoint.serve();
