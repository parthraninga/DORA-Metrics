import { LoadingButton } from '@mui/lab';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  CircularProgress,
} from '@mui/material';
import { FC, useCallback, useEffect, useState } from 'react';

import { handleApi } from '@/api-helpers/axios-api-instance';
import { FlexBox } from '@/components/FlexBox';
import { Line } from '@/components/Text';

type FetchStatusItem = {
  id: string;
  repo_id: string;
  fetched_at: string;
  state: 'processing' | 'success' | 'failure';
  raw_response?: unknown;
};

export const FetchDataModal: FC<{
  open: boolean;
  teamId: string;
  teamName: string;
  lastFetchedAt: string | null | undefined;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ open, teamId, teamName, lastFetchedAt, onClose, onSuccess }) => {
  const [daysPrior, setDaysPrior] = useState(90);
  const [submitting, setSubmitting] = useState(false);
  const [processing, setProcessing] = useState(false);

  const hasLastFetched = Boolean(lastFetchedAt);

  const triggerFetch = useCallback(
    async (days?: number) => {
      setSubmitting(true);
      try {
        await handleApi(`/teams/${teamId}/fetch`, {
          method: 'POST',
          data: days != null ? { days_prior: days } : {},
        });
        setProcessing(true);
      } catch (e) {
        console.error(e);
      } finally {
        setSubmitting(false);
      }
    },
    [teamId]
  );

  useEffect(() => {
    if (!open || !processing) return;
    const interval = setInterval(async () => {
      try {
        const { items } = await handleApi<{ items: FetchStatusItem[] }>(
          `/teams/${teamId}/fetch-status`
        );
        const anyProcessing = (items || []).some((i) => i.state === 'processing');
        if (!anyProcessing) {
          setProcessing(false);
          onSuccess();
          onClose();
        }
      } catch {
        // keep polling
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [open, processing, teamId, onSuccess, onClose]);

  const handleFetchTillNow = useCallback(() => {
    triggerFetch();
  }, [triggerFetch]);

  const handleFetchWithDays = useCallback(() => {
    triggerFetch(daysPrior);
  }, [triggerFetch, daysPrior]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Fetch data — {teamName}</DialogTitle>
      <DialogContent>
        <FlexBox col gap={2} sx={{ pt: 1 }}>
          <Line>
            <strong>Last fetched:</strong>{' '}
            {lastFetchedAt
              ? new Date(lastFetchedAt).toLocaleString()
              : 'Never'}
          </Line>

          {hasLastFetched ? (
            <Line secondary>Fetch new data from last fetched time until now.</Line>
          ) : (
            <>
              <Line secondary>
                Number of days prior to fetch (from today backwards):
              </Line>
              <TextField
                type="number"
                size="small"
                fullWidth
                label="Days prior"
                value={daysPrior}
                onChange={(e) =>
                  setDaysPrior(Math.max(1, parseInt(e.target.value, 10) || 90))
                }
                inputProps={{ min: 1, max: 365 }}
              />
            </>
          )}

          {processing && (
            <FlexBox alignCenter gap={1}>
              <CircularProgress size={20} />
              <Line>Processing… Fetch runs in the background.</Line>
            </FlexBox>
          )}
        </FlexBox>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        {hasLastFetched ? (
          <LoadingButton
            loading={submitting || processing}
            variant="contained"
            onClick={handleFetchTillNow}
          >
            Fetch till now
          </LoadingButton>
        ) : (
          <LoadingButton
            loading={submitting || processing}
            variant="contained"
            onClick={handleFetchWithDays}
          >
            Fetch
          </LoadingButton>
        )}
      </DialogActions>
    </Dialog>
  );
};
