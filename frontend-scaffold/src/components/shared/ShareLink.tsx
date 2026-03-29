import React, { useState } from 'react';
import Button from '../ui/Button';

interface ShareLinkProps {
  username: string;
  domain?: string;
}

const ShareLink: React.FC<ShareLinkProps> = ({
  username,
  domain = import.meta.env.VITE_APP_URL || window.location.origin,
}) => {
  const [copied, setCopied] = useState(false);

  const tipUrl = `${domain}/@${username}`;

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(tipUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const handleShareOnX = () => {
    const tweetText = 'Send me tips on Stellar!';
    const encodedUrl = encodeURIComponent(tipUrl);
    const encodedText = encodeURIComponent(tweetText);
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
  };

  return (
    <div className="flex items-center gap-2 bg-white border-2 border-black p-2">
      <input
        type="text"
        value={tipUrl}
        readOnly
        className="flex-1 bg-white border-2 border-black px-3 py-1.5 text-sm font-mono focus:outline-none"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopyToClipboard}
        title={copied ? 'Copied!' : 'Copy to clipboard'}
      >
        {copied ? 'Copied!' : 'Copy'}
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={handleShareOnX}
      >
        Share on X
      </Button>
    </div>
  );
};

export default ShareLink;
