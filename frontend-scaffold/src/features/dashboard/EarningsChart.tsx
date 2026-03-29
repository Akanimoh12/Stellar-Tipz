import React, { useMemo, useState } from "react";
import { Coins } from "lucide-react";

import { stroopToXlm, stroopToXlmBigNumber, formatTimestamp } from "../../helpers/format";
import { Tip } from "../../types/contract";

type Period = "week" | "month" | "all";

interface DataPoint {
  label: string;
  value: number;
}

interface EarningsChartProps {
  tips: Tip[];
}

const SECONDS_IN_DAY = 24 * 60 * 60;

const EarningsChart: React.FC<EarningsChartProps> = ({ tips }) => {
  const [period, setPeriod] = useState<Period>("week");
  const [anchorNowSec] = useState(() => Math.floor(Date.now() / 1000));

  const chartData = useMemo(() => {
    if (tips.length === 0) return [];

    const now = anchorNowSec;
    const result: DataPoint[] = [];

    const xlmTips = tips.map(t => ({
        ...t,
        amountXlm: Number(stroopToXlmBigNumber(t.amount).toFixed(7))
    }));

    if (period === "week") {
      // Last 7 days
      for (let i = 6; i >= 0; i--) {
        const dayStart = now - (i * SECONDS_IN_DAY);
        const date = formatTimestamp(dayStart);
        const label = date.toLocaleDateString("en-US", { weekday: "short" });

        const dayTotal = xlmTips
          .filter(t => {
            const tDate = formatTimestamp(t.timestamp);
            return tDate.toDateString() === date.toDateString();
          })
          .reduce((sum, t) => sum + t.amountXlm, 0);

        result.push({ label, value: dayTotal });
      }
    } else if (period === "month") {
      // Last 30 days grouped in 6 blocks of 5 days
      for (let i = 5; i >= 0; i--) {
        const blockEnd = now - (i * 5 * SECONDS_IN_DAY);
        const blockStart = blockEnd - (5 * SECONDS_IN_DAY);
        const date = formatTimestamp(blockEnd);
        const label = `${date.getMonth() + 1}/${date.getDate()}`;
        
        const blockTotal = xlmTips
          .filter(t => t.timestamp > blockStart && t.timestamp <= blockEnd)
          .reduce((sum, t) => sum + t.amountXlm, 0);

        result.push({ label, value: blockTotal });
      }
    } else {
      // All time grouped by month (last 6 months)
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const month = d.getMonth();
        const year = d.getFullYear();
        const label = d.toLocaleDateString("en-US", { month: "short" });

        const monthTotal = xlmTips
          .filter(t => {
            const tDate = formatTimestamp(t.timestamp);
            return tDate.getMonth() === month && tDate.getFullYear() === year;
          })
          .reduce((sum, t) => sum + t.amountXlm, 0);

        result.push({ label, value: monthTotal });
      }
    }

    return result;
  }, [tips, period, anchorNowSec]);

  const maxValue = Math.max(...chartData.map(d => d.value), 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-xl font-black uppercase">Earnings over time</h3>
        <div className="flex border-2 border-black bg-white">
          {(["week", "month", "all"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 text-xs font-black uppercase transition-colors ${
                period === p ? "bg-black text-white" : "hover:bg-gray-100"
              } ${p !== "all" ? "border-r-2 border-black" : ""}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="relative border-2 border-black bg-white p-6 pb-2">
        {chartData.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center space-y-3 bg-gray-50 text-gray-400">
            <Coins size={32} />
            <div className="h-[2px] w-full bg-gray-200" />
            <p className="text-sm font-bold uppercase tracking-widest">No earnings yet</p>
          </div>
        ) : (
          <div className="flex h-48 items-end gap-2 md:gap-4">
            {chartData.map((point, index) => {
              const heightPercentage = (point.value / maxValue) * 100;
              return (
                <div key={`${point.label}-${index}`} className="group relative flex flex-1 flex-col items-center">
                  <div 
                    className="w-full border-2 border-black bg-black transition-all hover:bg-yellow-400"
                    style={{ height: `${Math.max(heightPercentage, 2)}%` }}
                  >
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded border-2 border-black bg-white px-2 py-1 text-[10px] font-black opacity-0 transition-opacity group-hover:opacity-100">
                      {point.value.toFixed(1)} XLM
                    </div>
                  </div>
                  <span className="mt-2 text-[10px] font-black uppercase text-gray-500 md:text-xs">
                    {point.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default EarningsChart;
