import { FC, useState } from 'react';
import { GoLinkExternal } from 'react-icons/go';

import { ImageModal } from '@/components/ImageModal';
import { Line } from '@/components/Text';

export const DoraLink: FC<{ text: string }> = ({ text }) => {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <Line
        tiny
        onClick={(e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setModalOpen(true);
        }}
        sx={{
          cursor: 'pointer',
          display: 'flex',
          whiteSpace: 'pre',
          alignItems: 'center',
          gap: 1 / 2
        }}
        underline
        dotted
        medium
        white
      >
        <span>{text}</span> <GoLinkExternal />
      </Line>
      <ImageModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        imageSrc="/Calculating_the_metrics.jpg"
        alt="Calculating the metrics"
      />
    </>
  );
};

// Backward compatibility - keeping the old function
export const getDoraLink = (text: string) => <DoraLink text={text} />;
