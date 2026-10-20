import React from 'react';

interface PageContainerProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  ariaLabel?: string;
}

const PageContainer: React.FC<PageContainerProps> = ({
  children,
  maxWidth = 'lg',
  className = '',
  ariaLabel,
  ...props
}) => {
  const widths: Record<string, string> = {
    sm: 'max-w-2xl',
    md: 'max-w-4xl',
    lg: 'max-w-6xl',
    xl: 'max-w-7xl',
  };

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={`${widths[maxWidth]} mx-auto px-4 py-8 ${className} focus:outline-none`}
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </main>
  );
};

export default PageContainer;
