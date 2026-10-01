import React, { useState, useEffect } from 'react';
import Avatar from '@/components/ui/Avatar';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

interface ImageUploadProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

/**
 * ImageUpload component allows users to preview their profile image URL or IPFS CID before saving.
 */
const ImageUpload: React.FC<ImageUploadProps> = ({ value, onChange, error, disabled }) => {
  const [loadError, setLoadError] = useState<string | null>(null);

  const isIPFSCID = (val: string) => {
    // Basic CID check: CIDv0 (Qm...) or CIDv1 (bafy...)
    return /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-zA-Z0-9]{55,})$/.test(val);
  };

  const getFullUrl = (val: string) => {
    if (!val) return '';
    if (isIPFSCID(val)) {
      return `https://ipfs.io/ipfs/${val}`;
    }
    return val;
  };

  const previewUrl = getFullUrl(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (loadError) setLoadError(null);
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [value, loadError]);

  const handleTestUrl = () => {
    if (!value) return;
    const url = getFullUrl(value);

    const img = new Image();
    img.onload = () => {
      setLoadError(null);
    };
    img.onerror = () => {
      setLoadError('Failed to load image. Please check the URL or CID.');
    };
    img.src = url;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <div className="relative pt-2">
          <Avatar
            src={previewUrl}
            alt={value ? 'Profile picture preview' : 'Profile picture placeholder'}
            size="xl"
            fallback="?"
          />
          {loadError && (
            <div
              className="absolute -bottom-1 -right-1 bg-red-600 text-white p-1 rounded-full border-2 border-black"
              title={loadError}
              role="img"
              aria-label={loadError}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          )}
        </div>

        <div className="flex-1 w-full space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                label="Profile Image"
                placeholder="Paste an image URL or IPFS CID"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                error={error || (loadError ? loadError : undefined)}
                disabled={disabled}
              />
            </div>
            <div className="mb-[2px]">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={handleTestUrl}
                disabled={disabled || !value}
                className="whitespace-nowrap h-[52px]"
              >
                Test URL
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-gray-800 dark:text-gray-200 font-black uppercase tracking-[0.2em]">
            Supporting direct URLs and IPFS CID hashes
          </p>
        </div>
      </div>
    </div>
  );
};

export default ImageUpload;
