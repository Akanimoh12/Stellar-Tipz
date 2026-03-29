import React from "react";
import { ArrowRight, Inbox } from "lucide-react";
import BigNumber from "bignumber.js";

import { stroopToXlm, truncateString } from "../../helpers/format";
import type { Tip } from "../../types";

interface ActivityMiniProps {
  tips: Tip[];
  onViewAll?: () => void;
}

const MAX_TIPS = 5;

function formatRelativeTime(timestamp: number): string {
  const normalizedTs =
    timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  const diffSeconds = Math.max(
    0,
    Math.floor((Date.now() - normalizedTs) / 1000),
  );

  if (diffSeconds < 60) return "just now";
  if (diffSeconds < 3600) {
    const minutes = Math.floor(diffSeconds / 60);
    return `${minutes}m ago`;
  }
  if (diffSeconds < 86400) {
    const hours = Math.floor(diffSeconds / 3600);
    return `${hours}h ago`;
  }
  const days = Math.floor(diffSeconds / 86400);
  return `${days}d ago`;
}

function formatXlmAmount(stroops: string): string {
  return stroopToXlm(new BigNumber(stroops)).toFormat(2);
}

const ActivityMini: React.FC<ActivityMiniProps> = ({ tips, onViewAll }) => {
  const recentTips = tips.slice(0, MAX_TIPS);

  return (
    <section className="border-2 border-black bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-black uppercase">Recent Activity</h2>
        {tips.length > 0 && onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="flex items-center gap-1 text-xs font-black uppercase tracking-wide hover:underline"
          >
            View All Tips
            <ArrowRight size={14} />
          </button>
        )}
      </div>

      {recentTips.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <Inbox size={28} className="text-gray-400" />
          <p className="text-sm font-bold text-gray-500">
            No tips yet — your recent activity will appear here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-dashed divide-gray-300">
          {recentTips.map((tip, index) => (
            <li
              key={`${tip.from}-${tip.timestamp}-${index}`}
              className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <span className="w-16 flex-shrink-0 text-xs font-bold text-gray-500">
                {formatRelativeTime(tip.timestamp)}
              </span>

              <span className="flex-shrink-0 border border-black bg-yellow-100 px-2 py-0.5 text-xs font-black tabular-nums">
                {formatXlmAmount(tip.amount)} XLM
              </span>

              <span className="flex-shrink-0 text-xs font-bold">
                {truncateString(tip.from)}
              </span>

              <span
                className="min-w-0 flex-1 truncate text-xs text-gray-600"
                title={tip.message || "No message"}
              >
                {tip.message || "—"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {tips.length > MAX_TIPS && onViewAll && (
        <p className="mt-3 border-t border-dashed border-gray-300 pt-3 text-xs font-bold text-gray-500">
          + {tips.length - MAX_TIPS} more tip{tips.length - MAX_TIPS !== 1 ? "s" : ""}
        </p>
      )}
    </section>
  );
};

export default ActivityMini;
