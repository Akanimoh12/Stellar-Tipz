import React from 'react';
import { Link } from 'react-router-dom';
import Button from './Button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    to?: string;
  };
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-16 px-6 text-center">
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
  );
};

export default EmptyState;
