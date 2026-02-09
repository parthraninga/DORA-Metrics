import { Terminal } from '@mui/icons-material';
import { FC, ReactNode } from 'react';

import { NoTeamSelected } from '@/components/NoTeamSelected';
import { PageContentWrapper } from '@/components/PageContentWrapper';
import { PageHeader } from '@/components/PageHeader';
import { PageTitleWrapper } from '@/components/PageTitleWrapper';
import { useHasRepos } from '@/hooks/useHasRepos';
import { useSingleTeamConfig } from '@/hooks/useStateTeamConfig';
import { TeamSelectorModes } from '@/types/resources';

export const PageWrapper: FC<{
  title?: ReactNode;
  hideAllSelectors?: boolean;
  subtitle?: ReactNode;
  pageTitle?: string;
  showDate?: boolean;
  teamDateSelectorMode?: TeamSelectorModes;
  headerChildren?: ReactNode;
  isLoading?: boolean;
  showEvenIfNoTeamSelected?: boolean;
  additionalFilters?: ReactNode[];
}> = ({
  title = 'Collaborate',
  hideAllSelectors,
  pageTitle,
  showDate = true,
  children,
  teamDateSelectorMode,
  headerChildren,
  isLoading,
  showEvenIfNoTeamSelected = false,
  additionalFilters = []
}) => {
  const { noTeamSelected } = useSingleTeamConfig();
  const { hasRepos, done: hasReposCheckDone } = useHasRepos();
  // Show content if: explicitly allowed without team, or a team is selected, or at least one repo exists
  const showContent =
    showEvenIfNoTeamSelected || !noTeamSelected || (hasReposCheckDone && hasRepos);
  // TODO: use fetchState
  const isLoaderActive = false || isLoading;

  return (
    <>
      <PageTitleWrapper>
        <PageHeader
          hideAllSelectors={hideAllSelectors}
          loading={isLoaderActive}
          title={title}
          pageTitle={pageTitle}
          icon={<Terminal fontSize="large" />}
          teamDateSelectorMode={
            teamDateSelectorMode || (showDate ? 'single' : 'single-only')
          }
          additionalFilters={additionalFilters}
          selectBranch={false}
        >
          {headerChildren}
        </PageHeader>
      </PageTitleWrapper>
      <PageContentWrapper>
        {!showContent ? <NoTeamSelected /> : children}
      </PageContentWrapper>
    </>
  );
};
