import React from "react";

interface TransactionRestoredNoticeProps {
  restored: boolean;
  onDismiss: () => void;
}

/**
 * Shown when a pending transaction was restored after a page refresh.
 * Explains the interrupted state and lets the user dismiss it (resetting the
 * guard) or leave it pending until it times out.
 */
const TransactionRestoredNotice: React.FC<TransactionRestoredNoticeProps> = ({
  restored,
  onDismiss,
}) => {
  if (!restored) return null;

  return (
    <div
      role="alert"
      className="mb-4 border-2 border-black bg-yellow-50 p-3 text-sm font-bold text-black"
    >
      <p className="mb-2">
        A transaction was still in progress when you left this page. It may have
        been interrupted.
      </p>
      <button
        type="button"
        className="border-2 border-black bg-white px-3 py-1 text-xs font-black uppercase tracking-wide hover:bg-black hover:text-white"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  );
};

export default TransactionRestoredNotice;
