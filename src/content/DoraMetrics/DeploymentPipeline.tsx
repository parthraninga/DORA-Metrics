import { Box } from '@mui/material';
import { FC, useMemo } from 'react';

import { FlexBox } from '@/components/FlexBox';
import { Line } from '@/components/Text';
import { useSelector } from '@/store';
import { brandColors } from '@/theme/schemes/theme';

import { getDoraLink } from './getDoraLink';

const SEGMENT_ORDER = ['dev', 'stage', 'prod'] as const;
const LABELS = { dev: 'Dev', stage: 'Stage', prod: 'Prod' };

export const DeploymentPipeline: FC = () => {
  const pipeline = useSelector(
    (s) => s.doraMetrics.metrics_summary?.deployment_pipeline
  );

  const { dev = 0, stage = 0, prod = 0 } = pipeline ?? {};

  const total = dev + stage + prod;

  const segments = useMemo(() => {
    return SEGMENT_ORDER.map((key) => {
      const count = key === 'dev' ? dev : key === 'stage' ? stage : prod;
      return {
        key,
        label: LABELS[key],
        count,
        color:
          key === 'dev'
            ? brandColors.branch.dev
            : key === 'stage'
              ? brandColors.branch.stage
              : brandColors.branch.prod
      };
    });
  }, [dev, stage, prod]);

  /** Width % per segment: proportional to count (e.g. 3-4-3 → 30%, 40%, 30%). When total is 0, equal thirds. */
  const widthPcts = useMemo(() => {
    if (total <= 0) return [100 / 3, 100 / 3, 100 / 3];
    return SEGMENT_ORDER.map((key) => {
      const count = key === 'dev' ? dev : key === 'stage' ? stage : prod;
      return (count / total) * 100;
    });
  }, [dev, stage, prod, total]);

  return (
    <FlexBox
      col
      flex1
      sx={{
        minWidth: 0,
        bgcolor: 'transparent'
      }}
    >
      <FlexBox justifyBetween alignCenter mb={1}>
        <FlexBox col>
          <Line big bold white>
            Deployment Pipeline
          </Line>
          <Line small color="text.secondary">
            Deployments across environments
          </Line>
        </FlexBox>
        <Box sx={{ flexShrink: 0 }}>
          <Line tiny italic color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {getDoraLink('Click to view definition')}
          </Line>
        </Box>
      </FlexBox>

      <FlexBox
        col
        flex1
        sx={{
          position: 'relative',
          minHeight: 200,
          bgcolor: 'transparent'
        }}
      >
        {/* Funnel segments: width proportional to count (e.g. 3-4-3 → Dev 30%, Stage 40%, Prod 30%) */}
        <FlexBox
          col
          flex1
          alignCenter
          sx={{
            position: 'relative',
            gap: 0,
            width: '100%'
          }}
        >
          {segments.map((seg, i) => (
            <FlexBox
              key={seg.key}
              alignCenter
              justifyBetween
              px={2}
              sx={{
                flex: 1,
                minHeight: 56,
                width: `${widthPcts[i]}%`,
                minWidth: 0,
                bgcolor: seg.color,
                transition: 'width 0.3s ease, background-color 0.2s'
              }}
            >
              <Line bold white>
                {seg.label}
              </Line>
              <Line bold white fontSize="1.4em">
                {seg.count}
              </Line>
            </FlexBox>
          ))}
        </FlexBox>
      </FlexBox>

      {/* Legend */}
      <FlexBox gap={2} flexWrap="wrap" mt={1.5} alignCenter>
        {segments.map((seg) => (
          <FlexBox key={seg.key} alignCenter gap={1}>
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: 0.5,
                bgcolor: seg.color
              }}
            />
            <Line small white>
              {seg.label}: <Line component="span" bold>{seg.count}</Line>
            </Line>
          </FlexBox>
        ))}
      </FlexBox>
    </FlexBox>
  );
};
