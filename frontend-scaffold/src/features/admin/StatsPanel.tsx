import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, Zap, DollarSign } from 'lucide-react';

interface ContractStats {
  totalCreators: number;
  totalTipsCount: number;
  totalTipsVolume: number;
  totalFeesCollected: number;
  feeBps: number;
}

export const StatsPanel: React.FC = () => {
  const [stats, setStats] = useState<ContractStats>({
    totalCreators: 0,
    totalTipsCount: 0,
    totalTipsVolume: 0,
    totalFeesCollected: 0,
    feeBps: 200,
  });

  useEffect(() => {
    // In a real implementation, fetch stats from contract
    // For now, using mock data
    setStats({
      totalCreators: 1250,
      totalTipsCount: 8934,
      totalTipsVolume: 45670000000, // stroops
      totalFeesCollected: 913400000, // stroops
      feeBps: 200,
    });
  }, []);

  const formatStroops = (stroops: number) => {
    const xlm = stroops / 10000000;
    return xlm.toFixed(2);
  };

  const statCards = [
    {
      label: 'Total Creators',
      value: stats.totalCreators.toLocaleString(),
      icon: Users,
      color: 'blue',
    },
    {
      label: 'Total Tips Sent',
      value: stats.totalTipsCount.toLocaleString(),
      icon: TrendingUp,
      color: 'green',
    },
    {
      label: 'Total Tips Volume',
      value: `${formatStroops(stats.totalTipsVolume)} XLM`,
      icon: Zap,
      color: 'purple',
    },
    {
      label: 'Fees Collected',
      value: `${formatStroops(stats.totalFeesCollected)} XLM`,
      icon: DollarSign,
      color: 'orange',
    },
  ];

  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Contract Statistics</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          const colorClass = colorClasses[card.color as keyof typeof colorClasses];

          return (
            <div key={card.label} className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-600">{card.label}</p>
                <div className={`p-2 rounded-lg ${colorClass}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold">{card.value}</p>
            </div>
          );
        })}
      </div>

      {/* Fee Configuration */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold mb-3">Fee Configuration</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Current Fee Rate</p>
            <p className="text-2xl font-bold">{(stats.feeBps / 100).toFixed(2)}%</p>
            <p className="text-xs text-gray-500 mt-1">{stats.feeBps} basis points</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Average Fee per Tip</p>
            <p className="text-2xl font-bold">
              {formatStroops(stats.totalTipsVolume * (stats.feeBps / 10000))} XLM
            </p>
          </div>
        </div>
      </div>

      {/* Activity Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold mb-3">Activity Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Average Tip Size</span>
            <span className="font-medium">
              {formatStroops(stats.totalTipsVolume / Math.max(stats.totalTipsCount, 1))} XLM
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Tips per Creator</span>
            <span className="font-medium">
              {(stats.totalTipsCount / Math.max(stats.totalCreators, 1)).toFixed(1)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Fee Collection Rate</span>
            <span className="font-medium">
              {((stats.totalFeesCollected / stats.totalTipsVolume) * 100).toFixed(2)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsPanel;
