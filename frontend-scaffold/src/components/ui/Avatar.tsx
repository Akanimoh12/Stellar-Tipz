import React, { useState, useMemo } from 'react';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  src?: string;
  alt: string;
  size?: AvatarSize;
  address?: string;
  fallback?: string;
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
}) => {
  const [imageError, setImageError] = useState(false);
  
  const bgColorClass = useMemo(() => {
    if (address) {
      return generateColorFromAddress(address);
    }
    return 'bg-gray-400';
  }, [address]);

  const showImage = src && !imageError;
  const showFallback = !showImage && fallback;
  const showAddressFallback = !showImage && !fallback && address;

  return (
    <div
      className={`${sizeClasses[size]} border-2 border-black overflow-hidden flex items-center justify-center font-bold text-white`}
      title={alt}
    >
    {showImage ? (
        <picture>
          <source type="image/webp" srcSet={src.replace(/\.(png|jpe?g)$/i, '.webp')} />
          <img
            src={src}
            alt={alt}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setImageError(true)}
          />
        </picture>
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
