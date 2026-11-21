import React, { useState, useEffect } from 'react';
import { AlertCircle, HeartHandshake, Info, Lock, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import Avatar from '../../components/ui/Avatar';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import type { Profile } from '../../types';
import { useFeeBreakdown } from '../../hooks/useFeeBreakdown';

const PLATFORM_FEE_PERCENT = 0.02;

interface TipConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  creator: Profile;
  amount: string;
  message: string;
  isEncrypted?: boolean;
  submitting?: boolean;
}

export const TipConfirmationModal: React.FC<TipConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  creator,
  amount,
  message,
  isEncrypted = false,
  submitting = false,
}) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const {
    breakdown,
    isEstimating,
    estimationError,
    canSign,
    refresh,
  } = useFeeBreakdown({
    amount,
    platformFeePercent: PLATFORM_FEE_PERCENT,
    isOpen,
  });

  useEffect(() => {
    const saved = localStorage.getItem('tipz_skip_confirmation');
    if (saved === 'true' && isOpen && !submitting && canSign) {
      onConfirm();
    }
  }, [isOpen, onConfirm, submitting, canSign]);

  const handleConfirm = () => {
    if (!canSign) return;
    if (dontShowAgain) {
      localStorage.setItem('tipz_skip_confirmation', 'true');
    }
    onConfirm();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Review Transaction">
      <div className="space-y-6">
        <div className="flex items-center gap-4 border-b-2 border-black pb-4">
          <Avatar
            src={creator.imageUrl || undefined}
            address={creator.owner}
            alt={creator.displayName}
            fallback={creator.displayName}
            size="lg"
          />
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-gray-800 dark:text-gray-200">Recipient</p>
            <h3 className="text-xl font-black uppercase">{creator.displayName}</h3>
            <p className="text-sm font-bold text-gray-600">@{creator.username}</p>
          </div>
        </div>

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

        <div className="space-y-3 bg-gray-50 dark:bg-gray-900 border-2 border-black p-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold uppercase text-gray-800 dark:text-gray-200">Tip Amount</span>
            <div className="text-right">
              <span className="font-black">{breakdown.amountXLM} XLM</span>
              {breakdown.amountFiat && (
                <span className="text-xs font-bold text-gray-600 dark:text-gray-400 block">
                  ≈ {breakdown.amountFiat}
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold uppercase text-gray-800 dark:text-gray-200 flex items-center gap-1">
              Platform Fee ({breakdown.platformFeePercent}%) <Info size={14} className="text-gray-700 dark:text-gray-300" />
            </span>
            <div className="text-right">
              <span className="font-bold">{breakdown.platformFeeXLM} XLM</span>
              {breakdown.platformFeeFiat && (
                <span className="text-xs font-bold text-gray-600 dark:text-gray-400 block">
                  ≈ {breakdown.platformFeeFiat}
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold uppercase text-gray-800 dark:text-gray-200">Network Fee</span>
            <div className="text-right">
              <span className="font-bold text-gray-700 dark:text-gray-300">
                {isEstimating ? "Estimating..." : `${breakdown.networkFeeXLM} XLM`}
              </span>
              {breakdown.networkFeeFiat && !isEstimating && (
                <span className="text-xs font-bold text-gray-600 dark:text-gray-400 block">
                  ≈ {breakdown.networkFeeFiat}
                </span>
              )}
            </div>
          </div>
          <div className="border-t border-dashed border-black pt-2 flex justify-between items-center">
            <span className="text-lg font-black uppercase">Total</span>
            <div className="text-right">
              <span className="text-xl font-black text-black dark:text-white">
                {breakdown.totalXLM} XLM
              </span>
              {breakdown.totalFiat && (
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300 block">
                  ≈ {breakdown.totalFiat}
                </span>
              )}
            </div>
          </div>
        </div>

        {message && (
          <div className="card-brutalist bg-yellow-50 dark:bg-yellow-900/20 p-3">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-black uppercase text-gray-800 dark:text-gray-200">Message</p>
              {isEncrypted && <Lock size={12} className="text-green-700" />}
            </div>
            <p className="italic text-sm">"{message}"</p>
          </div>
        )}

        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="w-5 h-5 border-2 border-black rounded-none appearance-none checked:bg-black relative after:content-['✓'] after:hidden checked:after:block after:text-white after:absolute after:inset-0 after:flex after:items-center after:justify-center font-bold"
          />
          <span className="text-sm font-bold group-hover:underline">Don't show this confirmation again</span>
        </label>

        <div className="flex flex-col gap-3 sm:flex-row pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="button"
            loading={submitting || isEstimating}
            disabled={submitting || !canSign || Boolean(estimationError)}
            onClick={handleConfirm}
            icon={<HeartHandshake size={18} />}
            className="flex-1"
          >
            Confirm & Sign
          </Button>
        </div>
      </div>
    </Modal>
  );
};
