import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

import { handleApi } from '@/api-helpers/axios-api-instance';
import { useAuth } from '@/hooks/useAuth';
import { OnboardingStep, UserRole } from '@/types/resources';

import { ROUTES } from './routes';

export const useDefaultRoute = () => {
  return ROUTES.DORA_METRICS;
};

export const useRedirectWithSession = () => {
  const defaultRoute = useDefaultRoute();
  const router = useRouter();
  const { org, orgId, onboardingState } = useAuth();
  const [hasRepos, setHasRepos] = useState(false);
  const [reposCheckDone, setReposCheckDone] = useState(false);

  const isOrgWelcomed = onboardingState.includes(OnboardingStep.WELCOME_SCREEN);

  const anyTeamEverExisted = onboardingState.includes(
    OnboardingStep.TEAM_CREATED
  );

  const isOneCodeProviderIntegrated =
    org?.integrations?.github ||
    org?.integrations?.gitlab ||
    org?.integrations?.bitbucket;

  // Allow viewing main pages if at least one repo exists (Supabase), even without local SQL org/team setup
  useEffect(() => {
    if (!router.isReady) return;
    handleApi<unknown[]>('/repos')
      .then((data) => setHasRepos(Array.isArray(data) && data.length > 0))
      .catch(() => setHasRepos(false))
      .finally(() => setReposCheckDone(true));
  }, [router.isReady]);

  useEffect(() => {
    if (!router.isReady || !reposCheckDone) return;
    // When Supabase has repos, allow all main routes (Manage Teams, DORA, Settings, etc.) without requiring local org/onboarding
    if (hasRepos) {
      if (router.pathname === ROUTES.BASE) {
        router.replace(defaultRoute.PATH);
      }
      return;
    }
    if (!isOrgWelcomed) {
      router.replace(ROUTES.WELCOME.PATH);
      return;
    }
    const canSkipIntegrations = isOneCodeProviderIntegrated || hasRepos;
    if (
      !canSkipIntegrations &&
      router.pathname !== ROUTES.INTEGRATIONS.PATH
    ) {
      router.replace(ROUTES.INTEGRATIONS.PATH);
      return;
    }
    const canSkipTeams = anyTeamEverExisted || hasRepos;
    if (!canSkipTeams && router.pathname !== ROUTES.TEAMS.PATH) {
      router.replace(ROUTES.TEAMS.PATH);
      return;
    }
    if (router.pathname === ROUTES.BASE) {
      router.replace(defaultRoute.PATH);
    }
  }, [
    anyTeamEverExisted,
    defaultRoute.PATH,
    hasRepos,
    isOneCodeProviderIntegrated,
    isOrgWelcomed,
    orgId,
    reposCheckDone,
    router
  ]);
};

const roleList = [UserRole.ENGINEER, UserRole.EM, UserRole.MOM];

export const isRoleGreaterOrEqual = (minRole: UserRole, role: UserRole) => {
  const minIndex = roleList.indexOf(minRole);
  return minIndex <= roleList.indexOf(role);
};

export const isRoleGreaterThanEng = (role: UserRole) =>
  isRoleGreaterOrEqual(UserRole.EM, role);

export const isRoleLessThanEM = (role: UserRole) => !isRoleGreaterThanEng(role);
