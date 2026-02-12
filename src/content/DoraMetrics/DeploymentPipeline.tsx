import { Box } from '@mui/material';
import { FC } from 'react';

import { DeploymentFunnelChart } from '@/components/DeploymentFunnelChart';
import { FlexBox } from '@/components/FlexBox';
import { Line } from '@/components/Text';
import { useSelector } from '@/store';

import { getDoraLink } from './getDoraLink';

export const DeploymentPipeline: FC = () => {
  const pipeline = useSelector(
    (s) => s.doraMetrics.metrics_summary?.deployment_pipeline
  );

  return (
    <FlexBox
      col
      flex1
      sx={{
        minWidth: 0,
        maxWidth: '100%',
        bgcolor: 'transparent',
        overflow: 'hidden' // Prevent horizontal scroll
      }}
    >
      {/* Funnel Chart - includes its own title */}
      <DeploymentFunnelChart
        data={pipeline || {}}
        emptyMessage="No deployments detected in selected time range"
      />
      
      {/* Definition link - moved below chart */}
      <FlexBox justifyEnd sx={{ mt: 1 }}>
        <Line tiny italic color="text.secondary">
          {getDoraLink('Click to view definition')}
        </Line>
      </FlexBox>
    </FlexBox>
  );
};
