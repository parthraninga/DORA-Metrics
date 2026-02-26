import { DownloadOutlined } from '@mui/icons-material';
import { Box, Button, useTheme } from '@mui/material';
import { FC, useCallback, useMemo } from 'react';
import { useDispatch } from 'react-redux';

import { useCurrentDateRangeLabel } from '@/hooks/useStateTeamConfig';
import { downloadDoraReport } from '@/utils/downloadDoraReport';

import { commonProps } from '@/content/DoraMetrics/MetricsCommonProps';

import { appSlice } from '@/slices/app';
import { useSelector } from '@/store';
import { Industries } from '@/utils/dora';


import { DoraScoreProps } from './DoraScore';
import { FlexBox } from './FlexBox';
import { DarkTooltip } from './Shared';
import { Line } from './Text';

export const DoraScoreV2: FC<DoraScoreProps> = ({ ...stats }) => {
  const theme = useTheme();
  const metricsSummary = useSelector((s) => s.doraMetrics.metrics_summary);
  const dateRangeLabel = useCurrentDateRangeLabel();
  const projectName = useSelector((s) =>
    s.app.singleTeam?.[0]?.name ?? 'Engineering Team'
  );



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


        <Button
          variant="outlined"
          size="small"
          startIcon={<DownloadOutlined />}
          onClick={() => downloadDoraReport(metricsSummary, dateRangeLabel, projectName, stats)}
          sx={{
            ml: 2,
            textTransform: 'none',
            borderColor: 'rgba(255,255,255,0.35)',
            color: 'white',
            whiteSpace: 'nowrap',
            '&:hover': {
              borderColor: 'white',
              backgroundColor: 'rgba(255,255,255,0.08)'
            }
          }}
        >
          Download Report
        </Button>

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
