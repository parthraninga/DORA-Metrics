import { Chip } from '@mui/material';
import { FC, ReactNode, useState } from 'react';

import { FlexBox } from '@/components/FlexBox';
import { ImageModal } from '@/components/ImageModal';
import { Line } from '@/components/Text';

interface DoraMetricBadgeProps {
  classification: string;
  background: string;
  icon: any;
  tooltip?: ReactNode;
  onClick?: () => void;
}

export const DoraMetricBadge: FC<DoraMetricBadgeProps> = ({
  classification,
  background,
  icon: Icon,
  tooltip,
  onClick
}) => {
  const [modalOpen, setModalOpen] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onClick) {
      onClick();
    } else {
      setModalOpen(true);
    }
  };

  return (
    <>
      <FlexBox
        title={tooltip}
        darkTip
        alignCenter
        onClick={handleClick}
        sx={{ cursor: 'pointer' }}
      >
        <Chip
          sx={{ 
            background,
            cursor: 'pointer',
            '&:hover': {
              filter: 'brightness(1.1)',
            }
          }}
          icon={
            <FlexBox bgcolor="#0003" round>
              <Icon sx={{ transform: 'scale(0.8)' }} />
            </FlexBox>
          }
          label={
            <Line bold white>
              {classification}
            </Line>
          }
          color="success"
        />
      </FlexBox>
      <ImageModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        imageSrc="/Calculating_the_metrics.jpg"
        alt={`DORA Metrics - ${classification} performance`}
      />
    </>
  );
};
