import React, { useState, useRef, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  requireTyping?: string;
  consequences?: string[];
  loading?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  requireTyping,
  consequences = [],
  loading = false,
}) => {
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const isConfirmEnabled = requireTyping 
    ? typedConfirmation === requireTyping && !loading
    : !loading;

  useEffect(() => {
    if (isOpen) {
      setTypedConfirmation('');
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (isConfirmEnabled) {
      onConfirm();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isConfirmEnabled) {
      handleConfirm();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="confirm-dialog-title"
      ariaDescribedBy="confirm-dialog-description"
      closeOnEscape={!requireTyping}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <h2 
              id="confirm-dialog-title" 
              className="text-xl font-black uppercase text-gray-900"
            >
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Message */}
        <div id="confirm-dialog-description" className="space-y-4">
          <p className="text-base text-gray-700">{message}</p>
          
          {/* Consequences */}
          {consequences.length > 0 && (
            <div className="rounded-lg border-2 border-red-200 bg-red-50 p-4">
              <h3 className="mb-2 text-sm font-black uppercase text-red-800">
                This action will:
              </h3>
              <ul className="space-y-1 text-sm text-red-700">
                {consequences.map((consequence, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
                    {consequence}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Type to confirm */}
          {requireTyping && (
            <div className="space-y-2">
              <label 
                htmlFor="confirm-input"
                className="block text-sm font-black uppercase text-gray-700"
              >
                Type "{requireTyping}" to confirm:
              </label>
              <Input
                id="confirm-input"
                ref={inputRef}
                value={typedConfirmation}
                onChange={(e) => setTypedConfirmation(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={requireTyping}
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!isConfirmEnabled}
            loading={loading}
            className="flex-1 bg-red-600 text-white hover:bg-red-700 border-red-600"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;