import { AccessTimeRounded } from '@mui/icons-material';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import { Box, Card, Chip, Divider, Link, Paper, useTheme } from '@mui/material';
import { format } from 'date-fns';
import pluralize from 'pluralize';
import { head } from 'ramda';
import { FC, useCallback, useEffect, useMemo } from 'react';
import { FaExternalLinkAlt } from 'react-icons/fa';

import { EmptyState } from '@/components/EmptyState';
import { FlexBox } from '@/components/FlexBox';
import { MiniLoader } from '@/components/MiniLoader';
import { useOverlayPage } from '@/components/OverlayPageContext';
import Scrollbar from '@/components/Scrollbar';
import { LightTooltip } from '@/components/Shared';
import { SimpleAvatar } from '@/components/SimpleAvatar';
import { Line } from '@/components/Text';
import { TrendsLineChart } from '@/components/TrendsLineChart';
import { FetchState } from '@/constants/ui-states';
import { DeploymentWithIncidentsMenuItem } from '@/content/DoraMetrics/DeploymentWithIncidentsMenuItem';
import { RevertedPrs } from '@/content/PullRequests/PrsReverted';
import { useAuth } from '@/hooks/useAuth';
import { useDoraMetricsGraph } from '@/hooks/useDoraMetricsGraph';
import { useEasyState } from '@/hooks/useEasyState';
import {
  useCurrentDateRangeReactNode,
  useSingleTeamConfig,
  useStateBranchConfig,
  useBranchesForPrFilters
} from '@/hooks/useStateTeamConfig';
import { fetchAllDeploymentsWithIncidents } from '@/slices/dora_metrics';
import { useDispatch, useSelector } from '@/store';
import { PrUser, DeploymentWithIncidents, WorkflowRunInPeriod } from '@/types/resources';
import { getDurationString } from '@/utils/date';
import { formatAsPercent } from '@/utils/stringFormatting';
import { OPEN_IN_NEW_TAB_PROPS } from '@/utils/url';
import { getGHAvatar } from '@/utils/user';

import { IncidentItemIcon } from './IncidentsMenuItem';

import { SubHeader } from '../../components/WrapperComponents';

export type AllIncidentsBodyProps = {
  /** When opened from MTTR card, show MTTR chart/header; otherwise CFR. */
  context?: 'mttr' | 'cfr';
};

export const AllIncidentsBody: FC<AllIncidentsBodyProps> = ({
  context = 'cfr'
}) => {
  const dispatch = useDispatch();
  const { orgId } = useAuth();
  const branches = useStateBranchConfig();
  const { singleTeamId, dates, team, singleTeamProdBranchesConfig } =
    useSingleTeamConfig();
  const { addPage } = useOverlayPage();
  const dateRangeLabel = useCurrentDateRangeReactNode();
  const isMttrContext = context === 'mttr';
  const isLoading = useSelector(
    (s) => s.doraMetrics.requests?.all_deployments === FetchState.REQUEST
  );

  const allDeployments = useSelector(
    (s) => s.doraMetrics.all_deployments || []
  );
  const workflowRunsInPeriod = useSelector(
    (s) => s.doraMetrics.workflow_runs_in_period || []
  ) as WorkflowRunInPeriod[];
  const allPrs = useSelector((s) => s.doraMetrics.summary_prs);
  const revertedPrs = useSelector((s) => s.doraMetrics.revert_prs);
  const branchPayloadForPrFilters = useBranchesForPrFilters();
  const selectedDeploymentId = useEasyState<ID>(null);
  const setSelectedDeploymentId = useCallback(
    (selectedDeployment: DeploymentWithIncidents) => {
      selectedDeploymentId.set(selectedDeployment.id);
    },
    [selectedDeploymentId]
  );

  const selectedDeployment = useMemo(
    () =>
      allDeployments.find(
        (deployment) => deployment.id === selectedDeploymentId.value
      ),
    [allDeployments, selectedDeploymentId]
  );
  const filteredDeployments = useMemo(
    () => allDeployments.filter((deployment) => deployment.incidents.length),
    [allDeployments]
  );
  const incidentRunIds = useMemo(
    () => new Set(allDeployments.map((d) => d.id)),
    [allDeployments]
  );
  const otherWorkflowRuns = useMemo(
    () =>
      workflowRunsInPeriod.filter((run) => !incidentRunIds.has(run.id)),
    [workflowRunsInPeriod, incidentRunIds]
  );
  const totalWorkflowRuns =
    workflowRunsInPeriod.length > 0
      ? workflowRunsInPeriod.length
      : filteredDeployments.length;
  const selectedOtherRun = useMemo(
    () =>
      otherWorkflowRuns.find((r) => r.id === selectedDeploymentId.value),
    [otherWorkflowRuns, selectedDeploymentId.value]
  );

  const fetchAllIncidentDetails = useCallback(() => {
    if (!singleTeamId || !dates.start || !dates.end) return;

    dispatch(
      fetchAllDeploymentsWithIncidents({
        team_id: singleTeamId,
        from_date: dates.start,
        to_date: dates.end,
        org_id: orgId,
        ...branchPayloadForPrFilters
      })
    );
  }, [
    branchPayloadForPrFilters,
    dates.end,
    dates.start,
    dispatch,
    orgId,
    singleTeamId
  ]);

  useEffect(() => {
    fetchAllIncidentDetails();
  }, [
    branches,
    dates.end,
    dates.start,
    dispatch,
    fetchAllIncidentDetails,
    orgId,
    singleTeamId,
    singleTeamProdBranchesConfig
  ]);

  const { trendsSeriesMap } = useDoraMetricsGraph();
  const cfrTrendData = head(
    trendsSeriesMap?.changeFailureRateTrends || []
  )?.data?.some((s) => s?.y);
  const mttrTrendData = head(
    trendsSeriesMap?.meanTimeToRestoreTrends || []
  )?.data?.some((s) => s?.y);
  const isTrendSeriesAvailable = isMttrContext ? mttrTrendData : cfrTrendData;

  if (isLoading) return <MiniLoader label="Fetching incidents ..." />;
  const hasDeploymentsWithIncidents = allDeployments.length > 0;
  const hasWorkflowRunsInPeriod = workflowRunsInPeriod.length > 0;
  if (!hasDeploymentsWithIncidents && !hasWorkflowRunsInPeriod)
    return (
      <EmptyState>
        <Box>
          No workflow runs found for <Line color="info">{team.name}</Line> from{' '}
          {dateRangeLabel}.
        </Box>
        <Line small sx={{ mt: 2 }}>
          Run <Line color="info" bold>Fetch data</Line> for your team&apos;s repos on the{' '}
          <Link href="/sync" color="info" sx={{ fontWeight: 600 }}>
            Sync
          </Link>{' '}
          page to populate workflow runs. Incidents (for{' '}
          {isMttrContext ? 'MTTR / CFR' : 'CFR'}) are derived from runs with
          conclusion = failure followed by a run with conclusion = success.
        </Line>
      </EmptyState>
    );

  return (
    <FlexBox col gap1 flex1>
      <Card sx={{ my: 2, pt: 2, px: 2, pb: 2 }}>
        <SubHeader big>
          {isMttrContext
            ? 'Mean time to recovery, across weeks'
            : 'Change failure rate, across weeks'}
        </SubHeader>
        <Divider sx={{ mt: 2, mb: isTrendSeriesAvailable ? 4 : 2 }} />
        {isTrendSeriesAvailable ? (
          <FlexBox fullWidth height={'300px'} alignCenter justifyCenter p={1}>
            <TrendsLineChart
              series={
                isMttrContext
                  ? trendsSeriesMap.meanTimeToRestoreTrends
                  : trendsSeriesMap.changeFailureRateTrends
              }
              yFormat={isMttrContext ? getDurationString : formatAsPercent}
              axisLeft={{
                format: isMttrContext ? getDurationString : formatAsPercent
              }}
            />
          </FlexBox>
        ) : (
          <Line>Not enough data to show trends.</Line>
        )}
      </Card>
      <FlexBox col gap1>
        {Boolean(revertedPrs.length) && (
          <>
            <FlexBox gap={2}>
              <RevertedPrs
                id="process-body-reverted-prs"
                prs={allPrs}
                revertedPrs={revertedPrs}
                titleProps={{ big: true, mb: 1 }}
                prUpdateCallback={fetchAllIncidentDetails}
              />
            </FlexBox>
            <Divider />
          </>
        )}
        {hasDeploymentsWithIncidents && (
          <Line>
            Out of{' '}
            <Line
              small
              medium
              pointer
              onClick={() => {
                addPage({
                  page: {
                    title: 'Deployments insights',
                    ui: 'deployment_freq'
                  }
                });
              }}
              color="info"
            >
              <Line underline bold>
                {totalWorkflowRuns} total workflow{' '}
                {pluralize('run', totalWorkflowRuns)}
              </Line>
            </Line>{' '}
            from {dateRangeLabel},{' '}
            {filteredDeployments.length}{' '}
            {pluralize('run', filteredDeployments.length)} have led to possible
            incidents.
          </Line>
        )}
      </FlexBox>

      {(filteredDeployments.length > 0 || otherWorkflowRuns.length > 0) && (
        <>
          <Divider />
          <FlexBox gap1 flex1 fullWidth component={Paper} minHeight="75vh">
            <FlexBox col>
              <FlexBox flexGrow={1}>
                <Scrollbar autoHeight autoHeightMin="100%">
                  <FlexBox col gap1 p={1} flexGrow={1}>
                    {filteredDeployments?.map((deployment) => (
                      <DeploymentWithIncidentsMenuItem
                        deployment={deployment}
                        key={deployment.id}
                        onSelect={setSelectedDeploymentId}
                        selected={
                          selectedDeploymentId.value === deployment.id
                        }
                      />
                    ))}
                    {otherWorkflowRuns.length > 0 && (
                      <>
                        <Line small sx={{ mt: 1, mb: 0.5 }} color="text.secondary">
                          {filteredDeployments.length > 0
                            ? 'Other workflow runs'
                            : 'Workflow runs (none led to incidents)'}
                        </Line>
                        {otherWorkflowRuns.map((run) => (
                          <WorkflowRunMenuItem
                            run={run}
                            key={run.id}
                            selected={selectedDeploymentId.value === run.id}
                            onSelect={() =>
                              selectedDeploymentId.set(run.id)
                            }
                          />
                        ))}
                      </>
                    )}
                  </FlexBox>
                </Scrollbar>
              </FlexBox>
            </FlexBox>
            <Divider orientation="vertical" />
            <SelectedIncidentDetails
              deploymentDetails={selectedDeployment}
              selectedOtherRun={selectedOtherRun}
            />
          </FlexBox>
        </>
      )}
    </FlexBox>
  );
};

export type WorkflowRunDisplay = {
  run_id: number | null;
  name: string | null;
  conclusion: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  html_url: string | null;
  head_branch: string | null;
};

export type DeploymentWithIncidentsAndWorkflowRun = DeploymentWithIncidents & {
  workflow_run?: WorkflowRunDisplay;
  recovery_workflow_run?: WorkflowRunDisplay;
};

const WorkflowRunMenuItem: FC<{
  run: WorkflowRunInPeriod;
  selected: boolean;
  onSelect: () => void;
}> = ({ run, selected, onSelect }) => {
  const theme = useTheme();
  return (
    <FlexBox
      component={Card}
      p={1}
      width="280px"
      pointer
      sx={{
        bgcolor: selected ? theme.colors.info.lighter : undefined,
        transition: 'background-color 0.2s',
        boxShadow: selected ? `0 0 0 3px ${theme.colors.info.main}` : undefined,
        ':hover': { bgcolor: theme.colors.info.lighter }
      }}
      onClick={onSelect}
    >
      <FlexBox col gap={0.5}>
        <FlexBox alignCenter gap={1} flexWrap="wrap">
          <Line tiny bold>
            {run.name ?? 'Workflow'}{' '}
            {run.run_id != null && (
              <Line component="span" color="secondary">
                (#{run.run_id})
              </Line>
            )}
          </Line>
          {run.html_url && (
            <Link href={run.html_url} {...OPEN_IN_NEW_TAB_PROPS}>
              <Line tiny sx={{ '&:hover': { color: 'info.main' } }}>
                <FaExternalLinkAlt />
              </Line>
            </Link>
          )}
        </FlexBox>
        <FlexBox alignCenter gap={1} flexWrap="wrap">
          {run.head_branch && (
            <Chip size="small" label={run.head_branch} />
          )}
          <Chip
            size="small"
            color={run.conclusion === 'success' ? 'success' : 'error'}
            label={run.conclusion ?? '—'}
          />
          <Line tiny>
            {run.created_at
              ? format(new Date(run.created_at), 'do MMM - HH:mm')
              : '—'}
          </Line>
        </FlexBox>
      </FlexBox>
    </FlexBox>
  );
};

const WorkflowRunCard: FC<{
  title: string;
  run: WorkflowRunDisplay;
  runDurationSeconds?: number;
  borderColor?: string;
}> = ({ title, run, runDurationSeconds, borderColor }) => {
  const theme = useTheme();
  return (
    <FlexBox
      gap={2}
      alignCenter
      component={Card}
      p={2}
      sx={{ border: `2px solid ${borderColor ?? theme.colors.info.main}` }}
    >
      <FlexBox col gap={1} fullWidth>
        <Line medium bold color="inherit">
          {title}
        </Line>
        <FlexBox alignCenter gap={1} flexWrap="wrap">
          <Line medium>
            {run.name ?? 'Workflow'}{' '}
            {run.run_id != null && (
              <Line component="span" color="secondary">
                (#{run.run_id})
              </Line>
            )}
          </Line>
          {run.head_branch && (
            <Chip size="small" label={`Branch: ${run.head_branch}`} />
          )}
          <Chip
            size="small"
            color={run.conclusion === 'success' ? 'success' : 'error'}
            label={`Conclusion: ${run.conclusion ?? '—'}`}
          />
          {run.status != null && run.status !== '' && (
            <Chip size="small" label={`Status: ${run.status}`} />
          )}
        </FlexBox>
        <FlexBox alignCenter gap={2} flexWrap="wrap">
          <Line small>
            Created: {format(new Date(run.created_at), 'do MMM yyyy, HH:mm')}
          </Line>
          <Line small>
            Updated: {format(new Date(run.updated_at), 'do MMM yyyy, HH:mm')}
          </Line>
          {runDurationSeconds != null && runDurationSeconds >= 0 && (
            <FlexBox alignCenter gap={1 / 4}>
              <AccessTimeRounded fontSize="inherit" />
              <Line small>Duration: {getDurationString(runDurationSeconds)}</Line>
            </FlexBox>
          )}
        </FlexBox>
        {run.html_url && (
          <Link href={run.html_url} {...OPEN_IN_NEW_TAB_PROPS}>
            <Line medium white sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              View workflow run <FaExternalLinkAlt />
            </Line>
          </Link>
        )}
      </FlexBox>
    </FlexBox>
  );
};

const SelectedIncidentDetails: FC<{
  deploymentDetails: DeploymentWithIncidentsAndWorkflowRun | null;
  selectedOtherRun?: WorkflowRunInPeriod | null;
}> = ({ deploymentDetails, selectedOtherRun }) => {
  const theme = useTheme();

  const incidents = deploymentDetails?.incidents;
  const isAssigned =
    deploymentDetails?.event_actor?.username ||
    deploymentDetails?.event_actor?.linked_user;
  const workflowRun = deploymentDetails?.workflow_run;
  const recoveryRun = deploymentDetails?.recovery_workflow_run;
  const timeToRecoverySeconds = useMemo(() => {
    if (!incidents?.length || !recoveryRun) return null;
    const creation = incidents[0]?.creation_date;
    const resolved = incidents[0]?.resolved_date;
    if (!creation || !resolved) return null;
    const created = new Date(creation).getTime();
    const resolvedTime = new Date(resolved).getTime();
    return Math.round((resolvedTime - created) / 1000);
  }, [incidents, recoveryRun]);

  if (selectedOtherRun && !deploymentDetails) {
    const runAsDisplay: WorkflowRunDisplay = {
      run_id: selectedOtherRun.run_id,
      name: selectedOtherRun.name,
      conclusion: selectedOtherRun.conclusion,
      status: selectedOtherRun.status,
      created_at: selectedOtherRun.created_at ?? '',
      updated_at: selectedOtherRun.updated_at ?? selectedOtherRun.created_at ?? '',
      html_url: selectedOtherRun.html_url,
      head_branch: selectedOtherRun.head_branch
    };
    return (
      <FlexBox col p={2} fullWidth gap1>
        <Line bold>Workflow run (no incident)</Line>
        <Line small color="text.secondary">
          This run did not lead to an incident.
        </Line>
        <WorkflowRunCard
          title="Workflow run"
          run={runAsDisplay}
          borderColor={theme.palette.success.main}
        />
      </FlexBox>
    );
  }

  if (!deploymentDetails)
    return (
      <FlexBox col p={4} fullWidth>
        <Line big white medium textAlign="center">
          Select a run on the left
        </Line>
        <Line white medium textAlign="center">
          to view details (incident runs or other workflow runs)
        </Line>
      </FlexBox>
    );

  return (
    <FlexBox
      col
      p={2}
      fullWidth
      gap1
      sx={{
        wordBreak: 'break-word'
      }}
    >
      <Line bold>Workflow run data</Line>
      {workflowRun ? (
        <FlexBox col gap={1}>
          <WorkflowRunCard
            title="Failure run"
            run={workflowRun}
            runDurationSeconds={deploymentDetails.run_duration}
            borderColor={theme.palette.error.main}
          />
          {timeToRecoverySeconds != null && timeToRecoverySeconds >= 0 && (
            <FlexBox alignCenter gap={1} p={1.5} component={Card}>
              <AccessTimeRounded fontSize="small" />
              <Line medium>
                Time to recovery: {getDurationString(timeToRecoverySeconds)}
              </Line>
            </FlexBox>
          )}
          {recoveryRun && (
            <WorkflowRunCard
              title="Recovery run (next success)"
              run={recoveryRun}
              borderColor={theme.palette.success.main}
            />
          )}
        </FlexBox>
      ) : (
        <FlexBox
          gap={2}
          alignCenter
          component={Card}
          p={2}
          sx={{ border: `2px solid ${theme.colors.info.main}` }}
        >
          <>
            {Boolean(deploymentDetails.pr_count) && (
              <FlexBox
                alignCenter
                gap={1 / 4}
                title={`This deployment included ${deploymentDetails.pr_count} ${
                  deploymentDetails.pr_count === 1 ? 'PR' : 'PRs'
                }`}
                tooltipPlacement="left"
              >
                <BugReportOutlinedIcon fontSize="inherit" />
                <Line small>
                  {deploymentDetails.pr_count}{' '}
                  {deploymentDetails.pr_count === 1 ? 'PR' : 'PRs'}
                </Line>
              </FlexBox>
            )}
            <FlexBox alignCenter gap={1 / 2} flexGrow={1}>
              <Line medium>
                Run on{' '}
                {format(
                  new Date(deploymentDetails.conducted_at),
                  'do, MMM - hh:mmaaa'
                )}
              </Line>
              <FlexBox flexGrow={1} alignCenter gap1>
                <Line medium>
                  by{' '}
                  {deploymentDetails.event_actor?.linked_user?.name ||
                    `@${deploymentDetails.event_actor?.username ?? ''}`}{' '}
                </Line>
                <Box>
                  <IncidentUserAvatar
                    userDetails={deploymentDetails.event_actor}
                    size={3}
                  />
                </Box>
              </FlexBox>
            </FlexBox>
            <FlexBox gap1 alignCenter>
              <Chip
                size="small"
                label={
                  <FlexBox
                    alignCenter
                    gap={1 / 4}
                    title={`This deployment took ${getDurationString(
                      deploymentDetails.run_duration
                    )} to run`}
                    tooltipPlacement="right"
                  >
                    <AccessTimeRounded fontSize="inherit" />
                    <Line small>
                      {getDurationString(deploymentDetails.run_duration)}
                    </Line>
                  </FlexBox>
                }
              />

              {deploymentDetails.html_url && (
                <Link href={deploymentDetails.html_url} {...OPEN_IN_NEW_TAB_PROPS}>
                  <Line
                    medium
                    white
                    sx={{
                      transform: 'scale(0.9)',
                      transition: 'all 0.2s',
                      ':hover': { color: 'info.main' }
                    }}
                  >
                    <FaExternalLinkAlt />
                  </Line>
                </Link>
              )}
            </FlexBox>
          </>
        </FlexBox>
        )}
      <Divider />
      {incidents.map((incident) => (
        <FlexBox
          key={incident.id}
          justifyBetween
          p={2}
          component={Card}
          col
          gap1
          justifyCenter
        >
          <FlexBox justifyBetween alignCenter>
            <Line bold medium>
              Incident details
            </Line>
            <FlexBox gap={2} alignCenter>
              <Chip
                label={
                  <LightTooltip
                    arrow
                    title={`Assigned to ${
                      incident.assigned_to?.linked_user?.name ||
                      incident.assigned_to?.username ||
                      'No-one'
                    }`}
                  >
                    <Box
                      display="flex"
                      alignItems="center"
                      gap={1}
                      width="100%"
                    >
                      {isAssigned ? (
                        <FlexBox gap1 alignCenter>
                          Assignee{' '}
                          <SimpleAvatar
                            name={
                              incident.assigned_to.linked_user?.name ||
                              incident.assigned_to.username
                            }
                            size={theme.spacing(2.5)}
                            url={incident.assigned_to?.linked_user?.avatar_url}
                          />
                        </FlexBox>
                      ) : (
                        <FlexBox gap1 alignCenter>
                          Unassigned
                        </FlexBox>
                      )}
                    </Box>
                  </LightTooltip>
                }
                variant="filled"
              />
              <Chip
                label={
                  <LightTooltip
                    arrow
                    title={
                      <Box sx={{ textTransform: 'capitalize' }}>
                        {incident.status} on{' '}
                        {format(
                          new Date(
                            incident.resolved_date ||
                              incident.acknowledged_date ||
                              incident.creation_date
                          ),
                          'do MMMM'
                        )}
                      </Box>
                    }
                  >
                    <Box
                      display="flex"
                      alignItems="center"
                      gap={1}
                      width="100%"
                    >
                      <FlexBox
                        gap1
                        alignCenter
                        sx={{ textTransform: 'capitalize' }}
                      >
                        {incident.status}
                        <IncidentItemIcon status={incident.status} />
                      </FlexBox>
                    </Box>
                  </LightTooltip>
                }
                variant="filled"
              />
              <Link href={incident.url} {...OPEN_IN_NEW_TAB_PROPS}>
                <Line
                  sx={{
                    transform: 'scale(0.9)',
                    transition: 'all 0.2s',
                    ':hover': { color: 'info.main' }
                  }}
                  white
                  medium
                >
                  <FaExternalLinkAlt />
                </Line>
              </Link>
            </FlexBox>
          </FlexBox>

          <Divider />

          <FlexBox justifyBetween gap={2}>
            <Line big white medium>
              {incident.title}
            </Line>
          </FlexBox>
          <Line
            tiny
            sx={{
              whiteSpace: 'pre-line'
            }}
          >
            {incident.summary}
          </Line>
        </FlexBox>
      ))}
    </FlexBox>
  );
};

const IncidentUserAvatar: FC<{
  userDetails: PrUser;
  size?: number;
}> = ({ userDetails, size }) => {
  const { org } = useAuth();
  const theme = useTheme();
  const hasGithub = org.integrations.github;
  return (
    <LightTooltip
      arrow
      title={
        <Box>
          <Box>{`@${userDetails.username}`}</Box>
        </Box>
      }
    >
      <FlexBox alignCenter gap1>
        <Box
          component={Link}
          href={`https://github.com/${userDetails.username}`}
          target="_blank"
          fontWeight={500}
          display="flex"
          alignItems="center"
        >
          <SimpleAvatar
            url={hasGithub ? getGHAvatar(userDetails.username) : undefined}
            name={userDetails.linked_user?.name || userDetails.username}
            size={theme.spacing(size || 2.5)}
          />
        </Box>
      </FlexBox>
    </LightTooltip>
  );
};
