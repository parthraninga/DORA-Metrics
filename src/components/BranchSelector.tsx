import {
  CheckCircleOutlineRounded,
  KeyboardArrowDownRounded,
  RadioButtonUncheckedRounded
} from '@mui/icons-material';
import {
  Typography,
  Box,
  alpha,
  Divider,
  useTheme,
  Popover
} from '@mui/material';
import { FC, useCallback, useRef } from 'react';

import GitBranch from '@/assets/git-merge-line.svg';
import { HeaderBtn } from '@/components/HeaderBtn';
import { LightTooltip } from '@/components/Shared';
import { TeamProductionBranchSelector } from '@/components/TeamProductionBranchSelector';
import { useModal } from '@/contexts/ModalContext';
import { useBoolState } from '@/hooks/useEasyState';
import { useStateTeamConfig } from '@/hooks/useStateTeamConfig';
import { appSlice } from '@/slices/app';
import { useDispatch, useSelector } from '@/store';
import { brandColors } from '@/theme/schemes/theme';
import { ActiveBranchMode } from '@/types/resources';

import { MiniButton } from './MiniButton';

export const BranchSelector: FC = () => {
  const theme = useTheme();
  const elRef = useRef(null);
  const open = useBoolState(false);
  const dispatch = useDispatch();
  const { addModal, closeModal } = useModal();
  const { singleTeamId } = useStateTeamConfig();
  const mode = useSelector((state) => state.app.branchMode);
  const teamReposProdBranchArray = useSelector(
    (state) => state.app.teamsProdBranchMap?.[singleTeamId]
  );

  const isProdMode = mode === ActiveBranchMode.PROD || mode === ActiveBranchMode.ALL || mode === ActiveBranchMode.CUSTOM;
  const isStageMode = mode === ActiveBranchMode.STAGE;
  const isDevMode = mode === ActiveBranchMode.DEV;

  const setBranchModeTo = useCallback(
    (newMode: ActiveBranchMode.PROD | ActiveBranchMode.STAGE | ActiveBranchMode.DEV) => {
      const names =
        newMode === ActiveBranchMode.PROD
          ? teamReposProdBranchArray?.map((r) => r.prod_branch ?? r.prod_branches?.[0]).filter(Boolean).join(',') ?? ''
          : newMode === ActiveBranchMode.STAGE
            ? teamReposProdBranchArray?.map((r) => r.stage_branch).filter(Boolean).join(',') ?? ''
            : teamReposProdBranchArray?.map((r) => r.dev_branch).filter(Boolean).join(',') ?? '';
      dispatch(
        appSlice.actions.setBranchState({
          mode: newMode,
          names
        })
      );
    },
    [dispatch, teamReposProdBranchArray]
  );

  const openProductionBranchSelectorModal = useCallback(() => {
    const modal = addModal({
      title: `Set default production branches`,
      body: (
        <TeamProductionBranchSelector onClose={() => closeModal(modal.key)} />
      ),
      showCloseIcon: true
    });
  }, [addModal, closeModal]);

  return (
    <Box>
      <HeaderBtn
        ref={elRef}
        startIcon={
          <GitBranch height={theme.spacing(2)} width={theme.spacing(2)} />
        }
        endIcon={<KeyboardArrowDownRounded />}
        onClick={open.true}
        sx={{
          width: '280px',
          '> .MuiButton-endIcon': { marginLeft: 'auto' },
          ':hover > .MuiTypography-root': {
            color: theme.palette.getContrastText(theme.colors.secondary.main)
          }
        }}
      >
        <Box mr={1 / 2}>Branch:</Box>
        <LightTooltip
          arrow
          title={
            isProdMode
              ? 'Lead time & deployment frequency from production branches (Repos.prod_branch)'
              : isStageMode
                ? 'Lead time & deployment frequency from stage branches (Repos.stage_branch)'
                : 'Lead time & deployment frequency from dev branches (Repos.dev_branch)'
          }
        >
          <Typography
            fontWeight="bold"
            color={
              brandColors.branch[
                (isProdMode ? 'prod' : isStageMode ? 'stage' : 'dev') as keyof typeof brandColors.branch
              ] ?? brandColors.branch.prod
            }
            fontSize="small"
            whiteSpace="nowrap"
            overflow="hidden"
            textOverflow="ellipsis"
          >
            {isProdMode
              ? 'Production branch'
              : isStageMode
                ? 'Stage branch'
                : 'Dev branch'}
          </Typography>
        </LightTooltip>
      </HeaderBtn>
      <Popover anchorEl={elRef.current} onClose={open.false} open={open.value}>
        <Box
          sx={{
            p: 2,
            background: alpha(theme.colors.alpha.black[100], 0.06),
            width: '320px'
          }}
          display="flex"
          flexDirection="column"
          gap={2}
        >
          <Option>
            <OptionTitle
              selected={isProdMode}
              onSelect={() => setBranchModeTo(ActiveBranchMode.PROD)}
            >
              Production branch
            </OptionTitle>
            <Box fontSize="smaller" sx={{ userSelect: 'none' }}>
              Lead time and deployment frequency from each repo's production branch (Repos.prod_branch).
            </Box>
            <MiniButton
              onClick={openProductionBranchSelectorModal}
              color={'primary'}
              variant="outlined"
              sx={{ width: 'fit-content' }}
            >
              {teamReposProdBranchArray?.length
                ? 'View/Edit Branches →'
                : 'No repos. Click to assign →'}
            </MiniButton>
          </Option>
          <Divider sx={{ my: -1 / 2 }} />
          <Option>
            <OptionTitle
              selected={isStageMode}
              onSelect={() => setBranchModeTo(ActiveBranchMode.STAGE)}
            >
              Stage branch
            </OptionTitle>
            <Box fontSize="smaller" sx={{ userSelect: 'none' }}>
              Lead time and deployment frequency from each repo's stage branch (Repos.stage_branch).
            </Box>
          </Option>
          <Divider sx={{ my: -1 / 2 }} />
          <Option>
            <OptionTitle
              selected={isDevMode}
              onSelect={() => setBranchModeTo(ActiveBranchMode.DEV)}
            >
              Dev branch
            </OptionTitle>
            <Box fontSize="smaller" sx={{ userSelect: 'none' }}>
              Lead time and deployment frequency from each repo's dev branch (Repos.dev_branch).
            </Box>
          </Option>
        </Box>
      </Popover>
    </Box>
  );
};
const OptionTitle: FC<{ selected: boolean; onSelect: () => any }> = ({
  selected,
  children,
  onSelect
}) => (
  <Typography
    variant="h4"
    sx={{ userSelect: 'none', display: 'flex', alignItems: 'center', gap: 1 }}
    onClick={onSelect}
  >
    <Box>{children}</Box>
    {selected ? (
      <CheckCircleOutlineRounded fontSize="small" color="success" />
    ) : (
      <RadioButtonUncheckedRounded fontSize="small" color="secondary" />
    )}
  </Typography>
);
const Option: FC = ({ children }) => {
  const theme = useTheme();
  return (
    <Box
      display="flex"
      flexDirection="column"
      gap={1}
      m={-1}
      p={1}
      borderRadius={1 / 2}
      sx={{
        ':hover': { backgroundColor: theme.colors.secondary.lighter }
      }}
    >
      {children}
    </Box>
  );
};
