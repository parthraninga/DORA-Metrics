import { useEffect, useState } from 'react';

import { handleApi } from '@/api-helpers/axios-api-instance';

/**
 * Returns whether at least one repo exists (Supabase Repos table).
 * Used to show main app pages (Manage Teams, DORA Metrics, Settings, System Logs)
 * when the user has synced repos but has no local SQL org/team setup.
 */
export const useHasRepos = () => {
  const [hasRepos, setHasRepos] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    handleApi<unknown[]>('/repos')
      .then((data) => setHasRepos(Array.isArray(data) && data.length > 0))
      .catch(() => setHasRepos(false))
      .finally(() => setDone(true));
  }, []);

  return { hasRepos, done };
};
