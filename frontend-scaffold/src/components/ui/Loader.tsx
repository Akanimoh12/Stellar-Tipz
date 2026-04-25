import React from 'react';

interface LoaderProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  role?: string;
  'aria-label'?: string;
}

const Loader: React.FC<LoaderProps> = ({
  size = 'md',
  text,
  role,
  'aria-label': ariaLabel
}) => {
  const sizes: Record<string, string> = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-3',
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`${sizes[size]} border-black border-t-transparent rounded-full animate-spin`}
        role={role}
        aria-label={ariaLabel}
      />
      {text && (
        <p className="text-sm font-bold uppercase tracking-wide">{text}</p>
      )}
    </div>
  );
};

export default Loader;
