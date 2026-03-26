import React from 'react';
import Loader from './Loader';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const base = 'font-bold uppercase tracking-wide transition-transform duration-200 border-2 border-black';

  const variants: Record<string, string> = {
    primary: 'bg-black text-white hover:-translate-x-1 hover:-translate-y-1',
    outline: 'bg-white text-black hover:-translate-x-1 hover:-translate-y-1',
    ghost: 'bg-transparent text-black border-transparent hover:border-black',
  };

  const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  const shadow = variant !== 'ghost' ? '4px 4px 0px 0px rgba(0,0,0,1)' : 'none';

  const leadingIcon = loading ? <Loader size="sm" /> : icon;

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 ${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      style={{ boxShadow: shadow }}
      {...props}
    >
      {leadingIcon}
      {children}
      {!loading && iconRight}
    </button>
  );
};

export default Button;
