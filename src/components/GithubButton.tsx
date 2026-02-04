import StarBorderOutlined from '@mui/icons-material/StarBorderOutlined';
import { Button, ButtonProps, useTheme } from '@mui/material';
import { FC } from 'react';

import { FlexBox } from '@/components/FlexBox';
import { Line } from '@/components/Text';

const githubRepoUrl = `https://github.com/middlewarehq/middleware`;

export const GithubButton: FC<ButtonProps> = () => {
  const theme = useTheme();

  return (
    <Button
      variant="outlined"
      sx={{
        borderRadius: 0.8,
        borderColor: theme.colors.alpha.trueWhite[10],
        color: 'lightgray',
        height: 40,
        padding: '0 18px'
      }}
      onClick={() => window.open(githubRepoUrl, '_blank')}
    >
      <FlexBox alignCenter>
        <StarBorderOutlined fontSize="small" />
        <Line bold marginLeft={1}>
          Star
        </Line>
      </FlexBox>
    </Button>
  );
};
