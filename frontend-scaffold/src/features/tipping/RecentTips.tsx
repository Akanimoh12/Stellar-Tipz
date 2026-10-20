import React, { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';

import AmountDisplay from '@/components/shared/AmountDisplay';
import EmptyState from '@/components/ui/EmptyState';
import SkeletonWrapper from '@/components/ui/SkeletonWrapper';
import { useTips } from '@/hooks/useTips';
import { useWalletStore } from '@/store/walletStore';
import { decryptMessage } from '@/helpers/encryption';

import RecentTipsSkeleton from './RecentTipsSkeleton';

interface RecentTipsProps {
  address: string;
}

const RecentTips: React.FC<RecentTipsProps> = ({ address }) => {
  const { tips, loading } = useTips(address, "creator", 3);
  const { publicKey } = useWalletStore();
  const isRecipient = publicKey?.toLowerCase() === address?.toLowerCase();
  const [decrypted, setDecrypted] = useState<Record<number, string>>({});
  const [decrypting, setDecrypting] = useState<Record<number, boolean>>({});
  const [secretKey, setSecretKey] = useState('');

  const handleDecrypt = async (tipId: number, encryptedMessage: string) => {
    if (!secretKey) {
      const key = window.prompt('Enter your Stellar secret key (S...) to decrypt this message:');
      if (!key) return;
      setSecretKey(key);
    }
    setDecrypting((prev) => ({ ...prev, [tipId]: true }));
    try {
      const sk = secretKey || (() => { const k = window.prompt('Enter your Stellar secret key (S...) to decrypt this message:'); return k; })();
      if (!sk) return;
      const plaintext = decryptMessage(encryptedMessage, sk);
      setDecrypted((prev) => ({ ...prev, [tipId]: plaintext }));
      if (!secretKey) setSecretKey(sk);
    } catch {
      window.alert('Failed to decrypt message. Check your secret key.');
    } finally {
      setDecrypting((prev) => ({ ...prev, [tipId]: false }));
    }
  };

  if (tips.length === 0 && !loading) {
    return (
      <EmptyState
        title="No recent tips"
        description="Share your profile to receive your first tip."
        action={{ label: "Go to profile", to: "/dashboard" }}
      />
    );
  }

  return (
    <SkeletonWrapper loading={loading && tips.length === 0} skeleton={<RecentTipsSkeleton />}>
    <div className="space-y-3">
      {tips.map((tip) => {
        const isEncrypted = tip.isEncrypted && tip.message.length > 0;
        const isDecrypted = decrypted[tip.id] !== undefined;
        const displayMessage = isDecrypted
          ? decrypted[tip.id]
          : isEncrypted
            ? null
            : tip.message;

        return (
          <div key={tip.id} className="border-2 border-black p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-gray-800 dark:text-gray-200">
                {isEncrypted ? (
                  <Lock size={14} className="text-amber-600" />
                ) : null}
                Supporter note
              </p>
              <AmountDisplay amount={tip.amount} />
            </div>

            {isEncrypted && !isDecrypted ? (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm font-medium text-gray-500 italic">Message encrypted</span>
                {isRecipient && (
                  <button
                    type="button"
                    onClick={() => handleDecrypt(tip.id, tip.message)}
                    disabled={decrypting[tip.id]}
                    className="ml-2 text-xs font-bold text-blue-600 underline hover:text-blue-800"
                  >
                    {decrypting[tip.id] ? 'Decrypting...' : 'Decrypt'}
                  </button>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm font-medium text-gray-700">
                {isDecrypted && <Unlock size={12} className="inline mr-1 text-green-600" />}
                {displayMessage || 'No message attached.'}
              </p>
            )}
          </div>
        );
      })}
    </div>
    </SkeletonWrapper>
  );
};

export default RecentTips;
