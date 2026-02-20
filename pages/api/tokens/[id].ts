import * as yup from 'yup';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { supabaseServer, maskToken, TokenType } from '@/lib/supabase';

const TOKEN_TYPES: TokenType[] = ['github', 'gitlab', 'bitbucket'];

const pathSchema = yup.object({
  id: yup.string().uuid().required(),
});

const patchSchema = yup.object({
  name: yup.string().min(1).max(200).optional(),
  token: yup.string().min(1).optional(),
  type: yup.string().oneOf(TOKEN_TYPES).optional(),
  email: yup.string().max(256).nullable().optional(),
});

const endpoint = new Endpoint(pathSchema);

endpoint.handle.GET(nullSchema, async (req, res) => {
  const { id } = req.payload;

  const { data, error } = await supabaseServer
    .from('tokens')
    .select('id, name, token, type, email, created_at')
    .eq('id', id)
    .single();

  if (error || !data) {
    return res.status(404).send({ error: 'Token not found' });
  }

  return res.status(200).send({
    id: data.id,
    name: data.name,
    token: data.token,
    type: data.type,
    email: data.email ?? undefined,
    created_at: data.created_at,
    token_masked: maskToken(data.token || ''),
  });
});

endpoint.handle.PATCH(patchSchema, async (req, res) => {
  const { id } = req.payload;
  const updates: { name?: string; token?: string; type?: TokenType; email?: string | null } = {};

  if (req.payload.name !== undefined) updates.name = req.payload.name;
  if (req.payload.token !== undefined) updates.token = req.payload.token;
  if (req.payload.type !== undefined) updates.type = req.payload.type;
  if (req.payload.email !== undefined) updates.email = req.payload.email ?? null;

  if (Object.keys(updates).length === 0) {
    return res.status(400).send({ error: 'No fields to update' });
  }

  const { data, error } = await supabaseServer
    .from('tokens')
    .update(updates)
    .eq('id', id)
    .select('id, name, type, created_at')
    .single();

  if (error) {
    return res.status(500).send({ error: error.message });
  }

  return res.status(200).send({
    ...data,
    token_masked: updates.token ? maskToken(updates.token) : undefined,
  });
});

endpoint.handle.DELETE(nullSchema, async (req, res) => {
  const { id } = req.payload;

  const { error } = await supabaseServer.from('tokens').delete().eq('id', id);

  if (error) {
    return res.status(500).send({ error: error.message });
  }

  return res.status(200).send({ status: 'OK' });
});

export default endpoint.serve();
