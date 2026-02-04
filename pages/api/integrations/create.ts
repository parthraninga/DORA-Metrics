import * as yup from 'yup';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { Integration } from '@/constants/integrations';
import { enc } from '@/utils/auth-supplementary';
import { db } from '@/utils/db';

const postSchema = yup.object({
  org_id: yup.string().uuid().required(),
  provider: yup.string().oneOf([Integration.GITHUB, Integration.GITLAB]).required(),
  token: yup.string().required(),
  display_name: yup.string().required().min(1).max(100),
  provider_meta: yup.object().optional(),
});

const endpoint = new Endpoint(nullSchema);

endpoint.handle.POST(postSchema, async (req, res) => {
  const { org_id, provider, token, display_name, provider_meta } = req.payload;

  // Check if display_name already exists for this org
  const existing = await db('Integration')
    .where({
      org_id,
      display_name,
    })
    .first();

  if (existing) {
    return res.status(400).send({
      error: 'An integration with this name already exists for this organization',
    });
  }

  // Encrypt and insert
  const encrypted_chunks = enc(token);
  if (!encrypted_chunks) {
    return res.status(500).send({ error: 'Failed to encrypt token' });
  }

  const [integration] = await db('Integration')
    .insert({
      org_id,
      name: provider,
      display_name,
      access_token_enc_chunks: encrypted_chunks,
      provider_meta: provider_meta || {},
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning(['id', 'name', 'display_name', 'org_id', 'created_at', 'updated_at', 'provider_meta']);

  return res.status(201).send(integration);
});

export default endpoint.serve();
