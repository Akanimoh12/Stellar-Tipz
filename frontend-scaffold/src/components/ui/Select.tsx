import React from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectOption { value: string; label: string; }
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string; error?: string; options: SelectOption[]; placeholder?: string;
}

const Select: React.FC<SelectProps> = ({ label, error, options, placeholder, className = '', id, ...props }) => {
  const generatedId = React.useId();
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-') || generatedId;
  const errorId = error ? `${selectId}-error` : undefined;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-bold uppercase tracking-wide mb-2">{label}</label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={`w-full px-4 py-3 border-2 border-black bg-white text-black font-medium
            focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus:shadow-brutalist
            appearance-none cursor-pointer
            dark:bg-zinc-900 dark:text-white dark:border-white
            ${error ? 'border-red-600' : ''} ${className}`}
          aria-invalid={error ? 'true' : 'false'} aria-describedby={errorId} {...props}
        >
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <ChevronDown className="w-5 h-5 text-black" />
        </div>
      </div>
      {error && (
        <p id={errorId} role="alert" aria-live="assertive" className="mt-1 text-sm text-red-600 font-medium">{error}</p>
      )}
    </div>
  );
};

export default Select;
