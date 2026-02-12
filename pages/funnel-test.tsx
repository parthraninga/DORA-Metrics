/**
 * DEPLOYMENT FUNNEL TEST PAGE - NORMALIZED SCALING
 * 
 * Tests the production-grade VISUALLY BALANCED funnel with:
 * 
 * CRITICAL FORMULA:
 *   width = 35% + ((count / maxCount) × 65%)
 * 
 * Zero handling:
 *   width = 21% (0.6 × 35%)
 */

import { Box } from '@mui/material';

import { DeploymentFunnelChart } from '@/components/DeploymentFunnelChart';
import { FlexBox } from '@/components/FlexBox';
import { Line } from '@/components/Text';

export default function FunnelTestPage() {
  const stageHeavy = { dev: 3, stage: 52, prod: 5 };
  const devHeavy = { dev: 253, stage: 66, prod: 0 };
  const withUAT = { dev: 253, stage: 67, uat: 11, prod: 5 };
  const extremeImbalance = { dev: 1, stage: 500, prod: 2 };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0a0a0a', p: 4 }}>
      <FlexBox col gap={6}>
        <FlexBox col gap={1}>
          <Line huge bold white>
            Deployment Funnel - NORMALIZED Scaling (35-100%)
          </Line>
          <Line medium color="text.secondary">
            Visually balanced funnel that prevents collapse from extreme value differences
          </Line>
        </FlexBox>

        <Box sx={{ bgcolor: 'rgba(168, 85, 247, 0.1)', borderRadius: 2, p: 3, border: '1px solid rgba(168, 85, 247, 0.3)' }}>
          <Line big bold white mb={2}>
            📐 NEW Normalized Scaling Formula
          </Line>
          <FlexBox col gap={1.5}>
            <Box sx={{ bgcolor: 'rgba(0, 0, 0, 0.3)', p: 2, borderRadius: 1 }}>
              <Line white small sx={{ fontFamily: 'monospace', color: '#22c55e' }}>
                ✅ width = 35% + ((count / maxCount) × 65%)
              </Line>
              <Line white small sx={{ fontFamily: 'monospace', mt: 1, color: '#22c55e' }}>
                ✅ zeroWidth = 21% (0.6 × 35%)
              </Line>
              <Line white small sx={{ fontFamily: 'monospace', mt: 2, textDecoration: 'line-through', opacity: 0.5, color: '#ef4444' }}>
                ❌ OLD: width = (count / maxCount) × 100%
              </Line>
            </Box>
            <Line small white>
              <strong>Example: Dev 253, Stage 66, Prod 0</strong>
            </Line>
            <Line small white sx={{ pl: 2, color: '#22c55e' }}>
              ✅ NEW: Dev=100%, Stage=52%, Prod=21% (balanced!)
            </Line>
            <Line small white sx={{ pl: 2, color: '#ef4444', textDecoration: 'line-through' }}>
              ❌ OLD: Dev=100%, Stage=26%, Prod=12% (collapsed!)
            </Line>
          </FlexBox>
        </Box>

        <Box sx={{ bgcolor: 'rgba(255, 255, 255, 0.03)', borderRadius: 2, p: 3, border: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <Line big bold white mb={1}>
            ✅ Test 1: Stage-Heavy Pipeline
          </Line>
          <Line small color="text.secondary" mb={1}>
            Dev: 3 | Stage: 52 | Prod: 5
          </Line>
          <Line tiny color="rgba(255, 255, 255, 0.5)" mb={3}>
            Expected: Stage 100%, Prod ~41%, Dev ~39% (all clearly visible)
          </Line>
          <Box sx={{ maxWidth: 700, mx: 'auto' }}>
            <DeploymentFunnelChart data={stageHeavy} />
          </Box>
        </Box>

        <Box sx={{ bgcolor: 'rgba(34, 197, 94, 0.1)', borderRadius: 2, p: 3, border: '2px solid rgba(34, 197, 94, 0.5)' }}>
          <Line big bold white mb={1}>
            🎯 Test 2: Dev-Heavy Pipeline (THE FIX!)
          </Line>
          <Line small color="text.secondary" mb={1}>
            Dev: 253 | Stage: 66 | Prod: 0
          </Line>
          <Line tiny color="rgba(34, 197, 94, 1)" mb={3}>
            Expected: Dev 100%, Stage ~52%, Prod ~21% (BALANCED, not collapsed!)
          </Line>
          <Box sx={{ maxWidth: 700, mx: 'auto' }}>
            <DeploymentFunnelChart data={devHeavy} />
          </Box>
          <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(34, 197, 94, 0.2)', borderRadius: 1 }}>
            <Line tiny bold white mb={1}>
              📊 Normalized Width Calculation:
            </Line>
            <Line tiny white sx={{ fontFamily: 'monospace' }}>
              • DEV (253): 35% + (253/253 × 65%) = 100%
            </Line>
            <Line tiny white sx={{ fontFamily: 'monospace' }}>
              • STAGE (66): 35% + (66/253 × 65%) = 52% (NOT 26%!)
            </Line>
            <Line tiny white sx={{ fontFamily: 'monospace' }}>
              • PROD (0): Special zero handling = 21%
            </Line>
          </Box>
        </Box>

        <Box sx={{ bgcolor: 'rgba(255, 255, 255, 0.03)', borderRadius: 2, p: 3, border: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <Line big bold white mb={1}>
            ✅ Test 3: Four-Stage Pipeline with UAT
          </Line>
          <Line small color="text.secondary" mb={1}>
            Dev: 253 | Stage: 67 | UAT: 11 | Prod: 5
          </Line>
          <Line tiny color="rgba(255, 255, 255, 0.5)" mb={3}>
            Expected: All four stages visible, descending width order
          </Line>
          <Box sx={{ maxWidth: 700, mx: 'auto' }}>
            <DeploymentFunnelChart data={withUAT} />
          </Box>
        </Box>

        <Box sx={{ bgcolor: 'rgba(239, 68, 68, 0.1)', borderRadius: 2, p: 3, border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <Line big bold white mb={1}>
            ⚠️ Test 4: Extreme Imbalance (500:1 ratio)
          </Line>
          <Line small color="text.secondary" mb={1}>
            Dev: 1 | Stage: 500 | Prod: 2
          </Line>
          <Line tiny color="rgba(239, 68, 68, 1)" mb={3}>
            Without normalized scaling, Dev/Prod would be invisible
          </Line>
          <Box sx={{ maxWidth: 700, mx: 'auto' }}>
            <DeploymentFunnelChart data={extremeImbalance} />
          </Box>
          <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(239, 68, 68, 0.2)', borderRadius: 1 }}>
            <Line tiny bold white mb={1}>
              🔥 Why Normalized Scaling is Critical:
            </Line>
            <Line tiny white>
              Raw proportional (❌): Dev=0.2%, Prod=0.4% (invisible!)
            </Line>
            <Line tiny white>
              Normalized (✅): Dev≈35%, Prod≈35% (visible!)
            </Line>
          </Box>
        </Box>

        <Box sx={{ bgcolor: 'rgba(59, 130, 246, 0.1)', borderRadius: 2, p: 3, border: '1px solid rgba(59, 130, 246, 0.3)' }}>
          <Line big bold white mb={2}>
            ✨ Normalized Scaling Features
          </Line>
          <FlexBox col gap={1}>
            <Line small white>✅ Visually Balanced: 35-100% range prevents collapse</Line>
            <Line small white>✅ No Invisibility: Even 500:1 ratios remain visible</Line>
            <Line small white>✅ Proportional: Larger values still appear wider</Line>
            <Line small white>✅ Zero Handling: 21% width for zero values</Line>
            <Line small white>✅ Names Outside: Left-aligned environment labels</Line>
            <Line small white>✅ Numbers Inside: Centered deployment counts</Line>
            <Line small white>✅ SVG Precision: Crisp trapezoid shapes</Line>
            <Line small white>✅ Dynamic UAT: Fourth stage when present</Line>
          </FlexBox>
        </Box>

        <Box sx={{ bgcolor: 'rgba(234, 179, 8, 0.1)', borderRadius: 2, p: 3, border: '1px solid rgba(234, 179, 8, 0.3)' }}>
          <Line big bold white mb={2}>
            📊 Before vs After Comparison
          </Line>
          <FlexBox col gap={2}>
            <Box>
              <Line small bold white mb={1}>
                Example: Dev=253, Stage=66, Prod=0
              </Line>
              <Box sx={{ bgcolor: 'rgba(0,0,0,0.3)', p: 2, borderRadius: 1 }}>
                <Line tiny color="#ef4444" mb={0.5}>
                  ❌ OLD: Dev=100%, Stage=26%, Prod=12%
                </Line>
                <Line tiny color="#ef4444" mb={1.5}>
                  → Stage looks collapsed, hard to read
                </Line>
                <Line tiny color="#22c55e" mb={0.5}>
                  ✅ NEW: Dev=100%, Stage=52%, Prod=21%
                </Line>
                <Line tiny color="#22c55e">
                  → All stages clearly visible and balanced
                </Line>
              </Box>
            </Box>
          </FlexBox>
        </Box>

        <Box sx={{ bgcolor: 'rgba(34, 197, 94, 0.1)', borderRadius: 2, p: 3, border: '1px solid rgba(34, 197, 94, 0.3)' }}>
          <Line big bold white mb={2}>
            🚀 Ready for Production
          </Line>
          <FlexBox col gap={1}>
            <Line small white>
              Visit /dora-metrics to see it with your real data
            </Line>
            <Line small white>
              The funnel now handles any value distribution gracefully
            </Line>
            <Line small white>
              Even extreme 500:1 ratios remain visually balanced
            </Line>
          </FlexBox>
        </Box>
      </FlexBox>
    </Box>
  );
}
