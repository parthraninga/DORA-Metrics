import { AddRounded } from '@mui/icons-material';
import { LoadingButton } from '@mui/lab';
import {
  Autocomplete,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  MenuItem,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  Tooltip
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { Authenticated } from 'src/components/Authenticated';

import { handleApi } from '@/api-helpers/axios-api-instance';
import { FlexBox } from '@/components/FlexBox';
import { Line } from '@/components/Text';
import { PageWrapper } from '@/content/PullRequests/PageWrapper';
import { useBoolState, useEasyState } from '@/hooks/useEasyState';
import ExtendedSidebarLayout from '@/layouts/ExtendedSidebarLayout';
import { PageLayout } from '@/types/resources';
import type { TokenType } from '@/lib/supabase';

type RepoRow = {
  id: string;
  repo_name: string;
  created_at: string;
  last_fetched_at?: string | null;
  org_name?: string;
  dev_branch?: string;
  stage_branch?: string | null;
  prod_branch?: string | null;
  cfr_type?: string;
  token_id?: string;
  workflow_file?: string | null;
  pr_merge_config?: unknown;
};


type TokenOption = { id: string; name: string; type: TokenType; token_masked: string };
type OrgOption = { id: number; login: string; avatar_url: string };
type OrgRepo = { id: number; name: string; full_name: string };
type WorkflowOption = { id: number; name: string; path: string; state: string };

const CFR_TYPES = [
  { value: 'CI-CD', label: 'CI-CD PIPELINE' },
  { value: 'PR_MERGE', label: 'PR MERGE' },
];

function SyncPage() {
  return (
    <>
      <PageWrapper
        title={
          <FlexBox gap1 alignCenter>
            Sync Repos
          </FlexBox>
        }
        hideAllSelectors
        pageTitle="Sync Repos"
        showEvenIfNoTeamSelected={true}
        isLoading={false}
      >
        <Content />
      </PageWrapper>
    </>
  );
}

SyncPage.getLayout = (page: PageLayout) => (
  <Authenticated>
    <ExtendedSidebarLayout>{page}</ExtendedSidebarLayout>
  </Authenticated>
);

export default SyncPage;

type RedisStatus = 'ok' | 'down' | 'not_configured' | null;

const Content = () => {
  const [list, setList] = useState<RepoRow[]>([]);
  const loading = useBoolState(true);
  const modalOpen = useBoolState(false);
  const [editRepoId, setEditRepoId] = useState<string | null>(null);
  const editModalOpen = useBoolState(false);
  const [fetchModalRepo, setFetchModalRepo] = useState<RepoRow | null>(null);
  const [redisStatus, setRedisStatus] = useState<RedisStatus>(null);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const data = await handleApi<{ redis: 'ok' | 'down' | 'not_configured' }>(
        '/sync/status'
      );
      setRedisStatus(data?.redis ?? 'not_configured');
    } catch {
      setRedisStatus('down');
    }
  }, []);

  useEffect(() => {
    fetchSyncStatus();
    const interval = setInterval(fetchSyncStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchSyncStatus]);

  const fetchList = useCallback(async () => {
    loading.true();
    try {
      const data = await handleApi<RepoRow[]>('/repos');
      setList(data || []);
    } catch (e) {
      console.error(e);
      setList([]);
    } finally {
      loading.false();
    }
  }, [loading.false, loading.true]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const onSaved = useCallback(() => {
    modalOpen.false();
    setEditRepoId(null);
    editModalOpen.false();
    fetchList();
  }, [fetchList, modalOpen.false, editModalOpen.false]);

  const onFetchDataSuccess = useCallback(() => {
    setFetchModalRepo(null);
    fetchList();
  }, [fetchList]);

  const openEditModal = useCallback((repo: RepoRow) => {
    setEditRepoId(repo.id);
    editModalOpen.true();
  }, [editModalOpen.true]);

  const redisLabel =
    redisStatus === 'ok'
      ? 'Redis: connected'
      : redisStatus === 'down'
        ? 'Redis: disconnected'
        : redisStatus === 'not_configured'
          ? 'Redis: not configured'
          : 'Redis: checking…';

  return (
    <FlexBox col gap2 fill>
      <FlexBox justifyBetween alignCenter flexWrap="wrap" gap={1}>
        <FlexBox alignCenter gap={2}>
          <Line white fontSize={'24px'}>
            Repositories
          </Line>
          <Tooltip
            title={
              redisStatus === 'ok'
                ? 'Fetch cache is available. Repeated fetches for the same range may be served from cache.'
                : redisStatus === 'down'
                  ? 'Redis is unreachable. Fetch will still work; cache is disabled.'
                  : redisStatus === 'not_configured'
                    ? 'Set REDIS_URL in .env to enable fetch cache.'
                    : 'Checking Redis status…'
            }
          >
            <Chip
              size="small"
              label={redisLabel}
              color={
                redisStatus === 'ok'
                  ? 'success'
                  : redisStatus === 'down'
                    ? 'error'
                    : 'default'
              }
              variant={redisStatus === 'not_configured' ? 'outlined' : 'filled'}
              sx={{ cursor: 'default' }}
            />
          </Tooltip>
        </FlexBox>
        <Button variant="contained" startIcon={<AddRounded />} onClick={modalOpen.true}>
          Add Repository
        </Button>
      </FlexBox>

      <TableContainer sx={{ maxHeight: '70vh' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Repo&apos;s</TableCell>
              <TableCell>created_at</TableCell>
              <TableCell>Last fetched</TableCell>
              <TableCell align="right">Fetch data</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading.value ? (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                  <Line secondary>No repos yet. Add one with Add Repository.</Line>
                </TableCell>
              </TableRow>
            ) : (
              list.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => openEditModal(row)}
                  sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <TableCell>{row.repo_name}</TableCell>
                  <TableCell>
                    {row.created_at
                      ? new Date(row.created_at).toLocaleString()
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {row.last_fetched_at
                      ? new Date(row.last_fetched_at).toLocaleString()
                      : '—'}
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setFetchModalRepo(row)}
                    >
                      Fetch data
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <AddRepoModal open={modalOpen.value} onClose={modalOpen.false} onSaved={onSaved} />
      <EditRepoModal
        open={editModalOpen.value}
        repoId={editRepoId}
        onClose={() => {
          setEditRepoId(null);
          editModalOpen.false();
        }}
        onSaved={onSaved}
      />
      <RepoFetchDataModal
        open={!!fetchModalRepo}
        repoId={fetchModalRepo?.id ?? null}
        repoName={fetchModalRepo?.repo_name ?? ''}
        lastFetchedAt={fetchModalRepo?.last_fetched_at ?? null}
        onClose={() => setFetchModalRepo(null)}
        onSuccess={onFetchDataSuccess}
      />
    </FlexBox>
  );
};

type FetchStatusItem = {
  id: string;
  repo_id: string;
  fetched_at: string;
  state: 'processing' | 'success' | 'failure';
  raw_response?: unknown;
};

const RepoFetchDataModal = ({
  open,
  repoId,
  repoName,
  lastFetchedAt,
  onClose,
  onSuccess,
}: {
  open: boolean;
  repoId: string | null;
  repoName: string;
  lastFetchedAt: string | null | undefined;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [daysPrior, setDaysPrior] = useState(90);
  const [submitting, setSubmitting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [reparseLoading, setReparseLoading] = useState(false);

  const hasLastFetched = Boolean(lastFetchedAt);

  const triggerFetch = useCallback(
    async (days?: number) => {
      if (!repoId) return;
      setSubmitting(true);
      try {
        await handleApi(`/repos/${repoId}/fetch`, {
          method: 'POST',
          data: days != null ? { days_prior: days } : {},
        });
        setProcessing(true);
      } catch (e) {
        console.error(e);
      } finally {
        setSubmitting(false);
      }
    },
    [repoId]
  );

  useEffect(() => {
    if (!open || !processing || !repoId) return;
    const interval = setInterval(async () => {
      try {
        const { items } = await handleApi<{ items: FetchStatusItem[] }>(
          `/repos/${repoId}/fetch-status`
        );
        const anyProcessing = (items || []).some((i) => i.state === 'processing');
        if (!anyProcessing) {
          setProcessing(false);
          onSuccess();
          onClose();
        }
      } catch {
        // keep polling
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [open, processing, repoId, onSuccess, onClose]);

  const handleFetchTillNow = useCallback(() => {
    triggerFetch();
  }, [triggerFetch]);

  const handleFetchWithDays = useCallback(() => {
    triggerFetch(daysPrior);
  }, [triggerFetch, daysPrior]);

  const triggerReparse = useCallback(async () => {
    if (!repoId) return;
    setReparseLoading(true);
    try {
      await handleApi(`/repos/${repoId}/reparse`, { method: 'POST' });
      onSuccess();
    } catch (e) {
      console.error(e);
    } finally {
      setReparseLoading(false);
    }
  }, [repoId, onSuccess]);

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Fetch data — {repoName}</DialogTitle>
      <DialogContent>
        <FlexBox col gap={2} sx={{ pt: 1 }}>
          <Line>
            <strong>Last fetched:</strong>{' '}
            {lastFetchedAt
              ? new Date(lastFetchedAt).toLocaleString()
              : 'Never'}
          </Line>

          {hasLastFetched ? (
            <Line secondary>Fetch new data from last fetched time until now.</Line>
          ) : (
            <>
              <Line secondary>
                Number of days prior to fetch (from today backwards):
              </Line>
              <TextField
                type="number"
                size="small"
                fullWidth
                label="Days prior"
                value={daysPrior}
                onChange={(e) =>
                  setDaysPrior(Math.max(1, parseInt(e.target.value, 10) || 90))
                }
                inputProps={{ min: 1, max: 365 }}
              />
            </>
          )}

          {processing && (
            <FlexBox alignCenter gap={1}>
              <CircularProgress size={20} />
              <Line>Processing… Fetch runs in the background.</Line>
            </FlexBox>
          )}
        </FlexBox>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        {hasLastFetched && (
          <LoadingButton
            loading={reparseLoading}
            variant="outlined"
            onClick={triggerReparse}
          >
            Re-parse
          </LoadingButton>
        )}
        {hasLastFetched ? (
          <LoadingButton
            loading={submitting || processing}
            variant="contained"
            onClick={handleFetchTillNow}
          >
            Fetch till now
          </LoadingButton>
        ) : (
          <LoadingButton
            loading={submitting || processing}
            variant="contained"
            onClick={handleFetchWithDays}
          >
            Fetch
          </LoadingButton>
        )}
      </DialogActions>
    </Dialog>
  );
};

const AddRepoModal = ({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const tokens = useEasyState<TokenOption[]>([]);
  const tokenId = useEasyState('');
  const orgOptions = useEasyState<OrgOption[]>([]);
  const orgName = useEasyState('');
  const repoOptions = useEasyState<OrgRepo[]>([]);
  const repoName = useEasyState('');
  const cfrType = useEasyState<'CI-CD' | 'PR_MERGE'>('CI-CD');
  const workflowOptions = useEasyState<WorkflowOption[]>([]);
  const workflowFile = useEasyState('');
  const devBranch = useEasyState('');
  const stageBranch = useEasyState('');
  const prodBranch = useEasyState('');
  const branchOptions = useEasyState<string[]>([]);
  const loadingBranches = useBoolState(false);
  const saving = useBoolState(false);
  const error = useEasyState('');
  const loadingOrgs = useBoolState(false);
  const loadingRepos = useBoolState(false);
  const loadingWorkflows = useBoolState(false);

  const selectedToken = tokens.value.find((t) => t.id === tokenId.value);
  const isGitHub = selectedToken?.type === 'github';

  // Load tokens when modal opens
  useEffect(() => {
    if (!open) return;
    handleApi<TokenOption[]>('/tokens')
      .then((data) => tokens.set(data || []))
      .catch(() => tokens.set([]));
  }, [open, tokens.set]);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      tokenId.set('');
      orgOptions.set([]);
      orgName.set('');
      repoOptions.set([]);
      repoName.set('');
      cfrType.set('CI-CD');
      workflowOptions.set([]);
      workflowFile.set('');
      devBranch.set('');
      stageBranch.set('');
      prodBranch.set('');
      branchOptions.set([]);
      error.set('');
    }
  }, [open]);

  // Fetch branches when repo is selected (GitHub)
  useEffect(() => {
    if (
      !open ||
      !tokenId.value ||
      !orgName.value.trim() ||
      !repoName.value ||
      !isGitHub
    ) {
      branchOptions.set([]);
      devBranch.set('');
      stageBranch.set('');
      prodBranch.set('');
      return;
    }
    loadingBranches.true();
    handleApi<string[]>(
      `/sync/repo-branches?token_id=${tokenId.value}&org_name=${encodeURIComponent(orgName.value.trim())}&repo_name=${encodeURIComponent(repoName.value)}`
    )
      .then((data) => branchOptions.set(data || []))
      .catch(() => branchOptions.set([]))
      .finally(() => loadingBranches.false());
  }, [
    open,
    tokenId.value,
    orgName.value,
    repoName.value,
    isGitHub,
    loadingBranches.false,
    loadingBranches.true,
    branchOptions.set,
    devBranch.set,
    stageBranch.set,
    prodBranch.set,
  ]);

  // Fetch organisations for the selected GitHub token
  useEffect(() => {
    if (!open || !tokenId.value || !isGitHub) {
      orgOptions.set([]);
      orgName.set('');
      return;
    }
    orgName.set('');
    repoOptions.set([]);
    repoName.set('');
    loadingOrgs.true();
    handleApi<OrgOption[]>(`/sync/user-orgs?token_id=${tokenId.value}`)
      .then((data) => orgOptions.set(data || []))
      .catch(() => orgOptions.set([]))
      .finally(() => loadingOrgs.false());
  }, [open, tokenId.value, isGitHub, loadingOrgs.false, loadingOrgs.true, orgName.set, orgOptions.set, repoName.set, repoOptions.set]);

  // Fetch org repos when token (github) + org name available (debounced)
  useEffect(() => {
    if (!open || !tokenId.value || !orgName.value.trim() || !isGitHub) {
      repoOptions.set([]);
      repoName.set('');
      return;
    }
    const t = setTimeout(() => {
      loadingRepos.true();
      handleApi<OrgRepo[]>(`/sync/org-repos?token_id=${tokenId.value}&org_name=${encodeURIComponent(orgName.value.trim())}`)
        .then((data) => {
          repoOptions.set(data || []);
          repoName.set('');
        })
        .catch(() => repoOptions.set([]))
        .finally(() => loadingRepos.false());
    }, 400);
    return () => clearTimeout(t);
  }, [open, tokenId.value, orgName.value, isGitHub, loadingRepos.false, loadingRepos.true, repoName.set, repoOptions.set]);

  // Fetch workflows when CI-CD + repo selected
  useEffect(() => {
    if (
      !open ||
      cfrType.value !== 'CI-CD' ||
      !tokenId.value ||
      !orgName.value.trim() ||
      !repoName.value ||
      !isGitHub
    ) {
      workflowOptions.set([]);
      workflowFile.set('');
      return;
    }
    loadingWorkflows.true();
    handleApi<WorkflowOption[]>(
      `/sync/repo-workflows?token_id=${tokenId.value}&org_name=${encodeURIComponent(orgName.value.trim())}&repo_name=${encodeURIComponent(repoName.value)}`
    )
      .then((data) => {
        workflowOptions.set(data || []);
        workflowFile.set('');
      })
      .catch(() => workflowOptions.set([]))
      .finally(() => loadingWorkflows.false());
  }, [
    open,
    cfrType.value,
    tokenId.value,
    orgName.value,
    repoName.value,
    isGitHub,
    loadingWorkflows.false,
    loadingWorkflows.true,
    workflowFile.set,
    workflowOptions.set,
  ]);

  const handleSubmit = async () => {
    error.set('');
    if (!tokenId.value) {
      error.set('Select a token');
      return;
    }
    if (!orgName.value.trim()) {
      error.set('Organisation name is required');
      return;
    }
    if (!repoName.value) {
      error.set('Select a repository');
      return;
    }
    if (!devBranch.value.trim()) {
      error.set('Dev branch is required');
      return;
    }
    if (cfrType.value === 'CI-CD' && !workflowFile.value) {
      error.set('Select a workflow for CI-CD');
      return;
    }
    saving.true();
    try {
      await handleApi('/repos', {
        method: 'POST',
        data: {
          token_id: tokenId.value,
          repo_name: repoName.value,
          org_name: orgName.value.trim(),
          dev_branch: devBranch.value.trim(),
          stage_branch: stageBranch.value.trim() || null,
          prod_branch: prodBranch.value.trim() || null,
          cfr_type: cfrType.value,
          workflow_file: cfrType.value === 'CI-CD' ? workflowFile.value || null : null,
          pr_merge_config: cfrType.value === 'PR_MERGE' ? {} : null,
        },
      });
      onSaved();
    } catch (e: any) {
      error.set(e?.data?.error || e?.message || 'Failed to add repo');
    } finally {
      saving.false();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Repository</DialogTitle>
      <DialogContent>
        <FlexBox col gap={2} sx={{ pt: 1 }}>
          <FormControl fullWidth>
            <InputLabel>Token</InputLabel>
            <Select
              value={tokenId.value}
              label="Token"
              onChange={(e) => tokenId.set(e.target.value)}
            >
              {tokens.value.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name} ({t.type})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {isGitHub && tokenId.value ? (
            <FormControl fullWidth disabled={loadingOrgs.value}>
              <InputLabel id="sync-org-label" shrink>Organisation</InputLabel>
              <Select
                labelId="sync-org-label"
                value={orgName.value}
                label="Organisation"
                onChange={(e) => orgName.set(e.target.value)}
                displayEmpty
                renderValue={(v) =>
                  v ? v : loadingOrgs.value ? 'Loading organisations...' : 'Select organisation'
                }
              >
                {loadingOrgs.value ? (
                  <MenuItem disabled value="">
                    <FlexBox alignCenter gap={1}>
                      <CircularProgress size={16} />
                      Loading organisations...
                    </FlexBox>
                  </MenuItem>
                ) : orgOptions.value.length === 0 ? (
                  <MenuItem disabled value="">
                    No organisations found (token may need read:org scope)
                  </MenuItem>
                ) : (
                  orgOptions.value.map((o) => (
                    <MenuItem key={o.id} value={o.login}>
                      {o.login}
                    </MenuItem>
                  ))
                )}
              </Select>
              {loadingOrgs.value && (
                <Line tiny secondary sx={{ mt: 0.5 }}>Loading organisations...</Line>
              )}
              {!loadingOrgs.value && orgOptions.value.length === 0 && (
                <Line tiny secondary sx={{ mt: 0.5 }}>
                  No organisations found. Ensure your PAT has read:org scope. Use the field below to type an org or user name.
                </Line>
              )}
            </FormControl>
          ) : null}
          {(!isGitHub || !tokenId.value || (isGitHub && !loadingOrgs.value && orgOptions.value.length === 0)) && (
            <TextField
              fullWidth
              label="Organisation or user name"
              value={orgName.value}
              onChange={(e) => orgName.set(e.target.value)}
              placeholder="e.g. my-org or username"
              disabled={isGitHub && loadingOrgs.value}
            />
          )}

          <FormControl fullWidth disabled={!isGitHub || !orgName.value.trim() || loadingRepos.value}>
            <InputLabel id="sync-repo-name-label" shrink>Repo Name</InputLabel>
            <Select
              labelId="sync-repo-name-label"
              value={repoName.value}
              label="Repo Name"
              onChange={(e) => repoName.set(e.target.value)}
              displayEmpty
              renderValue={(v) => (v ? v : loadingRepos.value ? 'Loading repos...' : 'Select repository')}
            >
              {loadingRepos.value ? (
                <MenuItem disabled value="">
                  <FlexBox alignCenter gap={1}>
                    <CircularProgress size={16} />
                    Loading repos...
                  </FlexBox>
                </MenuItem>
              ) : repoOptions.value.length === 0 ? (
                <MenuItem disabled value="">
                  Couldn&apos;t find any repos
                </MenuItem>
              ) : (
                repoOptions.value.map((r) => (
                  <MenuItem key={r.id} value={r.name}>
                    {r.full_name}
                  </MenuItem>
                ))
              )}
            </Select>
            {loadingRepos.value && (
              <Line tiny secondary sx={{ mt: 0.5 }}>Loading repos...</Line>
            )}
            {!isGitHub && tokenId.value && !loadingRepos.value && (
              <Line tiny secondary sx={{ mt: 0.5 }}>Org/repo list only available for GitHub tokens</Line>
            )}
            {isGitHub && orgName.value.trim() && !loadingRepos.value && repoOptions.value.length === 0 && (
              <Line tiny secondary sx={{ mt: 0.5 }}>Couldn&apos;t find any repos for this organisation</Line>
            )}
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>For Change Failure Rate I want to monitor</InputLabel>
            <Select
              value={cfrType.value}
              label="For Change Failure Rate I want to monitor"
              onChange={(e) => cfrType.set(e.target.value as 'CI-CD' | 'PR_MERGE')}
            >
              {CFR_TYPES.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {cfrType.value === 'CI-CD' && (
            <FormControl
              fullWidth
              disabled={!repoName.value || loadingWorkflows.value}
            >
              <InputLabel id="sync-workflow-label" shrink>Workflow</InputLabel>
              <Select
                labelId="sync-workflow-label"
                value={workflowFile.value}
                label="Workflow"
                onChange={(e) => workflowFile.set(e.target.value)}
                displayEmpty
                renderValue={(v) =>
                  v ? v : loadingWorkflows.value ? 'Loading workflows...' : 'Select workflow'
                }
              >
                {loadingWorkflows.value ? (
                  <MenuItem disabled value="">
                    <FlexBox alignCenter gap={1}>
                      <CircularProgress size={16} />
                      Loading workflows...
                    </FlexBox>
                  </MenuItem>
                ) : workflowOptions.value.length === 0 ? (
                  <MenuItem disabled value="">
                    Couldn&apos;t find any workflows
                  </MenuItem>
                ) : (
                  workflowOptions.value.map((w) => (
                    <MenuItem key={w.id} value={w.path}>
                      {w.name} ({w.path})
                    </MenuItem>
                  ))
                )}
              </Select>
              {loadingWorkflows.value && (
                <Line tiny secondary sx={{ mt: 0.5 }}>Loading workflows...</Line>
              )}
            </FormControl>
          )}

          <Autocomplete
            fullWidth
            freeSolo
            options={branchOptions.value}
            value={devBranch.value}
            onChange={(_, v) => devBranch.set(typeof v === 'string' ? v : v ?? '')}
            onInputChange={(_, v) => devBranch.set(v)}
            loading={loadingBranches.value}
            disabled={!repoName.value || loadingBranches.value}
            renderInput={(params) => (
              <TextField {...params} label="Dev Branch" required />
            )}
          />
          <Autocomplete
            fullWidth
            freeSolo
            options={branchOptions.value}
            value={stageBranch.value}
            onChange={(_, v) => stageBranch.set(typeof v === 'string' ? v : v ?? '')}
            onInputChange={(_, v) => stageBranch.set(v)}
            loading={loadingBranches.value}
            disabled={!repoName.value || loadingBranches.value}
            renderInput={(params) => (
              <TextField {...params} label="Stage Branch (optional)" />
            )}
          />
          <Autocomplete
            fullWidth
            freeSolo
            options={branchOptions.value}
            value={prodBranch.value}
            onChange={(_, v) => prodBranch.set(typeof v === 'string' ? v : v ?? '')}
            onInputChange={(_, v) => prodBranch.set(v)}
            loading={loadingBranches.value}
            disabled={!repoName.value || loadingBranches.value}
            renderInput={(params) => (
              <TextField {...params} label="Production Branch (optional)" />
            )}
          />

          {error.value && (
            <Line error small>
              {error.value}
            </Line>
          )}
        </FlexBox>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <LoadingButton loading={saving.value} variant="contained" onClick={handleSubmit}>
          Add Repo
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
};

const EditRepoModal = ({
  open,
  repoId,
  onClose,
  onSaved,
}: {
  open: boolean;
  repoId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [repo, setRepo] = useState<RepoRow | null>(null);
  const loadRepo = useBoolState(false);
  const tokens = useEasyState<TokenOption[]>([]);
  const tokenId = useEasyState('');
  const cfrType = useEasyState<'CI-CD' | 'PR_MERGE'>('CI-CD');
  const workflowOptions = useEasyState<WorkflowOption[]>([]);
  const workflowFile = useEasyState('');
  const devBranch = useEasyState('');
  const stageBranch = useEasyState('');
  const prodBranch = useEasyState('');
  const branchOptions = useEasyState<string[]>([]);
  const loadingBranches = useBoolState(false);
  const loadingWorkflows = useBoolState(false);
  const saving = useBoolState(false);
  const error = useEasyState('');

  const selectedToken = tokens.value.find((t) => t.id === tokenId.value);
  const isGitHub = selectedToken?.type === 'github';

  // Load tokens when modal opens
  useEffect(() => {
    if (!open) return;
    handleApi<TokenOption[]>('/tokens')
      .then((data) => tokens.set(data || []))
      .catch(() => tokens.set([]));
  }, [open, tokens.set]);

  // Fetch repo when modal opens with repoId
  useEffect(() => {
    if (!open || !repoId) {
      setRepo(null);
      return;
    }
    setRepo(null);
    loadRepo.true();
    handleApi<RepoRow>(`/repos/${repoId}`)
      .then((data) => {
        setRepo(data);
        tokenId.set(data.token_id || '');
        cfrType.set((data.cfr_type === 'PR_MERGE' ? 'PR_MERGE' : 'CI-CD') as 'CI-CD' | 'PR_MERGE');
        workflowFile.set(data.workflow_file || '');
        devBranch.set(data.dev_branch || '');
        stageBranch.set(data.stage_branch || '');
        prodBranch.set(data.prod_branch || '');
      })
      .catch(() => setRepo(null))
      .finally(() => loadRepo.false());
  }, [open, repoId, loadRepo.false, loadRepo.true, tokenId.set, cfrType.set, workflowFile.set, devBranch.set, stageBranch.set, prodBranch.set]);

  // Fetch workflows when repo loaded and CI-CD
  useEffect(() => {
    if (
      !open ||
      !repo ||
      cfrType.value !== 'CI-CD' ||
      !tokenId.value ||
      !repo.org_name ||
      !repo.repo_name ||
      !isGitHub
    ) {
      workflowOptions.set([]);
      return;
    }
    loadingWorkflows.true();
    handleApi<WorkflowOption[]>(
      `/sync/repo-workflows?token_id=${tokenId.value}&org_name=${encodeURIComponent(repo.org_name.trim())}&repo_name=${encodeURIComponent(repo.repo_name)}`
    )
      .then((data) => workflowOptions.set(data || []))
      .catch(() => workflowOptions.set([]))
      .finally(() => loadingWorkflows.false());
  }, [open, repo, cfrType.value, tokenId.value, isGitHub, loadingWorkflows.false, loadingWorkflows.true, workflowOptions.set]);

  // Fetch branches when repo loaded
  useEffect(() => {
    if (!open || !repo || !tokenId.value || !repo.org_name || !repo.repo_name || !isGitHub) {
      branchOptions.set([]);
      return;
    }
    loadingBranches.true();
    handleApi<string[]>(
      `/sync/repo-branches?token_id=${tokenId.value}&org_name=${encodeURIComponent(repo.org_name.trim())}&repo_name=${encodeURIComponent(repo.repo_name)}`
    )
      .then((data) => branchOptions.set(data || []))
      .catch(() => branchOptions.set([]))
      .finally(() => loadingBranches.false());
  }, [open, repo, tokenId.value, isGitHub, loadingBranches.false, loadingBranches.true, branchOptions.set]);

  const handleSubmit = async () => {
    if (!repoId) return;
    error.set('');
    if (!tokenId.value) {
      error.set('Select a token');
      return;
    }
    if (!devBranch.value.trim()) {
      error.set('Dev branch is required');
      return;
    }
    if (cfrType.value === 'CI-CD' && !workflowFile.value) {
      error.set('Select a workflow for CI-CD');
      return;
    }
    saving.true();
    try {
      await handleApi(`/repos/${repoId}`, {
        method: 'PATCH',
        data: {
          token_id: tokenId.value,
          dev_branch: devBranch.value.trim(),
          stage_branch: stageBranch.value.trim() || null,
          prod_branch: prodBranch.value.trim() || null,
          cfr_type: cfrType.value,
          workflow_file: cfrType.value === 'CI-CD' ? workflowFile.value || null : null,
          pr_merge_config: cfrType.value === 'PR_MERGE' ? {} : null,
        },
      });
      onSaved();
    } catch (e: any) {
      error.set(e?.data?.error || e?.message || 'Failed to save');
    } finally {
      saving.false();
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Repository</DialogTitle>
      <DialogContent>
        <FlexBox col gap={2} sx={{ pt: 1 }}>
          {loadRepo.value ? (
            <FlexBox justifyCenter py={3}>
              <CircularProgress />
            </FlexBox>
          ) : !repo ? (
            <Line secondary>Could not load repo.</Line>
          ) : (
            <>
              <TextField
                fullWidth
                label="Organisation / Repo"
                value={repo.org_name ? `${repo.org_name} / ${repo.repo_name}` : repo.repo_name}
                InputProps={{ readOnly: true }}
                size="small"
              />

              <FormControl fullWidth>
                <InputLabel>Token</InputLabel>
                <Select
                  value={tokenId.value}
                  label="Token"
                  onChange={(e) => tokenId.set(e.target.value)}
                >
                  {tokens.value.map((t) => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.name} ({t.type})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel>For Change Failure Rate I want to monitor</InputLabel>
                <Select
                  value={cfrType.value}
                  label="For Change Failure Rate I want to monitor"
                  onChange={(e) => cfrType.set(e.target.value as 'CI-CD' | 'PR_MERGE')}
                >
                  {CFR_TYPES.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {cfrType.value === 'CI-CD' && (
                <FormControl fullWidth disabled={loadingWorkflows.value}>
                  <InputLabel id="edit-workflow-label" shrink>Workflow</InputLabel>
                  <Select
                    labelId="edit-workflow-label"
                    value={workflowFile.value}
                    label="Workflow"
                    onChange={(e) => workflowFile.set(e.target.value)}
                    displayEmpty
                    renderValue={(v) =>
                      v ? v : loadingWorkflows.value ? 'Loading workflows...' : 'Select workflow'
                    }
                  >
                    {loadingWorkflows.value ? (
                      <MenuItem disabled value="">
                        <FlexBox alignCenter gap={1}>
                          <CircularProgress size={16} />
                          Loading workflows...
                        </FlexBox>
                      </MenuItem>
                    ) : workflowOptions.value.length === 0 ? (
                      <MenuItem disabled value="">No workflows found</MenuItem>
                    ) : (
                      workflowOptions.value.map((w) => (
                        <MenuItem key={w.id} value={w.path}>
                          {w.name} ({w.path})
                        </MenuItem>
                      ))
                    )}
                  </Select>
                </FormControl>
              )}

              <Autocomplete
                fullWidth
                freeSolo
                options={branchOptions.value}
                value={devBranch.value}
                onChange={(_, v) => devBranch.set(typeof v === 'string' ? v : v ?? '')}
                onInputChange={(_, v) => devBranch.set(v)}
                loading={loadingBranches.value}
                disabled={loadingBranches.value}
                renderInput={(params) => (
                  <TextField {...params} label="Dev Branch" required />
                )}
              />
              <Autocomplete
                fullWidth
                freeSolo
                options={branchOptions.value}
                value={stageBranch.value}
                onChange={(_, v) => stageBranch.set(typeof v === 'string' ? v : v ?? '')}
                onInputChange={(_, v) => stageBranch.set(v)}
                loading={loadingBranches.value}
                disabled={loadingBranches.value}
                renderInput={(params) => (
                  <TextField {...params} label="Stage Branch (optional)" />
                )}
              />
              <Autocomplete
                fullWidth
                freeSolo
                options={branchOptions.value}
                value={prodBranch.value}
                onChange={(_, v) => prodBranch.set(typeof v === 'string' ? v : v ?? '')}
                onInputChange={(_, v) => prodBranch.set(v)}
                loading={loadingBranches.value}
                disabled={loadingBranches.value}
                renderInput={(params) => (
                  <TextField {...params} label="Production Branch (optional)" />
                )}
              />

              {error.value && (
                <Line error small>
                  {error.value}
                </Line>
              )}
            </>
          )}
        </FlexBox>
      </DialogContent>
      {repo && !loadRepo.value && (
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <LoadingButton loading={saving.value} variant="contained" onClick={handleSubmit}>
            Save
          </LoadingButton>
        </DialogActions>
      )}
    </Dialog>
  );
};
