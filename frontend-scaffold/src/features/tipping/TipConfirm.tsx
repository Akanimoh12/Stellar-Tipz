import React from 'react';
import { AlertCircle, HeartHandshake, RefreshCw } from 'lucide-react';

import Avatar from '../../components/ui/Avatar';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import type { Profile } from '../../types';
import { useFeeBreakdown } from '../../hooks/useFeeBreakdown';

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
  const {
    breakdown,
    isEstimating,
    estimationError,
    canSign,
    refresh,
  } = useFeeBreakdown({
    amount,
    platformFeePercent: 0.02,
    isOpen,
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirm Tip">
      <div className="space-y-5">
        {/* Headline */}
        <p className="text-sm font-bold text-gray-700">
          You&apos;re sending{' '}
          <span className="text-black">{amount} XLM</span> to{' '}
          <span className="text-black">@{creator.username}</span>
        </p>

        {estimationError && (
          <div
            className="p-3 border-2 border-red-500 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm font-bold"
            role="alert"
          >
            <div className="flex items-start gap-2">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <p>{estimationError}</p>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-black uppercase underline hover:text-black dark:hover:text-white"
                >
                  <RefreshCw size={12} className={isEstimating ? "animate-spin" : ""} /> Retry Estimation
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Summary card */}
        <div className="border-2 border-black bg-gray-50 dark:bg-gray-900 p-4 space-y-4">
          {/* Creator row */}
          <div className="flex items-center gap-3">
            <Avatar
              src={creator.imageUrl || undefined}
              address={creator.owner}
              alt={creator.displayName || creator.username}
              fallback={creator.displayName || creator.username}
              size="md"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-black">
                {creator.displayName || creator.username}
              </p>
              <p className="text-xs font-bold text-gray-800 dark:text-gray-200">
                @{creator.username}
              </p>
            </div>
          </div>

          {/* Detail rows */}
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="font-bold uppercase tracking-wide text-gray-800 dark:text-gray-200 text-xs">
                Amount
              </dt>
              <dd className="font-black tabular-nums text-right">
                <span>{breakdown.amountXLM} XLM</span>
                {breakdown.amountFiat && (
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-400 block">
                    ≈ {breakdown.amountFiat}
                  </span>
                )}
              </dd>
            </div>

            <div className="flex items-center justify-between">
              <dt className="font-bold uppercase tracking-wide text-gray-800 dark:text-gray-200 text-xs">
                Platform Fee ({breakdown.platformFeePercent}%)
              </dt>
              <dd className="font-bold tabular-nums text-right">
                <span>{breakdown.platformFeeXLM} XLM</span>
                {breakdown.platformFeeFiat && (
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-400 block">
                    ≈ {breakdown.platformFeeFiat}
                  </span>
                )}
              </dd>
            </div>

            <div className="flex items-start justify-between gap-4">
              <dt className="flex-shrink-0 font-bold uppercase tracking-wide text-gray-800 dark:text-gray-200 text-xs">
                Message
              </dt>
              <dd
                className="min-w-0 truncate text-right text-gray-700"
                title={message || 'No message'}
              >
                {message || '—'}
              </dd>
            </div>

            <div className="flex items-center justify-between border-t border-dashed border-gray-300 dark:border-gray-700 pt-2">
              <dt className="font-bold uppercase tracking-wide text-gray-800 dark:text-gray-200 text-xs">
                Network Fee
              </dt>
              <dd className="font-bold text-gray-800 dark:text-gray-200 tabular-nums text-right">
                <span>{isEstimating ? "Estimating..." : `${breakdown.networkFeeXLM} XLM`}</span>
                {breakdown.networkFeeFiat && !isEstimating && (
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-400 block">
                    ≈ {breakdown.networkFeeFiat}
                  </span>
                )}
              </dd>
            </div>

            <div className="flex items-center justify-between border-t border-black dark:border-white pt-2">
              <dt className="font-black uppercase tracking-wide text-sm">
                Total
              </dt>
              <dd className="font-black tabular-nums text-right text-base">
                <span>{breakdown.totalXLM} XLM</span>
                {breakdown.totalFiat && (
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                    ≈ {breakdown.totalFiat}
                  </span>
                )}
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
            loading={submitting || isEstimating}
            disabled={submitting || !canSign || Boolean(estimationError)}
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
