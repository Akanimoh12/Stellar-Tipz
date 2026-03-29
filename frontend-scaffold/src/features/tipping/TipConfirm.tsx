import React from 'react';
import { HeartHandshake } from 'lucide-react';

import Avatar from '../../components/ui/Avatar';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import type { Profile } from '../../types';

const ESTIMATED_TX_FEE = '0.00001';

interface TipConfirmProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  creator: Profile;
  amount: string;
  message: string;
  submitting?: boolean;
}

const TipConfirm: React.FC<TipConfirmProps> = ({
  isOpen,
  onClose,
  onConfirm,
  creator,
  amount,
  message,
  submitting = false,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirm Tip">
      <div className="space-y-5">
        {/* Headline */}
        <p className="text-sm font-bold text-gray-700">
          You&apos;re sending{' '}
          <span className="text-black">{amount} XLM</span> to{' '}
          <span className="text-black">@{creator.username}</span>
        </p>

        {/* Summary card */}
        <div className="border-2 border-black bg-gray-50 p-4 space-y-4">
          {/* Creator row */}
          <div className="flex items-center gap-3">
            <Avatar
              address={creator.owner}
              alt={creator.displayName || creator.username}
              fallback={creator.displayName || creator.username}
              size="md"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-black">
                {creator.displayName || creator.username}
              </p>
              <p className="text-xs font-bold text-gray-500">
                @{creator.username}
              </p>
            </div>
          </div>

          {/* Detail rows */}
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="font-bold uppercase tracking-wide text-gray-500 text-xs">
                Amount
              </dt>
              <dd className="font-black tabular-nums">{amount} XLM</dd>
            </div>

            <div className="flex items-start justify-between gap-4">
              <dt className="flex-shrink-0 font-bold uppercase tracking-wide text-gray-500 text-xs">
                Message
              </dt>
              <dd
                className="min-w-0 truncate text-right text-gray-700"
                title={message || 'No message'}
              >
                {message || '—'}
              </dd>
            </div>

            <div className="flex items-center justify-between border-t border-dashed border-gray-300 pt-2">
              <dt className="font-bold uppercase tracking-wide text-gray-500 text-xs">
                Est. TX Fee
              </dt>
              <dd className="font-bold text-gray-500 tabular-nums">
                ~{ESTIMATED_TX_FEE} XLM
              </dd>
            </div>
          </dl>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
            className="sm:flex-1"
          >
            Cancel
          </Button>
          <Button
            type="button"
            loading={submitting}
            onClick={onConfirm}
            icon={<HeartHandshake size={18} />}
            className="sm:flex-1"
          >
            Confirm &amp; Sign
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default TipConfirm;
