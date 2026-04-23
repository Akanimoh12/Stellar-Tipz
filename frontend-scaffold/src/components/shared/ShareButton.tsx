import React, { useState } from 'react';
import { Share2, Twitter, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ShareButtonProps {
  url?: string;
  title?: string;
  text?: string;
  className?: string;
}

export const ShareButton: React.FC<ShareButtonProps> = ({
  url = window.location.href,
  title = 'Stellar Tipz',
  text = 'Support me on @TipzApp! 💫',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareData = {
    title,
    text: `${text} ${url}`,
    url,
  };

  const handleWebShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      setIsOpen(!isOpen);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const shareOnTwitter = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={handleWebShare}
        className="btn-brutalist flex items-center gap-2"
        aria-label="Share"
      >
        <Share2 size={20} />
        <span>Share</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-full mb-4 right-0 z-50 min-w-[200px] card-brutalist flex flex-col gap-2 shadow-2xl"
          >
            <button
              onClick={shareOnTwitter}
              className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
            >
              <Twitter size={18} className="text-[#1DA1F2]" />
              <span className="font-bold uppercase text-sm">Twitter</span>
            </button>
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
            >
              {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
              <span className="font-bold uppercase text-sm">
                {copied ? 'Copied!' : 'Copy Link'}
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
