import * as yup from 'yup';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { enc } from '@/utils/auth-supplementary';
import { db } from '@/utils/db';

const pathSchema = yup.object({
  id: yup.string().uuid().required(),
});

const patchSchema = yup.object({
  display_name: yup.string().min(1).max(100).optional(),
  token: yup.string().optional(),
  provider_meta: yup.object().optional(),
});

const endpoint = new Endpoint(pathSchema);

endpoint.handle.PATCH(patchSchema, async (req, res) => {
  const { id } = req.payload;
  const { display_name, token, provider_meta } = req.payload;

  // Check if integration exists
  const integration = await db('Integration').where('id', id).first();
  if (!integration) {
    return res.status(404).send({ error: 'Integration not found' });
  }

  const updates: any = {
    updated_at: new Date(),
  };

  if (display_name !== undefined) {
    // Check if display_name already exists for this org (excluding current integration)
    const existing = await db('Integration')
      .where({
        org_id: integration.org_id,
        display_name,
      })
      .whereNot('id', id)
      .first();

    if (existing) {
      return res.status(400).send({
        error: 'An integration with this name already exists for this organization',
      });
    }
    updates.display_name = display_name;
  }

  if (token !== undefined) {
    const encrypted_chunks = enc(token);
    if (!encrypted_chunks) {
      return res.status(500).send({ error: 'Failed to encrypt token' });
    }
    updates.access_token_enc_chunks = encrypted_chunks;
  }

  if (provider_meta !== undefined) {
    updates.provider_meta = provider_meta;
  }

  const [updated] = await db('Integration')
    .where('id', id)
    .update(updates)
    .returning(['id', 'name', 'display_name', 'org_id', 'created_at', 'updated_at', 'provider_meta']);

  return res.status(200).send(updated);
});

export default endpoint.serve();
