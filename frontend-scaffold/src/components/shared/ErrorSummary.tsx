import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ErrorSummaryItem {
  /** Must match the `id` of the corresponding form field. */
  fieldId: string;
  /** Human-readable label shown in the summary list (e.g. "Display Name"). */
  label: string;
  /** Actionable error message (e.g. "Enter a display name between 1 and 64 characters."). */
  message: string;
}

interface ErrorSummaryProps {
  /** Ordered list of validation errors. Renders nothing when empty. */
  errors: ErrorSummaryItem[];
  /** Optional heading override. Defaults to "There are N problems with your submission." */
  heading?: string;
}

/**
 * ErrorSummary — WCAG 2.1 SC 3.3.1 / 3.3.3 compliant error list.
 *
 * - Rendered only when there are errors.
 * - Receives focus on mount so screen readers announce it immediately.
 * - Each entry is an anchor link that moves focus to the offending field.
 * - Uses role="alert" + aria-live="assertive" so dynamic injection is announced.
 */
const ErrorSummary: React.FC<ErrorSummaryProps> = ({ errors, heading }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Move focus to the summary box as soon as it appears so AT users hear the
  // error count without having to navigate back up the form.
  useEffect(() => {
    if (errors.length > 0) {
      containerRef.current?.focus();
    }
  }, [errors.length]);

  if (errors.length === 0) return null;

  const defaultHeading =
    errors.length === 1
      ? 'There is 1 problem with your submission'
      : `There are ${errors.length} problems with your submission`;

  return (
    <div
      ref={containerRef}
      role="alert"
      aria-live="assertive"
      aria-labelledby="error-summary-heading"
      tabIndex={-1}
      data-testid="error-summary"
      className="border-2 border-red-600 bg-red-50 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
    >
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle
          size={18}
          className="text-red-600 shrink-0"
          aria-hidden="true"
        />
        <h2
          id="error-summary-heading"
          className="text-sm font-black uppercase text-red-700"
        >
          {heading ?? defaultHeading}
        </h2>
      </div>
      <ul className="space-y-1 list-none">
        {errors.map(({ fieldId, label, message }) => (
          <li key={fieldId}>
            <a
              href={`#${fieldId}`}
              className="text-sm font-medium text-red-700 underline hover:text-red-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(fieldId);
                if (el) {
                  el.focus();
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
            >
              <span className="font-bold">{label}:</span> {message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ErrorSummary;
