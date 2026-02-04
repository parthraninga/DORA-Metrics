import * as yup from 'yup';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { supabaseServer, maskToken, TokenType } from '@/lib/supabase';

const TOKEN_TYPES: TokenType[] = ['github', 'gitlab', 'bitbucket'];

const getSchema = yup.object({});

const postSchema = yup.object({
  name: yup.string().required().min(1).max(200),
  token: yup.string().required().min(1),
  type: yup.string().oneOf(TOKEN_TYPES).required(),
});

const endpoint = new Endpoint(nullSchema);

endpoint.handle.GET(getSchema, async (_req, res) => {
  const { data, error } = await supabaseServer
    .from('tokens')
    .select('id, name, token, type, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).send({ error: error.message });
  }

  const list = (data || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    token_masked: maskToken(row.token || ''),
    type: row.type,
    created_at: row.created_at,
  }));

  return res.status(200).send(list);
});

endpoint.handle.POST(postSchema, async (req, res) => {
  const { name, token, type } = req.payload;

  const { data, error } = await supabaseServer
    .from('tokens')
    .insert({ name, token, type })
    .select('id, name, type, created_at')
    .single();

  if (error) {
    return res.status(500).send({ error: error.message });
  }

  return res.status(201).send({
    ...data,
    token_masked: maskToken(token),
  });
});

export default endpoint.serve();
