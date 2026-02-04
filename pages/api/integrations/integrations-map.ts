import { getLastSyncedAtForCodeProvider } from '@/api/internal/[org_id]/sync_repos';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { CODE_PROVIDER_INTEGRATIONS_MAP } from '@/constants/api';

import { getOrgIntegrations } from '../auth/session';

const endpoint = new Endpoint(nullSchema);

endpoint.handle.GET(nullSchema, async (req, res) => {
  const org_id = req.payload?.org_id;
  if (!org_id) {
    return res.status(200).send({});
  }
  try {
    const [integrationsLinkedAtMap, codeProviderLastSyncedAt] = await Promise.all(
      [getOrgIntegrations(), getLastSyncedAtForCodeProvider(org_id)]
    );
    const integrations = {} as IntegrationsMap;
    Object.entries(integrationsLinkedAtMap).forEach(
      ([integrationName, integrationLinkedAt]) => {
        integrations[integrationName as keyof IntegrationsMap] = {
          integrated: true,
          linked_at: integrationLinkedAt,
          last_synced_at: CODE_PROVIDER_INTEGRATIONS_MAP[
            integrationName as keyof typeof CODE_PROVIDER_INTEGRATIONS_MAP
          ]
            ? codeProviderLastSyncedAt
            : null
        };
      }
    );
    res.send(integrations);
  } catch (err) {
    console.warn('[GET /api/integrations/integrations-map] Error, returning empty map:', err instanceof Error ? err.message : err);
    return res.status(200).send({});
  }
});

export default endpoint.serve();
