import { HelpOutlineRounded } from '@mui/icons-material';
import { ComponentProps, FC, useState } from 'react';

import { FlexBox, FlexBoxProps } from '@/components/FlexBox';
import { ImageModal } from '@/components/ImageModal';
import { Line } from '@/components/Text';

export const MetricExternalRead: FC<
  {
    label: string;
    link: string;
    iconProps?: ComponentProps<typeof HelpOutlineRounded>;
  } & FlexBoxProps
> = ({ label, link, children, iconProps, ...props }) => {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <FlexBox
        color="white"
        title={`Click to learn more about ${label}`}
        darkTip
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setModalOpen(true);
        }}
        sx={{ cursor: 'pointer' }}
        {...props}
      >
        <HelpOutlineRounded sx={{ fontSize: '1.4em' }} {...iconProps} />
      </FlexBox>
      <ImageModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        imageSrc={link}
        alt={label}
      />
      {children}
    </>
  );
};
