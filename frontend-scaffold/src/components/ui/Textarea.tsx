import React, { useState } from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  maxLength?: number;
  rows?: number;
  warnAt?: number;
  dangerAt?: number;
}

const Textarea: React.FC<TextareaProps> = ({
  label, error, maxLength, rows = 4, className = '', id,
  onChange, value, defaultValue, warnAt, dangerAt, ...props
}) => {
  const generatedId = React.useId();
  const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-') || generatedId;
  const errorId = error ? `${textareaId}-error` : undefined;
  const counterId = maxLength ? `${textareaId}-counter` : undefined;
  const [charCount, setCharCount] = useState(() => {
    const initialValue = value?.toString() || defaultValue?.toString() || '';
    return initialValue.length;
  });

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCharCount(e.target.value.length);
    onChange?.(e);
  };

  const getCounterColor = () => {
    if (!maxLength) return 'text-gray-800 dark:text-gray-200';
    if (charCount >= maxLength) return 'text-red-600';
    if (dangerAt !== undefined && charCount >= dangerAt) return 'text-red-600';
    if (warnAt !== undefined && charCount >= warnAt) return 'text-yellow-500';
    return 'text-gray-800 dark:text-gray-200';
  };

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={textareaId} className="block text-sm font-bold uppercase tracking-wide mb-2">
          {label}
        </label>
      )}
      <textarea
        id={textareaId} rows={rows} maxLength={maxLength}
        className={`w-full px-4 py-3 border-2 border-black bg-white text-black font-medium
          focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus:shadow-brutalist
          placeholder:text-gray-700 dark:text-gray-300 dark:placeholder:text-gray-400 resize-y ${error ? 'border-red-600' : ''} ${className}`}
        onChange={handleChange}
        value={value}
        defaultValue={defaultValue}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={[errorId, counterId].filter(Boolean).join(' ') || undefined}
        {...props}
      />
      <div className="flex justify-between items-center mt-1">
        {error ? (
          <p id={errorId} role="alert" aria-live="assertive" className="text-sm text-red-600 font-medium">{error}</p>
        ) : <div />}
        {maxLength && (
          <p id={counterId} data-testid="char-counter" className={`text-sm font-medium ${getCounterColor()}`}>
            {charCount} / {maxLength}
          </p>
        )}
      </div>
    </div>
  );
};

export default Textarea;
