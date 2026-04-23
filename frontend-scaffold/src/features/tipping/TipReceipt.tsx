import React, { useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, Share2, ExternalLink, ArrowLeft, RefreshCw, Home } from 'lucide-react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';

import PageContainer from '../../components/layout/PageContainer';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Avatar from '../../components/ui/Avatar';
import { ShareButton } from '../../components/shared/ShareButton';

const PLATFORM_FEE_PERCENT = 0.02;

const TipReceipt: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { tipData } = (location.state as { tipData: any }) || {};

  useEffect(() => {
    if (tipData) {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(() => {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);

      return () => clearInterval(interval);
    }
  }, [tipData]);

  if (!tipData) {
    return (
      <PageContainer maxWidth="md" className="py-20 text-center">
        <Card className="p-10 space-y-6">
          <div className="flex justify-center">
            <div className="p-4 bg-red-100 rounded-full text-red-600">
              <RefreshCw size={48} />
            </div>
          </div>
          <h1 className="text-3xl font-black uppercase">No Receipt Found</h1>
          <p className="text-gray-500 font-bold">We couldn't find the details for this transaction.</p>
          <Button onClick={() => navigate('/')} className="w-full btn-brutalist">
            Go to Home
          </Button>
        </Card>
      </PageContainer>
    );
  }

  const { amount, recipient, message, txHash } = tipData;
  const numAmount = parseFloat(amount);
  const fee = numAmount * PLATFORM_FEE_PERCENT;
  const netTip = numAmount; // The user enters the amount they want the creator to receive? 
  // Actually usually fee is on top or deducted. Let's assume user entered total and net is deducted.
  // Wait, TipConfirmationModal calculated total = amount + fee. 
  // So amount is net tip.
  const totalPaid = numAmount + fee;

  return (
    <PageContainer maxWidth="md" className="py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-8"
      >
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.2 }}
              className="p-4 bg-green-500 text-white rounded-none border-4 border-black shadow-brutalist"
            >
              <CheckCircle2 size={48} />
            </motion.div>
          </div>
          <h1 className="text-4xl font-black uppercase tracking-tight">Tip Sent!</h1>
          <p className="text-xl font-bold text-gray-600">
            You just supported <span className="text-black">@{recipient.username}</span>
          </p>
        </div>

        <Card className="p-0 overflow-hidden border-4 border-black shadow-brutalist">
          <div className="bg-black text-white p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Avatar
                address={recipient.owner}
                alt={recipient.displayName}
                fallback={recipient.displayName}
                size="lg"
                className="border-2 border-white"
              />
              <div>
                <h2 className="text-xl font-black uppercase">{recipient.displayName}</h2>
                <p className="text-sm font-bold opacity-70">@{recipient.username}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-black uppercase opacity-50">Transaction Date</p>
              <p className="font-bold">{new Date().toLocaleDateString()}</p>
            </div>
          </div>

          <div className="p-8 space-y-8">
            <div className="grid grid-cols-2 gap-8 border-b-2 border-dashed border-gray-200 pb-8">
              <div>
                <p className="text-xs font-black uppercase text-gray-400 mb-1">Amount Sent</p>
                <p className="text-3xl font-black">{numAmount.toFixed(2)} XLM</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-black uppercase text-gray-400 mb-1">Platform Fee (2%)</p>
                <p className="text-xl font-bold">{fee.toFixed(4)} XLM</p>
              </div>
            </div>

            {message && (
              <div className="space-y-2">
                <p className="text-xs font-black uppercase text-gray-400">Your Message</p>
                <div className="p-4 bg-yellow-50 border-2 border-black italic font-medium">
                  "{message}"
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex justify-between items-center bg-gray-50 p-4 border-2 border-black">
                <span className="text-sm font-black uppercase">Transaction Hash</span>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono bg-white px-2 py-1 border border-gray-200">
                    {txHash.substring(0, 8)}...{txHash.substring(txHash.length - 8)}
                  </code>
                  <a
                    href={`https://stellar.expert/explorer/public/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 hover:bg-gray-200 transition-colors"
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ShareButton 
                url={`https://tipz.app/@${recipient.username}`}
                text={`I just tipped @${recipient.username} on @TipzApp! 💫`}
                className="w-full"
              />
              <Button
                variant="outline"
                className="w-full flex items-center justify-center gap-2"
                onClick={() => navigate(`/@${recipient.username}`)}
                icon={<RefreshCw size={18} />}
              >
                Tip Again
              </Button>
            </div>
          </div>
        </Card>

        <div className="flex justify-center gap-6">
          <Link
            to={`/@${recipient.username}`}
            className="flex items-center gap-2 font-black uppercase text-sm hover:underline"
          >
            <ArrowLeft size={16} /> Back to Profile
          </Link>
          <Link
            to="/dashboard"
            className="flex items-center gap-2 font-black uppercase text-sm hover:underline"
          >
            <Home size={16} /> My Dashboard
          </Link>
        </div>
      </motion.div>
    </PageContainer>
  );
};

export default TipReceipt;
