import * as yup from 'yup';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { db } from '@/utils/db';

const pathSchema = yup.object({
  id: yup.string().uuid().required(),
});

const endpoint = new Endpoint(pathSchema);

endpoint.handle.DELETE(nullSchema, async (req, res) => {
  const { id } = req.payload;

  // Check if integration exists
  const integration = await db('Integration').where('id', id).first();
  if (!integration) {
    return res.status(404).send({ error: 'Integration not found' });
  }

  // Check if integration is used by any teams
  const teamsUsing = await db('Team')
    .where('integration_id', id)
    .count('* as count')
    .first();

  const teamCount = parseInt(teamsUsing?.count || '0', 10);
  if (teamCount > 0) {
    return res.status(400).send({
      error: `Cannot delete integration: it is used by ${teamCount} team(s)`,
      team_count: teamCount,
    });
  }

  await db('Integration').where('id', id).delete();

  return res.status(200).send({ status: 'OK' });
});

export default endpoint.serve();
