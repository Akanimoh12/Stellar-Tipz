import React, { useEffect, useMemo, useState } from 'react';
import { useHeroPreload } from '../../hooks/useHeroPreload';

import {
  AVATAR_DIMENSIONS,
  AvatarSize,
  getAvatarSizes,
  getAvatarSrcSet,
  normalizeAvatarSrc,
} from '../../helpers/avatarImage';

interface AvatarProps {
  src?: string;
  alt: string;
  size?: AvatarSize;
  address?: string;
  fallback?: string;
  className?: string;
  priority?: boolean;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-12 h-12 text-sm',
  lg: 'w-16 h-16 text-base',
  xl: 'w-24 h-24 text-lg',
};

// Generate a deterministic color from address string
function generateColorFromAddress(address: string): string {
  const colors = [
    'bg-red-500',
    'bg-orange-500',
    'bg-amber-500',
    'bg-yellow-500',
    'bg-lime-500',
    'bg-green-500',
    'bg-emerald-500',
    'bg-teal-500',
    'bg-cyan-500',
    'bg-sky-500',
    'bg-blue-500',
    'bg-indigo-500',
    'bg-violet-500',
    'bg-purple-500',
    'bg-fuchsia-500',
    'bg-pink-500',
    'bg-rose-500',
  ];
  
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    const char = address.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

// Get initials from fallback text
function getInitials(fallback: string): string {
  return fallback.slice(0, 2).toUpperCase();
}

const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  size = 'md',
  address,
  fallback,
  className,
  priority = false,
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [useOptimizedSrcSet, setUseOptimizedSrcSet] = useState(true);
  
  const bgColorClass = useMemo(() => {
    if (address) {
      return generateColorFromAddress(address);
    }
    return 'bg-gray-400';
  }, [address]);

  const normalizedSrc = useMemo(() => normalizeAvatarSrc(src), [src]);
  const displaySize = AVATAR_DIMENSIONS[size];
  const srcSet = useMemo(() => getAvatarSrcSet(src, size), [src, size]);
  const fallbackSrcSet = useMemo(() => getAvatarSrcSet(src, size, 'jpg'), [src, size]);
  useHeroPreload(priority && !imageError ? normalizedSrc : undefined, {
    srcSet: useOptimizedSrcSet ? srcSet : undefined,
    sizes: getAvatarSizes(size),
    type: useOptimizedSrcSet && srcSet ? 'image/webp' : undefined,
  });
  const showImage = Boolean(normalizedSrc) && !imageError;
  const showFallback = !showImage && fallback;
  const showAddressFallback = !showImage && !fallback && address;

  useEffect(() => {
    setImageError(false);
    setImageLoaded(false);
    setUseOptimizedSrcSet(true);
  }, [normalizedSrc, srcSet]);

  return (
    <div
      className={`${sizeClasses[size]} relative border-2 border-black overflow-hidden flex items-center justify-center font-bold text-white bg-gray-100 ${className || ''}`}
      title={alt}
      style={{ aspectRatio: '1 / 1' }}
    >
      {showImage ? (
        <>
          {!imageLoaded && (
            <span
              aria-hidden="true"
              data-testid="avatar-placeholder"
              className="absolute inset-0 z-10 bg-gray-200 animate-pulse"
            />
          )}
          <picture className="contents">
            {useOptimizedSrcSet && srcSet && (
              <source type="image/webp" srcSet={srcSet} sizes={getAvatarSizes(size)} />
            )}
            <img
              src={normalizedSrc}
              alt={alt}
              width={displaySize}
              height={displaySize}
              srcSet={useOptimizedSrcSet ? fallbackSrcSet : undefined}
              sizes={useOptimizedSrcSet && srcSet ? getAvatarSizes(size) : undefined}
              className={`w-full h-full object-cover transition-opacity duration-200 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              loading={priority ? 'eager' : 'lazy'}
              {...{ fetchpriority: priority ? 'high' : 'auto' }}
              decoding={priority ? 'sync' : 'async'}
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                if (useOptimizedSrcSet && srcSet) {
                  setUseOptimizedSrcSet(false);
                  setImageLoaded(false);
                  return;
                }
                setImageError(true);
              }}
            />
          </picture>
        </>
      ) : showFallback ? (
        <div className={`w-full h-full ${bgColorClass} flex items-center justify-center`}>
          {getInitials(fallback)}
        </div>
      ) : showAddressFallback ? (
        <div className={`w-full h-full ${bgColorClass} flex items-center justify-center`}>
          {getInitials(address.slice(-2))}
        </div>
      ) : (
        <div className={`w-full h-full ${bgColorClass} flex items-center justify-center`}>
          ?
        </div>
      )}
    </div>
  );
};

export default Avatar;
