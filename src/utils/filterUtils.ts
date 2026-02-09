import { getAllTeamsReposProdBranchesForOrgAsMap } from '@/api/internal/team/[team_id]/repo_branches';
import {
  repoFiltersFromTeamProdBranches,
  updatePrFilterParams,
  workFlowFiltersFromTeamProdBranches
} from '@/api-helpers/team';
import { ActiveBranchMode, TeamRepoBranchDetails } from '@/types/resources';
import { uniq } from 'ramda';

export const getBranchesAndRepoFilter = async (params: {
  orgId: ID;
  teamId: ID;
  branches?: string;
  branchMode: ActiveBranchMode;
  ignoreBranches?: boolean;
}) => {
  const { orgId, teamId, branchMode, ignoreBranches, branches } = params;
  const useProdBranches = branchMode === ActiveBranchMode.PROD;
  const teamProdBranchesMap =
    await getAllTeamsReposProdBranchesForOrgAsMap(orgId);

  const teamRepoFiltersMap =
    repoFiltersFromTeamProdBranches(teamProdBranchesMap);
  return {
    branches:
      ignoreBranches || useProdBranches
        ? null
        : branchMode === ActiveBranchMode.ALL
        ? '^'
        : branches,
    repo_filters: useProdBranches ? teamRepoFiltersMap[teamId] : null
  };
};

export const getBranchesAndRepoFilterAsPayload = async (params: {
  orgId: ID;
  teamIds: ID[];
  branches?: string;
  branchMode: ActiveBranchMode;
  ignoreBranches?: boolean;
  teamProdBranchesMap: Record<ID, TeamRepoBranchDetails[]>;
}) => {
  const { teamIds, branches, branchMode, ignoreBranches, teamProdBranchesMap } =
    params;

  const useProdBranches = branchMode === ActiveBranchMode.PROD;
  const teamRepoFiltersMap =
    repoFiltersFromTeamProdBranches(teamProdBranchesMap);

  const teamsPrFilters = await Promise.all(
    teamIds.map((teamId) =>
      updatePrFilterParams(
        teamId,
        {},
        {
          branches:
            ignoreBranches || useProdBranches
              ? null
              : branchMode === ActiveBranchMode.ALL
              ? '^'
              : branches,
          repo_filters: useProdBranches ? teamRepoFiltersMap[teamId] : null
        }
      ).then(({ pr_filter }) => ({
        pr_filter: pr_filter || null
      }))
    )
  );

  return teamsPrFilters;
};

export const getWorkFlowFilters = (params: {
  teamProdBranchesMap: Record<ID, TeamRepoBranchDetails[]>;
  teamIds: ID[];
}) => {
  const { teamProdBranchesMap, teamIds } = params;
  return Object.fromEntries(
    Object.entries(
      workFlowFiltersFromTeamProdBranches(teamProdBranchesMap)
    ).filter(([id]) => teamIds.includes(id))
  );
};

export const getWorkFlowFiltersAsPayloadForSingleTeam = async (params: {
  orgId: ID;
  teamId: ID;
  branchMode?: ActiveBranchMode;
}) => {
  const { orgId, teamId, branchMode = ActiveBranchMode.PROD } = params;
  const teamProdBranchesMap =
    await getAllTeamsReposProdBranchesForOrgAsMap(orgId);
  
  const teamRepos = teamProdBranchesMap[teamId] || [];
  
  let headBranches: string[] = [];
  
  if (branchMode === ActiveBranchMode.PROD) {
    // Use prod_branches array for production
    headBranches = uniq(
      teamRepos.map((repo) => repo.prod_branches).flat().filter(Boolean) as string[]
    );
  } else if (branchMode === ActiveBranchMode.STAGE) {
    // Use stage_branch individual field for stage
    headBranches = uniq(
      teamRepos.map((repo) => repo.stage_branch).filter(Boolean) as string[]
    );
  } else if (branchMode === ActiveBranchMode.DEV) {
    // Use dev_branch individual field for dev
    headBranches = uniq(
      teamRepos.map((repo) => repo.dev_branch).filter(Boolean) as string[]
    );
  }
  
  return {
    workflow_filter: {
      head_branches: headBranches
    }
  };
};
