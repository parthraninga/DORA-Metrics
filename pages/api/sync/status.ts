import { Endpoint, nullSchema } from '@/api-helpers/global';
import { getRedisStatus } from '@/lib/redis';

const endpoint = new Endpoint(nullSchema);

endpoint.handle.GET(nullSchema, async (_req, res) => {
  const redis = await getRedisStatus();
  res.send({ redis });
});

export default endpoint.serve();
