import { Close } from '@mui/icons-material';
import { Backdrop, Box, IconButton, Modal } from '@mui/material';
import { FC, useEffect } from 'react';

import { FlexBox } from './FlexBox';

export interface ImageModalProps {
  open: boolean;
  onClose: () => void;
  imageSrc: string;
  alt?: string;
}

export const ImageModal: FC<ImageModalProps> = ({
  open,
  onClose,
  imageSrc,
  alt = 'Image'
}) => {
  // Handle ESC key press
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (open) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [open, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAfterTransition
      slots={{ backdrop: Backdrop }}
      slotProps={{
        backdrop: {
          timeout: 500,
          sx: {
            backgroundColor: 'rgba(0, 0, 0, 0.85)'
          }
        }
      }}
    >
      <Box
        sx={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          outline: 'none',
          maxWidth: '90vw',
          maxHeight: '90vh',
          width: 'auto',
          height: 'auto',
          animation: open ? 'fadeIn 0.3s ease-in-out' : 'fadeOut 0.3s ease-in-out',
          '@keyframes fadeIn': {
            from: {
              opacity: 0,
              transform: 'translate(-50%, -50%) scale(0.9)'
            },
            to: {
              opacity: 1,
              transform: 'translate(-50%, -50%) scale(1)'
            }
          },
          '@keyframes fadeOut': {
            from: {
              opacity: 1,
              transform: 'translate(-50%, -50%) scale(1)'
            },
            to: {
              opacity: 0,
              transform: 'translate(-50%, -50%) scale(0.9)'
            }
          }
        }}
      >
        <FlexBox col alignCenter justifyCenter gap={2}>
          {/* Close button */}
          <FlexBox justifyEnd width="100%">
            <IconButton
              onClick={onClose}
              sx={{
                color: 'white',
                bgcolor: 'rgba(0, 0, 0, 0.5)',
                '&:hover': {
                  bgcolor: 'rgba(0, 0, 0, 0.7)'
                }
              }}
              aria-label="Close modal"
            >
              <Close />
            </IconButton>
          </FlexBox>

          {/* Image */}
          <Box
            component="img"
            src={imageSrc}
            alt={alt}
            sx={{
              maxWidth: '100%',
              maxHeight: 'calc(90vh - 60px)',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              borderRadius: 1,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
            }}
          />
        </FlexBox>
      </Box>
    </Modal>
  );
};
