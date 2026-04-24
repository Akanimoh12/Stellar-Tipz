import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
  hover?: boolean;
  isClickable?: boolean;
  onClick?: () => void;
  href?: string;
  as?: 'div' | 'button' | 'a';
}

const Card: React.FC<CardProps> = ({
  children,
  className = '',
  padding = 'md',
  hover = false,
  isClickable = false,
  onClick,
  href,
  as,
}) => {
  const paddings: Record<string, string> = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  // Determine the component type
  let Component: React.ElementType = as || 'div';
  if (href && !as) Component = 'a';
  if (isClickable && !href && !as) Component = 'button';

  // Interactive states
  const isInteractive = isClickable || onClick || href;
  
  const hoverClass = (hover || isInteractive)
    ? 'hover:-translate-x-1 hover:-translate-y-1 hover:border-gray-800 transition-all duration-200 hover:shadow-brutalist-lg'
    : '';

  const interactiveClass = isInteractive
    ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2'
    : '';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick?.();
    }
  };

  const props: any = {
    className: `bg-white border-3 border-black ${paddings[padding]} ${hoverClass} ${interactiveClass} ${className}`,
    style: { boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' },
  };

  if (Component === 'button') {
    props.type = 'button';
    props.onClick = onClick;
    props.onKeyDown = handleKeyDown;
  } else if (Component === 'a') {
    props.href = href;
    props.onClick = onClick;
  } else if (isInteractive) {
    props.role = 'button';
    props.tabIndex = 0;
    props.onClick = onClick;
    props.onKeyDown = handleKeyDown;
  }

  return <Component {...props}>{children}</Component>;
};

export default Card;