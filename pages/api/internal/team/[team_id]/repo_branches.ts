import { omit } from 'ramda';
import * as yup from 'yup';

import { handleRequest } from '@/api-helpers/axios';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import { Table } from '@/constants/db';
import { supabaseServer } from '@/lib/supabase';
import { TeamRepoBranchDetails } from '@/types/resources';
import { db } from '@/utils/db';

export const teamRepoProductionBranchSchema = yup.object().shape({
  team_id: yup.string().required(),
  org_repo_id: yup.string().required(),
  name: yup.string().required(),
  prod_branches: yup.array().of(yup.string()).optional().nullable(),
  is_active: yup.boolean().required()
});

const pathSchema = yup.object().shape({
  team_id: yup.string().uuid().required()
});

const putSchema = yup.object().shape({
  team_repos_data: yup.array().of(teamRepoProductionBranchSchema)
});

const endpoint = new Endpoint(pathSchema);

endpoint.handle.GET(nullSchema, async (req, res) => {
  const { team_id } = req.payload;

  try {
    const repos = await db(Table.TeamRepos)
      .leftJoin('OrgRepo', 'OrgRepo.id', 'TeamRepos.org_repo_id')
      .select(
        'team_id',
        'org_repo_id',
        'name',
        'prod_branches',
        'TeamRepos.is_active'
      )
      .where('TeamRepos.is_active', true)
      .andWhere('TeamRepos.team_id', team_id)
      .returning('*');
    return res.send(repos);
  } catch (err: unknown) {
    const isConnectionRefused = (e: unknown) =>
      e instanceof Error && (e as NodeJS.ErrnoException).code === 'ECONNREFUSED';
    const isDbUnavailable =
      err instanceof Error && err.message?.includes('ECONNREFUSED') ||
      isConnectionRefused(err) ||
      (err instanceof AggregateError &&
        (err as AggregateError).errors?.some?.(isConnectionRefused));
    if (!isDbUnavailable) throw err;

    const { data: links } = await supabaseServer
      .from('team_repos')
      .select('repo_id')
      .eq('team_id', team_id);
    const repoIds = (links || []).map((l: { repo_id: string }) => l.repo_id);
    if (repoIds.length === 0) return res.send([]);

    const { data: reposRows } = await supabaseServer
      .from('Repos')
      .select('id, repo_name, prod_branch, stage_branch, dev_branch')
      .in('id', repoIds);

    const payload: TeamRepoBranchDetails[] = (reposRows || []).map(
      (r: {
        id: string;
        repo_name: string;
        prod_branch?: string | null;
        stage_branch?: string | null;
        dev_branch?: string | null;
      }) => ({
        team_id,
        org_repo_id: r.id,
        name: r.repo_name,
        prod_branches: r.prod_branch ? [r.prod_branch] : [],
        prod_branch: r.prod_branch ?? null,
        stage_branch: r.stage_branch ?? null,
        dev_branch: r.dev_branch ?? null,
        is_active: true
      })
    );
    return res.send(payload);
  }
});

endpoint.handle.PUT(putSchema, async (req, res) => {
  const { team_id, team_repos_data } = req.payload;

  type AdaptedBranchConf = yup.InferType<typeof teamRepoProductionBranchSchema>;

  const adapted_team_repos_data = team_repos_data?.map((t) => ({
    ...(omit(['name'], t) as AdaptedBranchConf),
    prod_branches: t.prod_branches?.filter(Boolean) || []
  }));
  await handleRequest<Omit<TeamRepoBranchDetails, 'name'>[]>(
    `/teams/${team_id}/team_repos`,
    { method: 'PATCH', data: { team_repos_data: adapted_team_repos_data } }
  );

  return res.send(team_repos_data);
});

export const getAllTeamsReposProdBranchesForOrg = async (
  org_id: ID
): Promise<TeamRepoBranchDetails[]> => {
  return await db(Table.TeamRepos)
    .leftJoin('OrgRepo', 'OrgRepo.id', 'TeamRepos.org_repo_id')
    .leftJoin('Team', 'Team.id', 'TeamRepos.team_id')
    .select(
      'TeamRepos.team_id',
      'TeamRepos.org_repo_id',
      'Team.name',
      'TeamRepos.prod_branches',
      'TeamRepos.is_active'
    )
    .where('TeamRepos.is_active', true)
    .andWhere('OrgRepo.org_id', org_id)
    .andWhere('Team.is_deleted', false)
    .returning('*');
};

export const transformTeamRepoBranchesToMap = (
  teamsReposProductionBranchDetails: TeamRepoBranchDetails[]
) => {
  return teamsReposProductionBranchDetails.reduce(
    (result, currentRow) => {
      const { team_id } = currentRow;
      if (!result.hasOwnProperty(team_id)) {
        result[team_id] = [];
      }
      result[team_id].push(currentRow);
      return result;
    },
    {} as Record<ID, TeamRepoBranchDetails[]>
  );
};

export const getAllTeamsReposProdBranchesForOrgAsMap = async (
  org_id: ID
): Promise<Record<ID, TeamRepoBranchDetails[]>> => {
  return getAllTeamsReposProdBranchesForOrg(org_id).then(
    transformTeamRepoBranchesToMap
  );
};

export default endpoint.serve();
