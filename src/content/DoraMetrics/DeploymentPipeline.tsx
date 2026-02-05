import { Box } from '@mui/material';
import { FC, useMemo } from 'react';

import { FlexBox } from '@/components/FlexBox';
import { Line } from '@/components/Text';
import { useSelector } from '@/store';

import { getDoraLink } from './getDoraLink';

const SEGMENT_ORDER = ['dev', 'stage', 'prod'] as const;
const LABELS = { 
  dev: 'Dev', 
  stage: 'Stage', 
  prod: 'Production' 
};
const DESCRIPTIONS = {
  dev: 'Activity & Intent',
  stage: 'Evaluation & Risk',
  prod: 'Delivered Value'
};

// Enterprise-grade muted colors for dark theme
const FUNNEL_COLORS = {
  dev: {
    base: 'rgba(80, 160, 200, 0.85)',      // Muted blue
    gradient: 'rgba(80, 160, 200, 0.65)'
  },
  stage: {
    base: 'rgba(220, 150, 60, 0.85)',      // Amber/orange
    gradient: 'rgba(220, 150, 60, 0.65)'
  },
  prod: {
    base: 'rgba(70, 150, 80, 0.85)',       // Deep green
    gradient: 'rgba(70, 150, 80, 0.65)'
  }
};

export const DeploymentPipeline: FC = () => {
  const pipeline = useSelector(
    (s) => s.doraMetrics.metrics_summary?.deployment_pipeline
  );

  const { dev = 0, stage = 0, prod = 0 } = pipeline ?? {};

  const total = dev + stage + prod;

  const segments = useMemo(() => {
    // Find the maximum count to calculate proportional widths
    const maxCount = Math.max(dev, stage, prod, 1);
    
    return SEGMENT_ORDER.map((key) => {
      const count = key === 'dev' ? dev : key === 'stage' ? stage : prod;
      // Calculate width directly proportional to count with small minimum for visibility
      // For ratio 1:51:4, this gives: ~2%, 100%, ~8%
      const widthPercent = count === 0 
        ? 5 // Minimum 5% width if count is 0
        : Math.max(5, (count / maxCount) * 100);
      
      return {
        key,
        label: LABELS[key],
        description: DESCRIPTIONS[key],
        count,
        colors: FUNNEL_COLORS[key],
        widthPercent
      };
    });
  }, [dev, stage, prod]);

  return (
    <FlexBox
      col
      flex1
      sx={{
        minWidth: 0,
        bgcolor: 'transparent'
      }}
    >
      {/* Header */}
      <FlexBox justifyBetween alignCenter mb={2}>
        <FlexBox col>
          <Line big bold white>
            Deployment Pipeline
          </Line>
          <Line small color="text.secondary">
            Activity → Risk → Delivery
          </Line>
        </FlexBox>
        <Box sx={{ flexShrink: 0 }}>
          <Line tiny italic color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {getDoraLink('Click to view definition')}
          </Line>
        </Box>
      </FlexBox>

      {/* Funnel visualization */}
      <FlexBox
        col
        flex1
        sx={{
          position: 'relative',
          minHeight: 320,
          bgcolor: 'transparent',
          py: 1
        }}
      >
        <FlexBox
          col
          flex1
          alignCenter
          justifyCenter
          sx={{
            position: 'relative',
            gap: 0,
            width: '100%'
          }}
        >
          {segments.map((seg, i) => {
            const topWidth = seg.widthPercent;
            // For prod (last segment), keep same width (rectangle), otherwise taper to next segment
            const bottomWidth = i < segments.length - 1 
              ? segments[i + 1].widthPercent 
              : seg.widthPercent; // Prod is a rectangle
            const leftOffset = (100 - topWidth) / 2;
            const rightOffset = (100 - topWidth) / 2;
            const bottomLeftOffset = (100 - bottomWidth) / 2;
            const bottomRightOffset = (100 - bottomWidth) / 2;
            
            return (
              <Box
                key={seg.key}
                sx={{
                  position: 'relative',
                  flex: 1,
                  minHeight: 95,
                  width: '100%',
                  // Subtle gradient for depth without being loud
                  background: `linear-gradient(135deg, ${seg.colors.base} 0%, ${seg.colors.gradient} 100%)`,
                  clipPath: `polygon(${leftOffset}% 0%, ${100 - rightOffset}% 0%, ${100 - bottomRightOffset}% 100%, ${bottomLeftOffset}% 100%)`,
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  px: 3,
                  py: 2,
                  overflow: 'visible',
                  // Subtle shadow for card-like depth
                  filter: 'drop-shadow(0 1px 3px rgba(0, 0, 0, 0.3))',
                  '&:hover': {
                    filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4))',
                    background: `linear-gradient(135deg, ${seg.colors.base} 0%, ${seg.colors.base} 100%)`
                  },
                  // Subtle top border for separation
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: `${leftOffset}%`,
                    right: `${rightOffset}%`,
                    height: '1px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    pointerEvents: 'none'
                  }
                }}
              >
                {/* Content */}
                <FlexBox 
                  col 
                  alignCenter 
                  gap={0.5}
                  sx={{ 
                    position: 'relative', 
                    zIndex: 1,
                    width: '100%'
                  }}
                >
                  {/* Count - primary metric */}
                  <Line 
                    white 
                    bold 
                    sx={{ 
                      fontSize: '2rem',
                      lineHeight: 1,
                      fontWeight: 700,
                      textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
                    }}
                  >
                    {seg.count}
                  </Line>
                  
                  {/* Label */}
                  <Line 
                    white 
                    sx={{ 
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      opacity: 0.95,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    {seg.label}
                  </Line>
                  
                  {/* Description */}
                  <Line 
                    sx={{ 
                      fontSize: '0.75rem',
                      color: 'rgba(255, 255, 255, 0.7)',
                      fontStyle: 'italic'
                    }}
                  >
                    {seg.description}
                  </Line>
                </FlexBox>
              </Box>
            );
          })}
        </FlexBox>
      </FlexBox>
    </FlexBox>
  );
};
