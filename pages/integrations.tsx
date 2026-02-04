import {
  AddRounded,
  DeleteRounded,
  EditRounded,
  VisibilityRounded
} from '@mui/icons-material';
import { GitHub } from '@mui/icons-material';
import { LoadingButton } from '@mui/lab';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  MenuItem,
  CircularProgress,
  Box
} from '@mui/material';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Authenticated } from 'src/components/Authenticated';

import { handleApi } from '@/api-helpers/axios-api-instance';
import { FlexBox } from '@/components/FlexBox';
import { Line } from '@/components/Text';
import { PageWrapper } from '@/content/PullRequests/PageWrapper';
import { useBoolState, useEasyState } from '@/hooks/useEasyState';
import ExtendedSidebarLayout from '@/layouts/ExtendedSidebarLayout';
import { PageLayout } from '@/types/resources';
import type { TokenType } from '@/lib/supabase';
import GitlabIcon from '@/mocks/icons/gitlab.svg';
import BitbucketIcon from '@/mocks/icons/bitbucket.svg';

type TokenListItem = {
  id: string;
  name: string;
  token_masked: string;
  type: TokenType;
  created_at?: string;
};

function Integrations() {
  return (
    <>
      <PageWrapper
        title={
          <FlexBox gap1 alignCenter>
            Integrations
          </FlexBox>
        }
        hideAllSelectors
        pageTitle="Integrations"
        showEvenIfNoTeamSelected={true}
        isLoading={false}
      >
        <Content />
      </PageWrapper>
    </>
  );
}

Integrations.getLayout = (page: PageLayout) => (
  <Authenticated>
    <ExtendedSidebarLayout>{page}</ExtendedSidebarLayout>
  </Authenticated>
);

export default Integrations;

const TOKEN_TYPES: { value: TokenType; label: string; Icon: ReactNode }[] = [
  { value: 'github', label: 'GitHub', Icon: <GitHub sx={{ fontSize: 24 }} /> },
  { value: 'gitlab', label: 'GitLab', Icon: <GitlabIcon width={24} height={24} /> },
  { value: 'bitbucket', label: 'Bitbucket', Icon: <BitbucketIcon width={24} height={24} /> },
];

const Content = () => {
  const [list, setList] = useState<TokenListItem[]>([]);
  const loading = useBoolState(true);
  const modalOpen = useBoolState(false);
  const showTokenOpen = useBoolState(false);
  const editingId = useEasyState<string | null>(null);
  const showTokenValue = useEasyState('');
  const showTokenName = useEasyState('');

  const fetchList = useCallback(async () => {
    loading.true();
    try {
      const data = await handleApi<TokenListItem[]>('/tokens');
      setList(data || []);
    } catch (e) {
      console.error(e);
      setList([]);
    } finally {
      loading.false();
    }
  }, [loading.false, loading.true]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const openAdd = () => {
    editingId.set(null);
    modalOpen.true();
  };

  const openEdit = (id: string) => {
    editingId.set(id);
    modalOpen.true();
  };

  const handleShowToken = async (id: string) => {
    try {
      const row = await handleApi<{ name: string; token: string }>(`/tokens/${id}`);
      showTokenName.set(row.name);
      showTokenValue.set(row.token);
      showTokenOpen.true();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete token "${name}"?`)) return;
    try {
      await handleApi(`/tokens/${id}`, { method: 'DELETE' });
      fetchList();
    } catch (e) {
      console.error(e);
    }
  };

  const handleModalClose = () => {
    modalOpen.false();
    editingId.set(null);
  };

  const onSaved = () => {
    handleModalClose();
    fetchList();
  };

  return (
    <FlexBox col gap2 fill>
      <FlexBox justifyBetween alignCenter>
        <Line white fontSize={'24px'}>
          Tokens
        </Line>
        <Button
          variant="contained"
          startIcon={<AddRounded />}
          onClick={openAdd}
        >
          Add New Token
        </Button>
      </FlexBox>

      <TableContainer sx={{ maxHeight: '70vh' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Token</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading.value ? (
              <TableRow>
                <TableCell colSpan={3} align="center" sx={{ py: 4 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} align="center" sx={{ py: 4 }}>
                  <Line secondary>No tokens yet. Add one with the button above.</Line>
                </TableCell>
              </TableRow>
            ) : (
              list.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{row.token_masked}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      title="Show token"
                      onClick={() => handleShowToken(row.id)}
                    >
                      <VisibilityRounded fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      title="Edit"
                      onClick={() => openEdit(row.id)}
                    >
                      <EditRounded fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      title="Delete"
                      color="error"
                      onClick={() => handleDelete(row.id, row.name)}
                    >
                      <DeleteRounded fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TokenModal
        open={modalOpen.value}
        onClose={handleModalClose}
        onSaved={onSaved}
        editId={editingId.value}
      />

      <Dialog open={showTokenOpen.value} onClose={showTokenOpen.false} maxWidth="sm" fullWidth>
        <DialogTitle>Token: {showTokenName.value}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Token"
            value={showTokenValue.value}
            InputProps={{ readOnly: true }}
            multiline
            minRows={2}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={showTokenOpen.false}>Close</Button>
        </DialogActions>
      </Dialog>
    </FlexBox>
  );
};

const TokenModal = ({
  open,
  onClose,
  onSaved,
  editId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editId: string | null;
}) => {
  const name = useEasyState('');
  const token = useEasyState('');
  const type = useEasyState<TokenType>('github');
  const saving = useBoolState(false);
  const error = useEasyState('');

  const isEdit = !!editId;

  const loadEdit = useCallback(async () => {
    if (!editId) return;
    try {
      const row = await handleApi<{ name: string; token: string; type: TokenType }>(
        `/tokens/${editId}`
      );
      name.set(row.name);
      token.set(row.token);
      type.set(row.type);
    } catch (e) {
      console.error(e);
    }
  }, [editId, name.set, token.set, type.set]);

  useEffect(() => {
    if (open && editId) loadEdit();
    if (open && !editId) {
      name.set('');
      token.set('');
      type.set('github');
    }
    if (!open) error.set('');
  }, [open, editId, loadEdit, name.set, token.set, type.set, error.set]);

  const handleSubmit = async () => {
    error.set('');
    if (!name.value.trim()) {
      error.set('Name is required');
      return;
    }
    if (!token.value.trim()) {
      error.set('Token is required');
      return;
    }
    saving.true();
    try {
      if (isEdit) {
        const payload: { name: string; token?: string; type: TokenType } = {
          name: name.value.trim(),
          type: type.value,
        };
        if (token.value.trim()) payload.token = token.value.trim();
        await handleApi(`/tokens/${editId}`, { method: 'PATCH', data: payload });
      } else {
        await handleApi('/tokens', {
          method: 'POST',
          data: { name: name.value.trim(), token: token.value.trim(), type: type.value },
        });
      }
      onSaved();
    } catch (e: any) {
      error.set(e?.data?.error || e?.message || 'Failed to save');
    } finally {
      saving.false();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit Token' : 'Add New Token'}</DialogTitle>
      <DialogContent>
        <FlexBox col gap={2} sx={{ pt: 1 }}>
          <TextField
            fullWidth
            label="Name"
            value={name.value}
            onChange={(e) => name.set(e.target.value)}
            placeholder="e.g. My GitHub token"
          />
          <TextField
            fullWidth
            label="Token"
            type="password"
            value={token.value}
            onChange={(e) => token.set(e.target.value)}
            placeholder={isEdit ? 'Leave blank to keep current' : 'Paste your token'}
            helperText={isEdit ? 'Leave blank to keep current token' : undefined}
          />
          <TextField
            fullWidth
            select
            label="Type"
            value={type.value}
            onChange={(e) => type.set(e.target.value as TokenType)}
            SelectProps={{
              renderValue: (selected) => {
                const opt = TOKEN_TYPES.find((o) => o.value === selected);
                return opt ? (
                  <FlexBox alignCenter gap={1.5}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>{opt.Icon}</Box>
                    <span>{opt.label}</span>
                  </FlexBox>
                ) : selected;
              },
            }}
          >
            {TOKEN_TYPES.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                <FlexBox alignCenter gap={1.5}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>{opt.Icon}</Box>
                  <span>{opt.label}</span>
                </FlexBox>
              </MenuItem>
            ))}
          </TextField>
          {error.value && (
            <Line error small>
              {error.value}
            </Line>
          )}
        </FlexBox>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <LoadingButton loading={saving.value} variant="contained" onClick={handleSubmit}>
          {isEdit ? 'Save' : 'Add'}
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
};
