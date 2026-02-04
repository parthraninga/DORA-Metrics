import * as yup from 'yup';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { Integration } from '@/constants/integrations';
import { db } from '@/utils/db';

const getSchema = yup.object({
  org_id: yup.string().uuid().required(),
  provider: yup.string().oneOf([Integration.GITHUB, Integration.GITLAB]).optional(),
});

const endpoint = new Endpoint(nullSchema);

endpoint.handle.GET(getSchema, async (req, res) => {
  const { org_id, provider } = req.payload;

  let query = db('Integration')
    .select('id', 'name', 'display_name', 'org_id', 'created_at', 'updated_at', 'provider_meta')
    .where('org_id', org_id);

  if (provider) {
    query = query.where('name', provider);
  }

  const integrations = await query.orderBy('created_at', 'desc');

  // Get usage count for each integration (how many teams use it)
  const integrationsWithUsage = await Promise.all(
    integrations.map(async (integration) => {
      const teamCount = await db('Team')
        .where('integration_id', integration.id)
        .count('* as count')
        .first();

      return {
        ...integration,
        team_count: parseInt(teamCount?.count || '0', 10),
      };
    })
  );

  return res.status(200).send(integrationsWithUsage);
});

export default endpoint.serve();
