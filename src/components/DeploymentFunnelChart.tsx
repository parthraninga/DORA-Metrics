import { Box } from '@mui/material';
import { FC, useMemo, useState } from 'react';

import { FlexBox } from './FlexBox';
import { Line } from './Text';

export type PipelineData = {
  [environment: string]: number;
};

interface DeploymentFunnelChartProps {
  data: PipelineData;
  emptyMessage?: string;
}

interface FunnelStage {
  key: string;
  label: string;
  count: number;
  percentage: number;
  color: string;
  gradient: string;
  widthPercent: number;
}

// Fixed environment order
const ENV_ORDER = ['dev', 'stage', 'uat', 'prod'] as const;

const ENV_LABELS: Record<string, string> = {
  dev: 'Dev',
  stage: 'Stage',
  uat: 'UAT',
  prod: 'Prod'
};

// Color scheme matching design: Blue → Orange → Green
const ENV_COLORS: Record<string, { base: string; gradient: string }> = {
  dev: {
    base: '#60A5FA',
    gradient: '#3B82F6'
  },
  stage: {
    base: '#D97706',
    gradient: '#B45309'
  },
  uat: {
    base: '#7C3AED',
    gradient: '#6D28D9'
  },
  prod: {
    base: '#059669',
    gradient: '#047857'
  }
};

/**
 * WIDTH CALCULATION - Power scaling
 * 
 * Zero values treated as 1 for width calculation ONLY (displayed as 0)
 * Formula: widthPercent = Math.pow(layoutValue / maxLayoutValue, 0.8) * 100
 * 
 * This ensures:
 * - Better visual distribution across all value ranges
 * - Moderate values (253 vs 66) appear distinctly different
 * - 0 is treated as 1 for width (but displayed as 0)
 * - No artificial minimum or clamping
 */
function calculateWidth(count: number, maxLayoutValue: number): number {
  // Treat count === 0 as 1 for width calculation ONLY
  const layoutValue = count === 0 ? 1 : count;
  
  if (maxLayoutValue === 0 || maxLayoutValue === 1) return 100;
  
  // Power scaling with exponent 0.8
  const ratio = layoutValue / maxLayoutValue;
  const widthPercent = Math.pow(ratio, 0.8) * 100;
  
  return widthPercent;
}

/**
 * Get ordered stages - one per environment
 */
function getOrderedStages(data: PipelineData): FunnelStage[] {
  const total = Object.values(data).reduce((sum, val) => sum + val, 0);
  if (total === 0) return [];

  // First pass: collect stages and calculate layout values
  const preliminaryStages: Array<{ env: string; count: number; layoutValue: number }> = [];
  
  for (const env of ENV_ORDER) {
    const count = data[env] || 0;
    
    // Skip UAT if it doesn't exist
    if (env === 'uat' && count === 0) continue;
    
    // Calculate layout value: treat 0 as 1 for width calculation ONLY
    const layoutValue = count === 0 ? 1 : count;
    preliminaryStages.push({ env, count, layoutValue });
  }

  // Calculate max layout value for normalization
  const maxLayoutValue = Math.max(...preliminaryStages.map(s => s.layoutValue), 1);

  // Second pass: create final stages with calculated widths
  const stages: FunnelStage[] = [];
  
  for (const { env, count } of preliminaryStages) {
    stages.push({
      key: env,
      label: ENV_LABELS[env] || env.toUpperCase(),
      count, // Display actual count (including 0)
      percentage: total > 0 ? (count / total) * 100 : 0,
      color: ENV_COLORS[env]?.base || '#6B7280',
      gradient: ENV_COLORS[env]?.gradient || '#4B5563',
      widthPercent: calculateWidth(count, maxLayoutValue)
    });
  }

  return stages;
}

/**
 * Generate trapezoid SVG polygon points for a connected funnel
 * topWidth and bottomWidth are percentages (0-100)
 * yOffset is the vertical position within the SVG
 */
function generateConnectedTrapezoidPoints(
  containerWidth: number,
  height: number,
  topWidthPercent: number,
  bottomWidthPercent: number,
  yOffset: number
): string {
  const topWidth = (topWidthPercent / 100) * containerWidth;
  const bottomWidth = (bottomWidthPercent / 100) * containerWidth;
  
  const topLeft = (containerWidth - topWidth) / 2;
  const topRight = topLeft + topWidth;
  const bottomLeft = (containerWidth - bottomWidth) / 2;
  const bottomRight = bottomLeft + bottomWidth;
  
  const yTop = yOffset;
  const yBottom = yOffset + height;
  
  return `${topLeft},${yTop} ${topRight},${yTop} ${bottomRight},${yBottom} ${bottomLeft},${yBottom}`;
}

/**
 * Calculate independent widths for all stages
 * Each stage uses its own scaled width without connecting to neighbors
 */
function calculateConnectedWidths(stages: FunnelStage[]): Array<{ topWidth: number; bottomWidth: number }> {
  return stages.map(stage => {
    const topWidth = stage.widthPercent;
    const bottomWidth = topWidth * 0.75;
    
    return { topWidth, bottomWidth };
  });
}

/**
 * Production-grade Deployment Pipeline Funnel Chart
 * 
 * ABSOLUTE RULES (ENFORCED):
 * 1. ZERO spacing between stages (no gap, margin, padding, space-y, or flex gap)
 * 2. All trapezoids in ONE single SVG
 * 3. Each stage exactly 140px height (responsive to number of environments)
 * 4. For stage i: yStart = i * 140, yEnd = yStart + 140
 * 5. Labels vertically aligned with trapezoid centers using absolute positioning
 * 
 * INDEPENDENT WIDTH RULE:
 * - Each stage width is proportional to its value (logarithmic scaling)
 * - topWidth = scaledWidth (based on logarithmic calculation)
 * - bottomWidth = topWidth * 0.75 (creates trapezoid taper)
 * - Stages do NOT connect (no bottom[i] = top[i+1] rule)
 * - Allows non-monotonic values (e.g., 366 → 0 → 17)
 * 
 * LAYOUT STRUCTURE:
 * - Two-column layout: Labels (absolute positioned) + Funnel (550px max, centered)
 * - Labels absolutely positioned at trapezoid vertical centers
 * - Funnel size scales with number of environments
 * 
 * VISUAL RESULT:
 * Dev       ███████████████
 * Stage     ██
 * Prod      ████████
 * 
 * Each stage width reflects its actual value, no distortion from connected geometry.
 */
export const DeploymentFunnelChart: FC<DeploymentFunnelChartProps> = ({
  data,
  emptyMessage = 'No deployments detected in selected time range'
}) => {
  const [hoveredStage, setHoveredStage] = useState<string | null>(null);
  
  const stages = useMemo(() => getOrderedStages(data), [data]);
  const total = useMemo(() => 
    Object.values(data).reduce((sum, val) => sum + val, 0), 
    [data]
  );

  // Calculate connected widths: bottom[i] = top[i+1]
  const connectedWidths = useMemo(() => calculateConnectedWidths(stages), [stages]);

  // SVG dimensions - ABSOLUTE RULES
  const STAGE_HEIGHT = 140; // Each stage exactly 140px (increased for better visibility)
  const svgHeight = stages.length * STAGE_HEIGHT;
  const svgWidth = 550; // Max funnel width (increased for better visibility)

  // Empty state
  if (stages.length === 0 || total === 0) {
    return (
      <FlexBox
        col
        centered
        sx={{
          minHeight: 320,
          p: 4,
          bgcolor: 'rgba(0, 0, 0, 0.2)',
          borderRadius: 2,
          border: '1px dashed rgba(255, 255, 255, 0.1)'
        }}
      >
        <Box
          sx={{
            fontSize: '3rem',
            opacity: 0.3,
            mb: 2
          }}
        >
          📊
        </Box>
        <Line color="text.secondary" medium>
          {emptyMessage}
        </Line>
      </FlexBox>
    );
  }

  return (
    <FlexBox col sx={{ width: '100%' }}>
      {/* Title */}
      <FlexBox col gap={0.5} sx={{ mb: 1 }}>
        <Line white huge bold>
          Deployment Pipeline
        </Line>
        <Line color="text.secondary" medium>
          Deployments across environments
        </Line>
      </FlexBox>

      {/* Funnel Container - Two Column Layout: Labels + Single SVG */}
      <FlexBox
        sx={{
          width: '100%',
          display: 'flex',
          gap: 4,
          overflow: 'hidden',
          alignItems: 'flex-start'
        }}
      >
        {/* Environment Labels Column - Absolutely positioned at trapezoid centers */}
        <Box
          sx={{
            position: 'relative',
            height: svgHeight,
            flexShrink: 0,
            minWidth: 100
          }}
        >
          {stages.map((stage, i) => {
            const yCenter = i * STAGE_HEIGHT + STAGE_HEIGHT / 2;
            
            return (
              <Box
                key={`label-${stage.key}`}
                sx={{
                  position: 'absolute',
                  top: `${yCenter}px`,
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <Line
                  white
                  bold
                  sx={{
                    fontSize: '1.2rem',
                    fontWeight: 700,
                    letterSpacing: '0.8px',
                    opacity: hoveredStage === null || hoveredStage === stage.key ? 1 : 0.5,
                    transition: 'all 0.2s ease',
                    transform: hoveredStage === stage.key ? 'scale(1.08)' : 'scale(1)'
                  }}
                >
                  {stage.label}
                </Line>
              </Box>
            );
          })}
        </Box>

        {/* Funnel Column - Max 550px, centered */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            minWidth: 0,
            maxWidth: 550
          }}
        >
          <svg
            width="100%"
            height={svgHeight}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            preserveAspectRatio="xMidYMid meet"
            style={{
              maxWidth: svgWidth,
              overflow: 'visible',
              display: 'block'
            }}
          >
            <defs>
              {/* Define gradients for each stage */}
              {stages.map((stage) => (
                <linearGradient
                  key={`gradient-${stage.key}`}
                  id={`gradient-${stage.key}`}
                  x1="0%"
                  y1="0%"
                  x2="0%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor={stage.color} stopOpacity="1" />
                  <stop offset="100%" stopColor={stage.gradient} stopOpacity="1" />
                </linearGradient>
              ))}
              
              {/* Drop shadow filter */}
              <filter id="dropShadow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="4" />
                <feOffset dx="0" dy="2" result="offsetblur" />
                <feComponentTransfer>
                  <feFuncA type="linear" slope="0.3" />
                </feComponentTransfer>
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {/* Hover glow filter */}
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
                <feOffset dx="0" dy="0" result="offsetblur" />
                <feComponentTransfer>
                  <feFuncA type="linear" slope="0.6" />
                </feComponentTransfer>
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Render all trapezoids in sequence - NO GAPS */}
            {stages.map((stage, index) => {
              // For stage i:
              // yStart = i * 140
              // yEnd = yStart + 140
              const yOffset = index * STAGE_HEIGHT;
              const { topWidth, bottomWidth } = connectedWidths[index];
              const points = generateConnectedTrapezoidPoints(
                svgWidth,
                STAGE_HEIGHT,
                topWidth,
                bottomWidth,
                yOffset
              );
              const isHovered = hoveredStage === stage.key;
              const centerY = yOffset + STAGE_HEIGHT / 2;

              return (
                <g
                  key={stage.key}
                  onMouseEnter={() => setHoveredStage(stage.key)}
                  onMouseLeave={() => setHoveredStage(null)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Trapezoid shape */}
                  <polygon
                    points={points}
                    fill={`url(#gradient-${stage.key})`}
                    stroke="rgba(255, 255, 255, 0.15)"
                    strokeWidth="1.5"
                    filter={isHovered ? 'url(#glow)' : 'url(#dropShadow)'}
                    style={{
                      transition: 'all 0.3s ease',
                      opacity: isHovered ? 1 : 0.95
                    }}
                  />

                  {/* Count number */}
                  <text
                    x={svgWidth / 2}
                    y={centerY - 10}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize="36"
                    fontWeight="700"
                    style={{
                      textShadow: '0 2px 6px rgba(0, 0, 0, 0.6)',
                      pointerEvents: 'none',
                      userSelect: 'none'
                    }}
                  >
                    {stage.count}
                  </text>

                  {/* Percentage */}
                  <text
                    x={svgWidth / 2}
                    y={centerY + 18}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="rgba(255, 255, 255, 0.9)"
                    fontSize="15"
                    fontWeight="600"
                    style={{
                      textShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
                      pointerEvents: 'none',
                      userSelect: 'none'
                    }}
                  >
                    ({stage.percentage.toFixed(1)}%)
                  </text>

                  {/* Invisible hover area - covers full stage */}
                  <rect
                    x="0"
                    y={yOffset}
                    width={svgWidth}
                    height={STAGE_HEIGHT}
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                  />
                </g>
              );
            })}
          </svg>
        </Box>
      </FlexBox>
    </FlexBox>
  );
};
