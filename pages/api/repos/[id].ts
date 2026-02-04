import * as yup from 'yup';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { supabaseServer } from '@/lib/supabase';

const pathSchema = yup.object({
  id: yup.string().uuid().required(),
});

const patchSchema = yup.object({
  token_id: yup.string().uuid().optional(),
  org_name: yup.string().min(1).max(500).optional(),
  repo_name: yup.string().min(1).max(500).optional(),
  dev_branch: yup.string().min(1).max(500).optional(),
  stage_branch: yup.string().max(500).optional().nullable(),
  prod_branch: yup.string().max(500).optional().nullable(),
  cfr_type: yup.string().oneOf(['CI-CD', 'PR_MERGE']).optional(),
  workflow_file: yup.string().max(500).optional().nullable(),
  pr_merge_config: yup.object().optional().nullable(),
});

const endpoint = new Endpoint(pathSchema);

endpoint.handle.GET(nullSchema, async (req, res) => {
  const { id } = req.payload;

  const { data, error } = await supabaseServer
    .from('repos')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return res.status(404).send({ error: 'Repo not found' });
  }

  return res.status(200).send(data);
});

endpoint.handle.PATCH(patchSchema, async (req, res) => {
  const { id, ...rest } = req.payload;
  const updates: Record<string, unknown> = {};

  const allowed = [
    'token_id',
    'org_name',
    'repo_name',
    'dev_branch',
    'stage_branch',
    'prod_branch',
    'cfr_type',
    'workflow_file',
    'pr_merge_config',
  ] as const;
  for (const key of allowed) {
    if (rest[key] !== undefined) {
      if (key === 'stage_branch' || key === 'prod_branch' || key === 'workflow_file') {
        updates[key] = rest[key] === '' ? null : rest[key];
      } else {
        updates[key] = rest[key];
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).send({ error: 'No fields to update' });
  }

  const { data, error } = await supabaseServer
    .from('repos')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return res.status(500).send({ error: error.message });
  }

  return res.status(200).send(data);
});

export default endpoint.serve();
