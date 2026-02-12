/**
 * DeploymentFunnelChart Examples
 * 
 * This file demonstrates the production-grade deployment funnel with:
 * - Proportional widths based on deployment counts
 * - Environment names OUTSIDE (left-aligned)
 * - Deployment counts INSIDE (centered in trapezoids)
 * - Dynamic environment support (with/without UAT)
 */

import { Box } from '@mui/material';
import { FC } from 'react';

import { DeploymentFunnelChart } from './DeploymentFunnelChart';
import { FlexBox } from './FlexBox';
import { Line } from './Text';

/**
 * Example 1: Real-World Data (From Screenshot)
 * This matches the data shown: Stage has most (52), then Prod (5), then Dev (3)
 * Width should be: Stage (100%), Prod (~9.6%), Dev (~5.8%)
 */
export const RealWorldExample: FC = () => {
  const data = {
    dev: 3,
    stage: 52,
    prod: 5
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800 }}>
      <Line big bold white mb={1}>
        Real-World: Stage-Heavy Pipeline
      </Line>
      <Line small color="text.secondary" mb={3}>
        Dev: 3 | Stage: 52 | Prod: 5 → Widths proportional to counts
      </Line>
      <DeploymentFunnelChart data={data} />
    </Box>
  );
};

/**
 * Example 2: Balanced Pipeline
 * More typical distribution where dev has most, gradually decreasing
 */
export const BalancedPipelineExample: FC = () => {
  const data = {
    dev: 253,
    stage: 66,
    prod: 5
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800 }}>
      <Line big bold white mb={1}>
        Balanced Pipeline (Typical Flow)
      </Line>
      <Line small color="text.secondary" mb={3}>
        Dev: 253 | Stage: 66 | Prod: 5 → Dev widest
      </Line>
      <DeploymentFunnelChart data={data} />
    </Box>
  );
};

/**
 * Example 3: Pipeline with UAT (4 stages)
 */
export const PipelineWithUATExample: FC = () => {
  const data = {
    dev: 254,
    stage: 67,
    uat: 11,
    prod: 5
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800 }}>
      <Line big bold white mb={1}>
        Pipeline with UAT Environment
      </Line>
      <Line small color="text.secondary" mb={3}>
        Dev: 254 | Stage: 67 | UAT: 11 | Prod: 5 → 4-stage funnel
      </Line>
      <DeploymentFunnelChart data={data} />
    </Box>
  );
};

/**
 * Example 4: High Volume
 */
export const HighVolumeExample: FC = () => {
  const data = {
    dev: 1547,
    stage: 823,
    uat: 134,
    prod: 89
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800 }}>
      <Line big bold white mb={1}>
        High Volume Pipeline
      </Line>
      <Line small color="text.secondary" mb={3}>
        Large numbers: 1547 → 823 → 134 → 89
      </Line>
      <DeploymentFunnelChart data={data} />
    </Box>
  );
};

/**
 * Example 5: Empty State
 */
export const EmptyStateExample: FC = () => {
  const data = {
    dev: 0,
    stage: 0,
    prod: 0
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800 }}>
      <Line big bold white mb={1}>
        Empty State
      </Line>
      <Line small color="text.secondary" mb={3}>
        No deployments in time range
      </Line>
      <DeploymentFunnelChart 
        data={data}
        emptyMessage="No deployments found for this team"
      />
    </Box>
  );
};

/**
 * Example 6: Extreme Imbalance
 * Shows minimum width handling for very small values
 */
export const ImbalancedExample: FC = () => {
  const data = {
    dev: 1,
    stage: 500,
    prod: 2
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800 }}>
      <Line big bold white mb={1}>
        Extreme Imbalance
      </Line>
      <Line small color="text.secondary" mb={3}>
        Dev: 1 | Stage: 500 | Prod: 2 → Minimum width applied to small values
      </Line>
      <DeploymentFunnelChart data={data} />
    </Box>
  );
};

/**
 * All Examples Gallery
 */
export const AllExamplesGallery: FC = () => {
  return (
    <FlexBox col gap={4} sx={{ p: 4, bgcolor: '#0a0a0a', minHeight: '100vh' }}>
      <FlexBox col gap={1}>
        <Line huge bold white>
          DeploymentFunnelChart Examples
        </Line>
        <Line medium color="text.secondary">
          Proportional widths • Names outside • Counts inside • SVG rendered
        </Line>
      </FlexBox>
      
      <RealWorldExample />
      <BalancedPipelineExample />
      <PipelineWithUATExample />
      <HighVolumeExample />
      <ImbalancedExample />
      <EmptyStateExample />

      {/* Feature Checklist */}
      <Box
        sx={{
          bgcolor: 'rgba(59, 130, 246, 0.1)',
          borderRadius: 2,
          p: 3,
          border: '1px solid rgba(59, 130, 246, 0.3)',
          maxWidth: 800
        }}
      >
        <Line big bold white mb={2}>
          ✨ Key Features Demonstrated
        </Line>
        <FlexBox col gap={1}>
          <Line small white>
            ✅ <strong>Proportional Widths:</strong> Width = (stageCount / maxCount) × 100%
          </Line>
          <Line small white>
            ✅ <strong>Names Outside:</strong> Environment labels left-aligned
          </Line>
          <Line small white>
            ✅ <strong>Numbers Inside:</strong> Deployment counts centered in trapezoids
          </Line>
          <Line small white>
            ✅ <strong>Dynamic UAT:</strong> Automatically included when present
          </Line>
          <Line small white>
            ✅ <strong>SVG Rendering:</strong> Precise trapezoid shapes with gradients
          </Line>
          <Line small white>
            ✅ <strong>Minimum Width:</strong> 12% minimum for visibility of small values
          </Line>
          <Line small white>
            ✅ <strong>Animations:</strong> Smooth slide-in on mount
          </Line>
          <Line small white>
            ✅ <strong>Hover Effects:</strong> Glow filter and tooltip
          </Line>
        </FlexBox>
      </Box>
    </FlexBox>
  );
};

export default AllExamplesGallery;

/**
 * Example 3: Empty state
 * When no deployments exist in the selected time range
 */
export const EmptyStateExample: FC = () => {
  const data = {
    dev: 0,
    stage: 0,
    prod: 0
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800 }}>
      <Line big bold white mb={2}>
        Empty State (No Deployments)
      </Line>
      <DeploymentFunnelChart 
        data={data}
        emptyMessage="No deployments found for this team in the last 90 days"
      />
    </Box>
  );
};

/**
 * Example 4: High volume scenario
 * Testing with large numbers
 */
export const HighVolumeExample: FC = () => {
  const data = {
    dev: 1547,
    stage: 823,
    uat: 134,
    prod: 89
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800 }}>
      <Line big bold white mb={2}>
        High Volume Pipeline
      </Line>
      <DeploymentFunnelChart data={data} />
    </Box>
  );
};

/**
 * Example 5: Imbalanced pipeline
 * When one stage has significantly more deployments
 */
export const ImbalancedPipelineExample: FC = () => {
  const data = {
    dev: 3,
    stage: 500,
    prod: 12
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800 }}>
      <Line big bold white mb={2}>
        Imbalanced Pipeline (Stage-Heavy)
      </Line>
      <DeploymentFunnelChart data={data} />
    </Box>
  );
};

/**
 * Example 6: Only production deployments
 * Edge case where only prod has data
 */
export const OnlyProdExample: FC = () => {
  const data = {
    dev: 0,
    stage: 0,
    prod: 15
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800 }}>
      <Line big bold white mb={2}>
        Only Production Deployments
      </Line>
      <DeploymentFunnelChart data={data} />
    </Box>
  );
};

/**
 * Example 7: Multiple pipelines side by side
 * Comparing different teams or time periods
 */
export const ComparisonExample: FC = () => {
  const teamA = {
    dev: 150,
    stage: 80,
    uat: 20,
    prod: 10
  };

  const teamB = {
    dev: 90,
    stage: 50,
    prod: 8
  };

  return (
    <FlexBox gap={3} sx={{ p: 3, flexWrap: 'wrap' }}>
      <Box sx={{ flex: 1, minWidth: 300 }}>
        <Line big bold white mb={2}>
          Team A (with UAT)
        </Line>
        <DeploymentFunnelChart data={teamA} />
      </Box>
      
      <Box sx={{ flex: 1, minWidth: 300 }}>
        <Line big bold white mb={2}>
          Team B (without UAT)
        </Line>
        <DeploymentFunnelChart data={teamB} />
      </Box>
    </FlexBox>
  );
};

/**
 * Example 8: Real-world data from your system
 * Based on the screenshot provided
 */
export const RealWorldExample: FC = () => {
  const data = {
    dev: 3,
    stage: 52,
    prod: 5
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800 }}>
      <Line big bold white mb={2}>
        Real-World Data (Screenshot Match)
      </Line>
      <DeploymentFunnelChart data={data} />
    </Box>
  );
};

/**
 * All Examples Gallery
 * Renders all examples in a grid for comprehensive testing
 */
export const AllExamplesGallery: FC = () => {
  return (
    <FlexBox col gap={4} sx={{ p: 4, bgcolor: '#1a1a1a', minHeight: '100vh' }}>
      <Line huge bold white>
        DeploymentFunnelChart Examples Gallery
      </Line>
      
      <StandardPipelineExample />
      <PipelineWithUATExample />
      <HighVolumeExample />
      <ImbalancedPipelineExample />
      <EmptyStateExample />
      <OnlyProdExample />
      <RealWorldExample />
      <ComparisonExample />
    </FlexBox>
  );
};

export default AllExamplesGallery;
