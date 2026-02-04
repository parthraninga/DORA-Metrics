import { debounce } from '@mui/material';
import axios, { CanceledError } from 'axios';
import { useSnackbar } from 'notistack';
import { equals } from 'ramda';
import {
  createContext,
  useContext,
  SyntheticEvent,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  useState
} from 'react';

import { FetchState } from '@/constants/ui-states';
import { useAuth } from '@/hooks/useAuth';
import { useBoolState, useEasyState } from '@/hooks/useEasyState';
import { appSlice } from '@/slices/app';
import { fetchCurrentOrg } from '@/slices/auth';
import { handleApi } from '@/api-helpers/axios-api-instance';
import {
  fetchTeams,
  fetchTeamsSupabase,
  createTeam,
  createTeamSupabase,
  updateTeam,
  updateTeamSupabase
} from '@/slices/team';
import { useDispatch, useSelector } from '@/store';
import { Team } from '@/types/api/teams';
import {
  BaseRepo,
  DB_OrgRepo,
  DeploymentSources,
  RepoUniqueDetails,
  AdaptedRepoWorkflow
} from '@/types/resources';
import { depFn } from '@/utils/fn';

interface TeamsCRUDContextType {
  teams: Team[];
  teamReposMaps: Record<string, DB_OrgRepo[]>;
  teamName: string;
  showTeamNameError: boolean;
  handleTeamNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  raiseTeamNameError: () => void;
  repoOptions: BaseRepo[];
  selectedRepos: BaseRepo[];
  handleRepoSelectionChange: (
    _: SyntheticEvent<Element, Event>,
    value: BaseRepo[]
  ) => void;
  teamRepoError: boolean;
  raiseTeamRepoError: () => void;
  onSave: (callBack?: AnyFunction) => void;
  isSaveLoading: boolean;
  unselectRepo: (id: BaseRepo['id']) => void;
  updateWorkflowsForTeam: (
    repo: BaseRepo,
    repoWorkflows: AdaptedRepoWorkflow[]
  ) => void;
  updateDeploymentTypeForRepo: (
    id: BaseRepo['id'],
    deployment_type: DeploymentSources
  ) => void;
  isPageLoading: boolean;
  onDiscard: (callBack?: AnyFunction) => void;
  isEditing: boolean;
  editingTeam: Team | null;
  saveDisabled: boolean;
  showWorkflowChangeWarning: boolean;
  loadingRepos: boolean;
  handleReposSearch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  useSupabaseTeams: boolean;
}

const TeamsCRUDContext = createContext<TeamsCRUDContextType | undefined>(
  undefined
);

export const useTeamCRUD = () => {
  const context = useContext(TeamsCRUDContext);
  if (!context) {
    throw new Error(
      'useTeamSettings must be used within a TeamsSettingsProvider'
    );
  }
  return context;
};

export const TeamsCRUDProvider: React.FC<{
  teamId?: ID;
}> = ({ children, teamId }) => {
  // team slice logic
  const { enqueueSnackbar } = useSnackbar();
  const dispatch = useDispatch();
  const teamReposMaps = useSelector((s) => s.team.teamReposMaps);
  const teams = useSelector((s) => s.team.teams);
  const { orgId } = useAuth();

  const isPageLoading = useSelector(
    (s) => s.team.requests?.teams === FetchState.REQUEST
  );

  const useSupabaseTeams = !orgId;
  const fetchTeamsAndRepos = useCallback(() => {
    if (useSupabaseTeams) {
      return dispatch(fetchTeamsSupabase());
    }
    dispatch(fetchCurrentOrg());
    return dispatch(
      fetchTeams({
        org_id: orgId
      })
    );
  }, [dispatch, orgId, useSupabaseTeams]);

  // team name logic
  const teamName = useEasyState('');
  const teamNameError = useBoolState(false);
  const raiseTeamNameError = useCallback(() => {
    if (!teamName.value) {
      depFn(teamNameError.true);
    } else {
      depFn(teamNameError.false);
    }
  }, [teamName.value, teamNameError.false, teamNameError.true]);

  const handleTeamNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      depFn(teamName.set, e.target.value);
      depFn(raiseTeamNameError);
    },
    [raiseTeamNameError, teamName.set]
  );

  // team-repo selection logic: when !orgId use repos from DB (Sync Repos), else search external API
  const selections = useEasyState<BaseRepo[]>([]);
  const selectedRepos = useMemo(() => selections.value, [selections.value]);
  const teamRepoError = useBoolState();
  const reposFromDb = useReposFromDb(useSupabaseTeams);
  const {
    loadingRepos: loadingReposExternal,
    onChange: handleReposSearchExternal,
    searchResults
  } = useReposSearch();
  const repoSearchResult = useMemo(() => {
    if (useSupabaseTeams) {
      return reposFromDb.filter(
        (repo) => !selectedRepos.find((r) => String(r.id) === String(repo.id))
      );
    }
    return searchResults.filter(
      (repo) => !selectedRepos.find((r) => r.id === repo.id)
    );
  }, [useSupabaseTeams, reposFromDb, searchResults, selectedRepos]);
  const loadingRepos = useSupabaseTeams ? false : loadingReposExternal;
  const handleReposSearch = useSupabaseTeams ? (() => {}) : handleReposSearchExternal;

  const raiseTeamRepoError = useCallback(() => {
    if (!selections.value.length) {
      depFn(teamRepoError.true);
    } else {
      depFn(teamRepoError.false);
    }
  }, [selections.value.length, teamRepoError.false, teamRepoError.true]);

  const handleRepoSelectionChange = useCallback(
    (_: SyntheticEvent<Element, Event>, value: BaseRepo[]) => {
      const reposWithDeploymentType = value.map((r) => ({
        ...r,
        deployment_type: r.deployment_type ?? DeploymentSources.PR_MERGE
      }));
      depFn(selections.set, reposWithDeploymentType);
      depFn(teamRepoError.false);
    },
    [selections.set, teamRepoError.false]
  );

  const updateWorkflowsForTeam = useCallback(
    (repo: BaseRepo, repoWorkflows: AdaptedRepoWorkflow[]) => {
      const updatedRepos = selections.value.map((r) => {
        return {
          ...r,
          repo_workflows: r.id === repo.id ? repoWorkflows : r.repo_workflows
        };
      });
      depFn(selections.set, updatedRepos);
    },

    [selections.set, selections.value]
  );
  const unselectRepo = useCallback(
    (id: BaseRepo['id']) => {
      if (selections.value.length === 1) {
        depFn(teamRepoError.true);
      }
      depFn(
        selections.set,
        selections.value.filter((r) => r.id !== id)
      );
    },
    [selections.set, selections.value, teamRepoError.true]
  );

  const updateDeploymentTypeForRepo = useCallback(
    (id: BaseRepo['id'], deployment_type: DeploymentSources) => {
      const updatedRepos = selections.value.map((r) => {
        return {
          ...r,
          deployment_type: id === r.id ? deployment_type : r.deployment_type
        };
      });
      depFn(selections.set, updatedRepos);
    },
    [selections.set, selections.value]
  );

  // editing logic
  const isEditing = Boolean(teamId);
  const editingTeam = useMemo(
    () => teams.find((t) => t.id === teamId) || null,
    [teamId, teams]
  );
  const initState = useMemo(() => {
    if (isEditing) {
      const selectedTeam = editingTeam;
      const rawRepos = teamReposMaps?.[teamId] || [];
      const selectedTeamRepos = useSupabaseTeams
        ? rawRepos.map(adaptSupabaseRepoToBaseRepo)
        : rawRepos.map(adaptBaseRepo);
      return {
        name: selectedTeam?.name || '',
        repos: selectedTeamRepos
      };
    }
    return {
      name: '',
      repos: []
    };
  }, [editingTeam, isEditing, teamId, teamReposMaps, useSupabaseTeams]);

  useEffect(() => {
    if (isEditing) {
      depFn(teamName.set, initState.name);
      depFn(selections.set, initState.repos);
    }
  }, [
    initState.name,
    initState.repos,
    isEditing,
    selections.set,
    teamName.set
  ]);

  // save team logic
  const isSaveLoading = useBoolState();
  const teamCreation = useCallback(
    async (callBack?: AnyFunction) => {
      depFn(isSaveLoading.true);
      const capitalizedTeamName =
        teamName.value.charAt(0).toUpperCase() + teamName.value.slice(1);

      if (useSupabaseTeams) {
        const repo_ids = selections.value.map((r) => String(r.id));
        return dispatch(
          createTeamSupabase({
            name: capitalizedTeamName,
            repo_ids
          })
        )
          .then((res: any) => {
            if (res.meta.requestStatus === 'rejected') {
              enqueueSnackbar('Failed to create team', {
                variant: 'error',
                autoHideDuration: 2000
              });
              return console.error('Failed to create team', res.meta);
            }
            enqueueSnackbar('Team created successfully, refreshing...', {
              variant: 'success',
              autoHideDuration: 2000
            });
            fetchTeamsAndRepos();
            const createdTeam = res.payload;
            if (createdTeam?.id) {
              const team = { id: createdTeam.id, name: createdTeam.name, org_id: '', member_ids: [], created_at: createdTeam.created_at, updated_at: createdTeam.created_at, is_deleted: false };
              dispatch(appSlice.actions.setSingleTeam([team]));
            }
            callBack?.(res);
          })
          .finally(isSaveLoading.false);
        return;
      }

      const repoPayload = repoToPayload(selections.value);
      return dispatch(
        createTeam({
          org_id: orgId,
          team_name: capitalizedTeamName,
          org_repos: repoPayload
        })
      )
        .then((res: any) => {
          if (res.meta.requestStatus === 'rejected') {
            enqueueSnackbar('Failed to create team', {
              variant: 'error',
              autoHideDuration: 2000
            });
            return console.error('Failed to create team', res.meta);
          }
          enqueueSnackbar('Team created successfully, refreshing...', {
            variant: 'success',
            autoHideDuration: 2000
          });
          const createdTeam = res.payload.team;

          fetchTeamsAndRepos().then((res: any) => {
            if (res.meta.requestStatus === 'fulfilled') {
              const { teams } = res.payload;
              const singleTeam = teams.find(
                (team: Team) => team.id === createdTeam.id
              );
              if (singleTeam) {
                dispatch(appSlice.actions.setSingleTeam([singleTeam]));
              }
            }
          });

          callBack?.(res);
        })
        .finally(isSaveLoading.false);
    },
    [
      dispatch,
      enqueueSnackbar,
      fetchTeamsAndRepos,
      isSaveLoading.false,
      isSaveLoading.true,
      orgId,
      selections.value,
      teamName.value,
      useSupabaseTeams
    ]
  );

  const teamUpdation = useCallback(
    async (callBack?: AnyFunction) => {
      depFn(isSaveLoading.true);

      if (useSupabaseTeams) {
        const repo_ids = selections.value.map((r) => String(r.id));
        return dispatch(
          updateTeamSupabase({
            team_id: teamId,
            name: teamName.value,
            repo_ids
          })
        )
          .then((res) => {
            if (res.meta.requestStatus === 'rejected') {
              enqueueSnackbar('Failed to update team', {
                variant: 'error',
                autoHideDuration: 2000
              });
              return console.error('Failed to update team', res.meta);
            }
            enqueueSnackbar('Team updated successfully, refreshing...', {
              variant: 'success',
              autoHideDuration: 2000
            });
            fetchTeamsAndRepos();
            callBack?.(res);
          })
          .finally(isSaveLoading.false);
        return;
      }

      const repoPayload = repoToPayload(selections.value);
      return dispatch(
        updateTeam({
          team_id: teamId,
          org_id: orgId,
          team_name: teamName.value,
          org_repos: repoPayload
        })
      )
        .then((res) => {
          if (res.meta.requestStatus === 'rejected') {
            enqueueSnackbar('Failed to update team', {
              variant: 'error',
              autoHideDuration: 2000
            });
            return console.error('Failed to update team', res.meta);
          }
          enqueueSnackbar('Team updated successfully, refreshing...', {
            variant: 'success',
            autoHideDuration: 2000
          });
          fetchTeamsAndRepos();
          callBack?.(res);
        })
        .finally(isSaveLoading.false);
    },
    [
      dispatch,
      enqueueSnackbar,
      fetchTeamsAndRepos,
      isSaveLoading.false,
      isSaveLoading.true,
      orgId,
      selections.value,
      teamId,
      teamName.value,
      useSupabaseTeams
    ]
  );

  const onSave = useCallback(
    async (callBack?: AnyFunction) => {
      if (isEditing) {
        return await teamUpdation(callBack);
      }
      return await teamCreation(callBack);
    },
    [isEditing, teamCreation, teamUpdation]
  );

  const resetErrors = useCallback(() => {
    depFn(teamRepoError.false);
    depFn(teamNameError.false);
  }, [teamNameError.false, teamRepoError.false]);

  const onDiscard = useCallback(
    (callBack?: AnyFunction) => {
      resetErrors();
      if (!isEditing) {
        depFn(teamName.set, '');
        depFn(selections.set, []);
        return callBack?.();
      }
      depFn(teamName.set, initState.name);
      depFn(selections.set, initState.repos);
      return callBack?.();
    },
    [
      resetErrors,
      isEditing,
      teamName.set,
      initState.name,
      initState.repos,
      selections.set
    ]
  );

  const saveDisabled = useMemo(() => {
    const baseConditions =
      !teamName.value || !selections.value.length || isSaveLoading.value;
    if (isEditing) {
      return (
        baseConditions ||
        (teamName.value === initState.name &&
          equals(selections.value, initState.repos))
      );
    }
    return baseConditions;
  }, [
    initState.name,
    initState.repos,
    isEditing,
    isSaveLoading.value,
    selections.value,
    teamName.value
  ]);

  const showWorkflowChangeWarning = useMemo(() => {
    if (!isEditing) return false;
    const repoWorkflowsMap = selections.value.reduce(
      (acc, repo) => {
        acc[repo.id] = repo.repo_workflows;
        return acc;
      },
      {} as Record<ID, AdaptedRepoWorkflow[]>
    );

    const initialRepoWorkflowsMap = initState.repos.reduce(
      (acc, repo) => {
        acc[repo.id] = repo.repo_workflows;
        return acc;
      },
      {} as Record<ID, AdaptedRepoWorkflow[]>
    );

    return !equals(repoWorkflowsMap, initialRepoWorkflowsMap);
  }, [initState.repos, isEditing, selections.value]);

  const contextValue: TeamsCRUDContextType = {
    teamName: teamName.value,
    showTeamNameError: teamNameError.value,
    raiseTeamNameError,
    teamReposMaps,
    teams,
    handleTeamNameChange,
    repoOptions: repoSearchResult,
    selectedRepos,
    handleRepoSelectionChange,
    updateWorkflowsForTeam,
    teamRepoError: teamRepoError.value,
    raiseTeamRepoError,
    onSave,
    isSaveLoading: isSaveLoading.value,
    unselectRepo,
    updateDeploymentTypeForRepo,
    isPageLoading,
    onDiscard,
    isEditing,
    editingTeam,
    saveDisabled,
    showWorkflowChangeWarning,
    loadingRepos,
    handleReposSearch,
    useSupabaseTeams
  };

  return (
    <TeamsCRUDContext.Provider value={contextValue}>
      {children}
    </TeamsCRUDContext.Provider>
  );
};

const repoToPayload = (repos: BaseRepo[]) => {
  const repoPayload = {} as Record<string, RepoUniqueDetails[]>;
  repos.forEach((repo) => {
    const orgRepo: RepoUniqueDetails = {
      idempotency_key: String(repo.id),
      name: repo.name,
      slug: repo.slug,
      default_branch: repo.branch,
      deployment_type: repo.deployment_type,
      repo_workflows: repo.repo_workflows,
      provider: repo.provider
    };
    const orgName = repo.parent;

    if (repoPayload[orgName]) {
      repoPayload[orgName].push(orgRepo);
    } else {
      repoPayload[orgName] = [orgRepo];
    }
  });

  return repoPayload;
};

const DEBOUNCE_TIME = 500;

const useReposSearch = () => {
  const { orgId } = useAuth();
  const searchResults = useEasyState<BaseRepo[]>([]);
  const { integrationList } = useAuth();

  const isLoading = useBoolState(false);

  const controllerRef = useRef<AbortController | null>(null);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    debouncedSearch(query);
  };

  const debouncedSearch = useCallback(
    debounce((query) => {
      fetchData(query);
    }, DEBOUNCE_TIME),
    []
  );

  const fetchData = useCallback(
    async (query) => {
      depFn(isLoading.true);
      // cancel the previous request if it exists
      if (controllerRef.current) {
        controllerRef.current.abort('Operation canceled due to new request.');
      }
      if (!query) return depFn(isLoading.false);
      // create a new cancel token
      controllerRef.current = new AbortController();

      try {
        const response = await axios(
          `/api/internal/${orgId}/git_provider_org`,
          {
            params: { providers: integrationList, search_text: query },
            signal: controllerRef.current.signal
          }
        );
        const data = response.data;
        depFn(searchResults.set, data);
        depFn(isLoading.false);
      } catch (error: any) {
        if (!(error instanceof CanceledError)) {
          depFn(isLoading.false);
          console.error(error);
        }
      }
    },
    [orgId]
  );

  return {
    searchResults: searchResults.value,
    onChange,
    loadingRepos: isLoading.value
  };
};

const adaptBaseRepo = (repo: DB_OrgRepo): BaseRepo =>
  ({
    id: Number(repo.idempotency_key),
    name: repo.name,
    slug: repo.slug,
    branch: repo.default_branch,
    parent: repo.org_name,
    deployment_type: repo.deployment_type,
    repo_workflows: repo.repo_workflows,
    provider: repo.provider
  }) as unknown as BaseRepo;

type SupabaseRepoRow = { id: string; repo_name: string; org_name: string };
const adaptSupabaseRepoToBaseRepo = (repo: SupabaseRepoRow | DB_OrgRepo): BaseRepo =>
  ({
    id: (repo as SupabaseRepoRow).id ?? (repo as DB_OrgRepo).idempotency_key,
    name: (repo as SupabaseRepoRow).repo_name ?? (repo as DB_OrgRepo).name,
    slug: (repo as SupabaseRepoRow).repo_name ?? (repo as DB_OrgRepo).slug,
    branch: (repo as DB_OrgRepo).default_branch ?? 'main',
    parent: (repo as SupabaseRepoRow).org_name ?? (repo as DB_OrgRepo).org_name,
    desc: '',
    web_url: `${(repo as SupabaseRepoRow).org_name ?? (repo as DB_OrgRepo).org_name}/${(repo as SupabaseRepoRow).repo_name ?? (repo as DB_OrgRepo).name}`,
    language: '',
    deployment_type: (repo as DB_OrgRepo).deployment_type ?? DeploymentSources.WORKFLOW,
    repo_workflows: (repo as DB_OrgRepo).repo_workflows ?? [],
    provider: (repo as DB_OrgRepo).provider
  }) as unknown as BaseRepo;

const useReposFromDb = (enabled: boolean): BaseRepo[] => {
  const [repos, setRepos] = useState<BaseRepo[]>([]);
  useEffect(() => {
    if (!enabled) {
      setRepos([]);
      return;
    }
    handleApi<SupabaseRepoRow[]>('/repos')
      .then((data) => {
        setRepos((data || []).map((r) => adaptSupabaseRepoToBaseRepo(r)));
      })
      .catch(() => setRepos([]));
  }, [enabled]);
  return repos;
};
