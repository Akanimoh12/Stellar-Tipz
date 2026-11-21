import React from 'react';
import { Link } from 'react-router-dom';
import Button from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Primary CTA action. */
  action?: {
    label: string;
    onClick?: () => void;
    to?: string;
  };
  /** 'empty' = genuinely empty, 'filtered' = filtered to zero results. */
  variant?: 'empty' | 'filtered';
  /** Callback for the "Clear filters" button (only shown when variant is 'filtered'). */
  onClearFilters?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  variant = 'empty',
  onClearFilters,
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-5 py-16 px-6 text-center"
    >
      {icon && (
        <div className="p-4 bg-gray-50 border-2 border-black">
          <div className="text-gray-600">
            {icon}
          </div>
        </div>
      )}
      <h3 className="font-black uppercase tracking-wide text-xl">
        {title}
      </h3>
      {description && (
        <p className="text-sm font-bold text-gray-600 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      <div className="flex items-center gap-3">
        {variant === 'filtered' && onClearFilters && (
          <Button variant="outline" onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
        {action && (
          action.to ? (
            <Link to={action.to}>
              <Button variant="outline">
                {action.label}
              </Button>
            </Link>
          ) : (
            <Button variant="outline" onClick={action.onClick}>
              {action.label}
            </Button>
          )
        )}
      </div>
    </div>
  );
};

export default EmptyState;
