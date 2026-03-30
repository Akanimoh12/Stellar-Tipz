import React from 'react';

interface SkeletonProps {
  width?: string;
  height?: string;
  variant?: 'text' | 'rect' | 'circle';
  lines?: number;
  className?: string;
}

const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  variant = 'text',
  lines = 1,
  className = '',
}) => {
  const baseClasses = `animate-pulse border-2 border-black ${className}`;
  const bgClasses = 'bg-gray-200'; // Pulsing will be mostly handled by Tailwind's animate-pulse, we can add a custom pulse in CSS if we specifically need grey-100 to grey-200, but standard is fine. Actually, let's inject a style or use standard animate-pulse with a gray background.
  
  // Custom keyframes could be added but Tailwind's default animate-pulse changes opacity which looks close enough if combined with a base background. For brutalism, using a straight gray background is preferred.
  
  if (variant === 'text') {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${baseClasses} ${bgClasses} rounded-full`}
            style={{
              width: width || (lines > 1 && i === lines - 1 ? '70%' : '100%'),
              height: height || '1rem',
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`${baseClasses} ${bgClasses} ${
        variant === 'circle' ? 'rounded-full' : 'rounded-none'
      }`}
      style={{
        width: width || (variant === 'circle' ? '3rem' : '100%'),
        height: height || (variant === 'circle' ? '3rem' : '10rem'),
      }}
    />
  );
};

export default Skeleton;
