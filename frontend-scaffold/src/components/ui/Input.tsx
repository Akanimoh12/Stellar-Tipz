import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  const errorId = error ? `${inputId}-error` : undefined;
  const helperTextId = helperText ? `${inputId}-helper` : undefined;
  
  // Build aria-describedby from available helper elements
  const describedBy = [errorId, helperTextId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-bold uppercase tracking-wide mb-2"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full px-4 py-3 border-2 bg-white text-black font-medium
          focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus:shadow-brutalist
          placeholder:text-gray-400 ${
            error ? 'border-red-500' : 'border-black'
          } ${className}`}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={describedBy}
        {...props}
      />
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-500 font-medium">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p id={helperTextId} className="mt-1 text-sm text-gray-600 font-medium">
          {helperText}
        </p>
      )}
    </div>
  );
};

export default Input;