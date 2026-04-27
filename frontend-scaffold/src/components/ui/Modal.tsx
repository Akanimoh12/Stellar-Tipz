import React, { useEffect, useId, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  closeOnBackdropClick?: boolean;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  children: React.ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  closeOnBackdropClick = true,
  ariaLabelledBy,
  ariaDescribedBy,
  children,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const previousBodyOverflowRef = useRef<string>('');
  const generatedTitleId = useId();

  const effectiveLabelledBy = ariaLabelledBy ?? (title ? generatedTitleId : undefined);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!modalRef.current) {
        return;
      }

      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const focusableElements = Array.from(modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

        if (focusableElements.length === 0) {
          modalRef.current.focus();
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey) {
          if (document.activeElement === firstElement || document.activeElement === modalRef.current) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    previousFocusRef.current = document.activeElement as HTMLElement;
    previousBodyOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    if (modalRef.current) {
      const focusableElements = Array.from(modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      } else {
        modalRef.current.focus();
      }
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflowRef.current;
      previousFocusRef.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={() => {
          if (closeOnBackdropClick) {
            onClose();
          }
        }}
        role="presentation"
      />

      {/* Modal content */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative z-10 w-full border-3 border-black bg-white p-6 sm:mx-4 sm:max-w-lg sm:p-8 max-sm:h-full max-sm:max-w-none max-sm:rounded-none"
        style={{ boxShadow: '6px 6px 0px 0px rgba(0,0,0,1)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={effectiveLabelledBy}
        aria-describedby={ariaDescribedBy}
      >
        {title && (
          <div className="flex items-center justify-between mb-6">
            <h2 id={effectiveLabelledBy} className="text-2xl font-black uppercase">{title}</h2>
            <button
              onClick={onClose}
              className="text-2xl font-black hover:opacity-60 transition-opacity focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

export default Modal;
