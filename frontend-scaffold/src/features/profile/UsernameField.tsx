/**
 * Username input with inline availability indicator and suggestion chips.
 *
 * Extracted from RegisterForm to keep the parent component focused on form
 * orchestration. The availability indicator SVGs and suggestion chips are
 * purely presentational — they live here so RegisterForm doesn't balloon.
 */

import React from "react";
import Input from "@/components/ui/Input";
import { ProfileFormData } from "@/types/profile";

interface UsernameFieldProps {
  value: string;
  error: string | undefined;
  disabled: boolean;
  checking: boolean;
  available: boolean | null;
  availabilityError: string | undefined;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onSelectSuggestion: (username: string) => void;
}

export const UsernameField: React.FC<UsernameFieldProps> = ({
  value,
  error,
  disabled,
  checking,
  available,
  availabilityError,
  onChange,
  onBlur,
  onSelectSuggestion,
}) => (
  <div>
    <div className="relative">
      <Input
        label="Username"
        placeholder="your_handle"
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        error={error}
        disabled={disabled}
        maxLength={32}
        required
      />
      {value && !error && (
        <div className="absolute right-3 top-9 flex items-center">
          {checking && (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-600" />
          )}
          {!checking && available === true && (
            <span className="text-green-500" data-testid="username-available">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          )}
          {!checking && available === false && (
            <span className="text-red-500" data-testid="username-taken">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          )}
        </div>
      )}
    </div>

    <p className="mt-1 text-xs text-gray-800 dark:text-gray-200">
      Your profile will be at{" "}
      {import.meta.env.VITE_APP_URL || window.location.origin}/@
      {value || "username"}
    </p>

    {value && !error && (
      <div className="mt-1">
        {checking && (
          <p className="text-xs text-gray-800 dark:text-gray-200">
            Checking availability...
          </p>
        )}
        {!checking && available === true && (
          <p className="text-xs text-green-700 dark:text-green-400">Username is available!</p>
        )}
        {!checking && available === false && (
          <p className="text-xs text-red-600 dark:text-red-400">
            Username is taken. Try:{" "}
            {[`${value}1`, `${value}_`, `${value}x`].map((s, i) => (
              <button
                key={i}
                type="button"
                className="underline ml-1"
                onClick={() => onSelectSuggestion(s)}
              >
                {s}
              </button>
            ))}
          </p>
        )}
        {availabilityError && (
          <p className="text-xs text-amber-700 dark:text-amber-300">{availabilityError}</p>
        )}
      </div>
    )}
  </div>
);
