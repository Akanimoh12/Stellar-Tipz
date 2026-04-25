import React, { useState, useEffect } from 'react';
import { HeartHandshake, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import Avatar from '../../components/ui/Avatar';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import type { Profile } from '../../types';

const ESTIMATED_TX_FEE = '0.00001';
const PLATFORM_FEE_PERCENT = 0.02;

interface TipConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  creator: Profile;
  amount: string;
  message: string;
  isAnonymous?: boolean;
  submitting?: boolean;
}

export const TipConfirmationModal: React.FC<TipConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  creator,
  amount,
  message,
  isAnonymous = false,
  submitting = false,
}) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const platformFee = numAmount * PLATFORM_FEE_PERCENT;
  const total = numAmount + platformFee + parseFloat(ESTIMATED_TX_FEE);

  useEffect(() => {
    const saved = localStorage.getItem('tipz_skip_confirmation');
    if (saved === 'true' && isOpen && !submitting) {
      onConfirm();
    }
  }, [isOpen, onConfirm, submitting]);

  const handleConfirm = () => {
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
            address={creator.owner}
            alt={creator.displayName}
            fallback={creator.displayName}
            size="lg"
          />
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-gray-500">Recipient</p>
            <h3 className="text-xl font-black uppercase">{creator.displayName}</h3>
            <p className="text-sm font-bold text-gray-600">@{creator.username}</p>
          </div>
          {isAnonymous && (
            <div className="ml-auto bg-gray-200 border-2 border-black px-2 py-1 text-[10px] font-black uppercase">
              Anonymous
            </div>
          )}
        </div>

        <div className="space-y-3 bg-gray-50 dark:bg-gray-900 border-2 border-black p-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold uppercase text-gray-500">Tip Amount</span>
            <span className="font-black">{numAmount.toFixed(2)} XLM</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold uppercase text-gray-500 flex items-center gap-1">
              Platform Fee (2%) <Info size={14} className="text-gray-400" />
            </span>
            <span className="font-bold">{platformFee.toFixed(4)} XLM</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold uppercase text-gray-500">Network Fee</span>
            <span className="font-bold text-gray-400">{ESTIMATED_TX_FEE} XLM</span>
          </div>
          <div className="border-t border-dashed border-black pt-2 flex justify-between items-center">
            <span className="text-lg font-black uppercase">Total</span>
            <span className="text-xl font-black text-black dark:text-white">
              {total.toFixed(5)} XLM
            </span>
          </div>
        </div>

        {message && (
          <div className="card-brutalist bg-yellow-50 dark:bg-yellow-900/20 p-3">
            <p className="text-xs font-black uppercase mb-1 text-gray-500">Message</p>
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
            loading={submitting}
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
