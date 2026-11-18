import React, { useState, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';
import Button from './Button';
import { logger } from '../../services/logger';

type CopyButtonSize = 'sm' | 'md' | 'lg';

interface CopyButtonProps {
  /** Text written to the clipboard. */
  text: string;
  /** Optional visible label rendered next to the icon. */
  label?: string;
  className?: string;
  /** Icon size. Defaults to `sm` (16px). */
  size?: CopyButtonSize;
}

const ICON_SIZES: Record<CopyButtonSize, number> = {
  sm: 16,
  md: 20,
  lg: 24,
};

/**
 * Writes text to the clipboard, falling back to a hidden textarea and
 * `document.execCommand('copy')` when the async Clipboard API is unavailable
 * (older browsers, insecure contexts).
 */
async function writeToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  try {
    textArea.focus();
    textArea.select();
    if (!document.execCommand('copy')) {
      throw new Error('Copy command was rejected');
    }
  } finally {
    document.body.removeChild(textArea);
  }
}

const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  label,
  className = '',
  size = 'sm',
}) => {
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
      await writeToClipboard(text);
      setCopied(true);
    } catch (err) {
      logger.error('components/ui/CopyButton', 'Failed to copy text', undefined, err instanceof Error ? err : new Error(String(err)));
    }
  };

  const iconSize = ICON_SIZES[size];

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`flex items-center gap-2 ${className}`}
      onClick={handleCopy}
      type="button"
      title={label || "Copy to clipboard"}
      aria-label={label ? undefined : copied ? "Copied" : "Copy to clipboard"}
    >
      {copied ? (
        <Check size={iconSize} aria-hidden="true" />
      ) : (
        <Copy size={iconSize} aria-hidden="true" />
      )}
      {label && <span>{copied ? 'Copied!' : label}</span>}
      {!label && copied && <span className="sr-only">Copied!</span>}
    </Button>
  );
};

export default CopyButton;
