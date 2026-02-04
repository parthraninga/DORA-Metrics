import { KeyboardArrowDown } from '@mui/icons-material';
import { Box, Menu, Divider, useTheme } from '@mui/material';
import { FC, MouseEventHandler, useCallback, useMemo } from 'react';
import { useDispatch } from 'react-redux';

import { commonProps } from '@/content/DoraMetrics/MetricsCommonProps';
import { useBoolState, useEasyState } from '@/hooks/useEasyState';
import { appSlice } from '@/slices/app';
import { useSelector } from '@/store';
import { Industries, IndustryStandardsDoraScores } from '@/utils/dora';
import { depFn } from '@/utils/fn';

import { DoraScoreProps } from './DoraScore';
import { FlexBox } from './FlexBox';
import { DarkTooltip } from './Shared';
import { Line } from './Text';

export const DoraScoreV2: FC<DoraScoreProps> = ({ ...stats }) => {
  const theme = useTheme();
  const { selectedIndustry } = useSelectedIndustry();

  const standardScore = useMemo(() => {
    return IndustryStandardsDoraScores[selectedIndustry];
  }, [selectedIndustry]);

  const tooltipContentSx = {
    maxWidth: 380,
    px: 2,
    py: 1.5,
    color: 'inherit',
    '& strong': { color: 'inherit', fontWeight: theme.typography.fontWeightBold }
  };

  const doraScoreTooltip = (
    <Box sx={tooltipContentSx} component="span">
      <Line bold sx={{ display: 'block', mb: 1 }}>
        How your DORA score is calculated
      </Line>
      <Line small sx={{ display: 'block', mb: 1 }}>
        <strong>Overall:</strong> Your score (out of 10) = mean of the four
        metric scores below, rounded to 1 decimal. Only metrics with data are
        included.
      </Line>
      <Line small sx={{ display: 'block', mb: 0.5 }}>
        <strong>Lead Time (0–10):</strong> Shorter = better. Score = 2 × tier:
        ≥6 months → 0, ≥1 month → 2, ≥1 week → 4, ≥1 day → 6, ≥1 hour → 8,
        &lt;1 hour → 10.
      </Line>
      <Line small sx={{ display: 'block', mb: 0.5 }}>
        <strong>Deployment Frequency (0–10):</strong> More deploys/week =
        better. Score = 2 × tier: ≤1 per 6 months → 0, ≤monthly → 2, ≤weekly
        → 4, ≤daily → 6, ≤14/week → 8, &gt;14/week → 10.
      </Line>
      <Line small sx={{ display: 'block', mb: 0.5 }}>
        <strong>Change Failure Rate (0–10):</strong> Score = (100 − CFR%) ÷
        10 (e.g. 0% → 10, 10% → 9, 50% → 5, 100% → 0).
      </Line>
      <Line small sx={{ display: 'block' }}>
        <strong>Mean Time to Recovery (0–10):</strong> Same tiers as Lead
        Time: shorter = higher score.
      </Line>
    </Box>
  );

  return (
    <FlexBox>
      <FlexBox centered gap={1.5}>
        <DarkTooltip title={doraScoreTooltip} placement="bottom-start" arrow>
          <FlexBox col sx={{ cursor: 'help' }}>
            <Line bigish bold white>
              Your DORA
            </Line>
            <Line bigish bold white>
              Performance
            </Line>
          </FlexBox>
        </DarkTooltip>

        <DarkTooltip title={doraScoreTooltip} placement="bottom" arrow>
          <FlexBox
            col
            height={'50px'}
            centered
            gap={'14px'}
            ml={1}
            sx={{ cursor: 'help' }}
          >
            <DoraScore stat={stats.avg} />
          </FlexBox>
        </DarkTooltip>

        <FlexBox col ml={4}>
          <Line bigish bold white>
            Industry
          </Line>
          <Line bigish bold white>
            Standard
          </Line>
        </FlexBox>

        <DoraScore stat={standardScore} isIndustry />

        <FlexBox col>
          <Line bigish medium>
            {selectedIndustry}
          </Line>
          <IndustryDropdown />
        </FlexBox>
      </FlexBox>
    </FlexBox>
  );
};

export const DoraScore: FC<{ stat: number; isIndustry?: boolean }> = ({
  stat,
  isIndustry
}) => {
  const theme = useTheme();
  return (
    <FlexBox
      corner={theme.spacing(1)}
      px={1.5}
      sx={{
        background: isIndustry ? purpleBg : null,
        backgroundColor: !isIndustry && getBg(stat)
      }}
    >
      <Line fontSize={'2.4em'} bold white>
        {stat}{' '}
        <Line fontSize="0.8rem" ml="-4px">
          / 10
        </Line>
      </Line>
    </FlexBox>
  );
};

const purpleBg = `linear-gradient(30deg,#8C7CF0, #3E2EA4)`;

const getBg = (stat: number) => ({
  background:
    stat >= 8
      ? commonProps.elite.bg
      : stat >= 6
      ? commonProps.high.bg
      : stat >= 4
      ? commonProps.medium.bg
      : commonProps.low.bg
});

const IndustryDropdown = () => {
  const anchorEl = useEasyState();
  const cancelMenu = useBoolState(false);
  const { selectedIndustry, updateSelectedIndustry } = useSelectedIndustry();

  const handleOpenMenu: MouseEventHandler<HTMLDivElement> = (event) => {
    anchorEl.set(event.currentTarget);
  };

  const handleCloseMenu = useCallback(() => {
    depFn(anchorEl.set, null);
  }, [anchorEl.set]);

  return (
    <FlexBox>
      <FlexBox alignCenter pointer onClick={handleOpenMenu}>
        <Line primary>Change</Line>
        <KeyboardArrowDown color="primary" fontSize="small" />
      </FlexBox>

      <Menu
        id="team-setting-menu"
        anchorEl={anchorEl.value}
        keepMounted
        open={Boolean(anchorEl.value)}
        onClose={() => {
          handleCloseMenu();
          cancelMenu.false();
        }}
        MenuListProps={{
          'aria-labelledby': 'simple-menu',
          disablePadding: true,
          sx: {
            padding: 0
          }
        }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <FlexBox col gap1>
          <Line big semibold px={1}>
            Choose Industry
          </Line>
          <Divider />
          <FlexBox width={'300px'} col gap={1 / 2}>
            {Object.entries(Industries).map(
              ([key, industryName]) =>
                industryName !== Industries.OTHER && (
                  <FlexBox
                    onClick={() => {
                      updateSelectedIndustry(industryName as Industries);
                      handleCloseMenu();
                      cancelMenu.false();
                    }}
                    key={key}
                    p={1 / 2}
                    px={1}
                    pointer
                    bgcolor={
                      industryName === selectedIndustry ? 'primary.light' : null
                    }
                    sx={{
                      transition: 'background-color 0.2s',
                      ':hover': {
                        bgcolor: 'primary.dark'
                      }
                    }}
                  >
                    <Line regular>{industryName}</Line>
                  </FlexBox>
                )
            )}
          </FlexBox>
        </FlexBox>
      </Menu>
    </FlexBox>
  );
};

export const useSelectedIndustry = () => {
  const selectedIndustry = useSelector((s) => s.app.selectedIndustry);
  const dispatch = useDispatch();

  const updateSelectedIndustry = useCallback(
    (industry: Industries) => {
      dispatch(appSlice.actions.setIndustry(industry));
    },
    [dispatch]
  );

  return useMemo(
    () => ({
      selectedIndustry: selectedIndustry
        ? selectedIndustry
        : Industries.ALL_INDUSTRIES,
      updateSelectedIndustry
    }),
    [selectedIndustry, updateSelectedIndustry]
  );
};
