import React, { useState, useEffect } from 'react';
import { AlertCircle, BarChart3, Settings, Users, Lock } from 'lucide-react';
import StatsPanel from './StatsPanel';
import AdminSkeleton from './AdminSkeleton';
import PageContainer from '@/components/layout/PageContainer';

interface AdminDashboardProps {
  isAdmin?: boolean;
  adminWallet?: string;
  currentWallet?: string;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  isAdmin = false,
  adminWallet,
  currentWallet,
}) => {
  const [activeTab, setActiveTab] = useState<'stats' | 'verification' | 'users' | 'settings'>('stats');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <PageContainer maxWidth="lg" ariaLabel="Admin access content" className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <Lock className="w-12 h-12 text-red-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Unauthorized</h1>
            <p className="text-gray-600">
              You do not have permission to access the admin dashboard.
            </p>
            <p className="text-sm text-gray-800 dark:text-gray-200 mt-4">
              Admin Wallet: {adminWallet}
              <br />
              Your Wallet: {currentWallet}
            </p>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="xl" ariaLabel="Admin dashboard content" className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">Manage contract settings and monitor platform activity</p>
        </div>

        {error && (
          <div role="alert" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Tab Navigation */}
        <nav aria-label="Admin sections" className="bg-white rounded-lg shadow mb-6">
          <div role="tablist" aria-label="Admin section tabs" className="flex border-b">
            <button
              role="tab"
              aria-selected={activeTab === 'stats'}
              onClick={() => setActiveTab('stats')}
              className={`flex-1 px-4 py-3 font-medium text-sm flex items-center justify-center gap-2 transition ${
                activeTab === 'stats'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Stats
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'verification'}
              onClick={() => setActiveTab('verification')}
              className={`flex-1 px-4 py-3 font-medium text-sm flex items-center justify-center gap-2 transition ${
                activeTab === 'verification'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Lock className="w-4 h-4" />
              Verification
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'users'}
              onClick={() => setActiveTab('users')}
              className={`flex-1 px-4 py-3 font-medium text-sm flex items-center justify-center gap-2 transition ${
                activeTab === 'users'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Users className="w-4 h-4" />
              Users
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'settings'}
              onClick={() => setActiveTab('settings')}
              className={`flex-1 px-4 py-3 font-medium text-sm flex items-center justify-center gap-2 transition ${
                activeTab === 'settings'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>
        </nav>

        {/* Tab Content */}
        <section role="region" aria-label="Admin section content" className="bg-white rounded-lg shadow p-6">
          {isLoading ? (
            <AdminSkeleton />
          ) : activeTab === 'stats' ? (
            <StatsPanel />
          ) : activeTab === 'verification' ? (
            <VerificationPanel />
          ) : activeTab === 'users' ? (
            <UsersPanel />
          ) : (
            <SettingsPanel />
          )}
        </section>
      </div>
    </PageContainer>
  );
};

const VerificationPanel: React.FC = () => (
  <div className="space-y-4">
    <h2 className="text-xl font-semibold mb-4">Verification Requests</h2>
    <div className="text-center py-8 text-gray-800 dark:text-gray-200">
      <p>Verification request management coming soon</p>
    </div>
  </div>
);

const UsersPanel: React.FC = () => (
  <div className="space-y-4">
    <h2 className="text-xl font-semibold mb-4">User Management</h2>
    <div className="text-center py-8 text-gray-800 dark:text-gray-200">
      <p>User management tools coming soon</p>
    </div>
  </div>
);

const SettingsPanel: React.FC = () => (
  <div className="space-y-4">
    <h2 className="text-xl font-semibold mb-4">Contract Settings</h2>
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Withdrawal Fee (bps)</label>
        <input
          type="number"
          placeholder="200"
          className="w-full px-3 py-2 border rounded-lg"
          disabled
        />
        <p className="text-xs text-gray-800 dark:text-gray-200 mt-1">Fee management coming soon</p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Minimum Tip Amount</label>
        <input
          type="number"
          placeholder="1000000"
          className="w-full px-3 py-2 border rounded-lg"
          disabled
        />
        <p className="text-xs text-gray-800 dark:text-gray-200 mt-1">Minimum tip configuration coming soon</p>
      </div>
    </div>
  </div>
);

export default AdminDashboard;
