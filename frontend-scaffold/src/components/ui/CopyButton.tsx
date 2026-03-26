import React, { useState, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';
import Button from './Button';

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

const CopyButton: React.FC<CopyButtonProps> = ({ text, label, className = '' }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (copied) {
      timeout = setTimeout(() => {
        setCopied(false);
      }, 2000);
    }
    return () => clearTimeout(timeout);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`flex items-center gap-2 ${className}`}
      onClick={handleCopy}
      type="button"
      title={label || "Copy to clipboard"}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
      {label && <span>{copied ? 'Copied!' : label}</span>}
      {!label && copied && <span className="sr-only">Copied!</span>}
    </Button>
  );
};

export default CopyButton;
