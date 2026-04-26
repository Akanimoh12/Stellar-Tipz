import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useToastStore } from '@/store/toastStore';

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  label = 'Copy',
  className = '',
  size = 'md',
}) => {
  const [copied, setCopied] = useState(false);
  const { addToast } = useToastStore();

  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for browsers without Clipboard API
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } catch (err) {
          throw new Error('Copy failed');
        }
        document.body.removeChild(textArea);
      }

      setCopied(true);
      addToast({
        message: 'Copied to clipboard',
        type: 'success',
        priority: 'low',
        duration: 2000,
      });

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      addToast({
        message: 'Failed to copy',
        type: 'error',
        priority: 'medium',
        duration: 3000,
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center justify-center rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied!' : label}
    >
      {copied ? (
        <Check className={`${sizeClasses[size]} text-green-500`} aria-hidden="true" />
      ) : (
        <Copy className={`${sizeClasses[size]} text-gray-500 hover:text-gray-700`} aria-hidden="true" />
      )}
    </button>
  );
};

export default CopyButton;
