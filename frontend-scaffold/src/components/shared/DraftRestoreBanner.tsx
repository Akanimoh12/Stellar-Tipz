import React from "react";
import { FORM_DRAFT_TTL_MS } from "@/hooks/useFormAutosave";

interface DraftRestoreBannerProps {
  savedAt: number | null;
  onRestore: () => void;
  onDiscard: () => void;
  ttlMs?: number;
}

function formatAge(savedAt: number): string {
  const elapsed = Date.now() - savedAt;
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "moments ago";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatTtl(ttlMs: number): string {
  const hours = Math.round(ttlMs / (60 * 60 * 1_000));
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * Inline restore/discard prompt for a persisted form draft.
 * Replaces the old window.confirm flow from useFormAutosave.
 */
const DraftRestoreBanner: React.FC<DraftRestoreBannerProps> = ({
  savedAt,
  onRestore,
  onDiscard,
  ttlMs = FORM_DRAFT_TTL_MS,
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 border-2 border-black bg-yellow-50 p-3 text-sm font-bold text-black"
    >
      <p className="mb-2">
        We found a saved draft
        {savedAt ? ` from ${formatAge(savedAt)}` : ""}. Drafts expire after{" "}
        {formatTtl(ttlMs)}.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="border-2 border-black bg-white px-3 py-1 text-xs font-black uppercase tracking-wide hover:bg-black hover:text-white"
          onClick={onRestore}
        >
          Restore draft
        </button>
        <button
          type="button"
          className="border-2 border-black bg-white px-3 py-1 text-xs font-black uppercase tracking-wide hover:bg-black hover:text-white"
          onClick={onDiscard}
        >
          Discard
        </button>
      </div>
    </div>
  );
};

export default DraftRestoreBanner;
