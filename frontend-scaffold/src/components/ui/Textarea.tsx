import React, { useState } from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  maxLength?: number;
  rows?: number;
  /** Character count at which the counter turns yellow (warning). */
  warnAt?: number;
  /** Character count at which the counter turns red (danger). */
  dangerAt?: number;
}

const Textarea: React.FC<TextareaProps> = ({
  label,
  error,
  maxLength,
  rows = 4,
  className = '',
  id,
  onChange,
  value,
  defaultValue,
  warnAt,
  dangerAt,
  ...props
}) => {
  const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');
  const [charCount, setCharCount] = useState(() => {
    const initialValue = value?.toString() || defaultValue?.toString() || '';
    return initialValue.length;
  });

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCharCount(e.target.value.length);
    onChange?.(e);
  };

  const getCounterColor = () => {
    if (!maxLength) return 'text-gray-500';
    if (charCount >= maxLength) return 'text-red-600';
    if (dangerAt !== undefined && charCount >= dangerAt) return 'text-red-600';
    if (warnAt !== undefined && charCount >= warnAt) return 'text-yellow-500';
    return 'text-gray-500';
  };

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={textareaId}
          className="block text-sm font-bold uppercase tracking-wide mb-2"
        >
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        rows={rows}
        maxLength={maxLength}
        className={`w-full px-4 py-3 border-2 border-black bg-white text-black font-medium
          focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus:shadow-brutalist
          placeholder:text-gray-400 resize-y ${error ? 'border-red-600' : ''} ${className}`}
        onChange={handleChange}
        value={value}
        defaultValue={defaultValue}
        {...props}
      />
      <div className="flex justify-between items-center mt-1">
        {error ? (
          <p className="text-sm text-red-600 font-medium">{error}</p>
        ) : (
          <div />
        )}
        {maxLength && (
          <p data-testid="char-counter" className={`text-sm font-medium ${getCounterColor()}`}>
            {charCount} / {maxLength}
          </p>
        )}
      </div>
    </div>
  );
};

export default Textarea;
