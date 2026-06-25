import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import {
  FiUsers,
  FiCheckCircle,
  FiActivity,
  FiDollarSign,
  FiShield,
  FiUserCheck,
  FiRefreshCw,
  FiArrowRight
} from 'react-icons/fi';
import toast from 'react-hot-toast';

const StatCard = ({ label, value, icon: Icon, color, loading }) => (
  <div className="card">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-600">{label}</p>
        {loading ? (
          <div className="h-7 w-16 bg-gray-200 rounded animate-pulse mt-1" />
        ) : (
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        )}
      </div>
      <div className={`p-3 rounded-full ${color}`}>
        <Icon className="h-6 w-6" />
      </div>
    </div>
  </div>
);

const AdminTool = ({ title, description, href, icon: Icon, badge }) => (
  <Link
    to={href}
    className="card hover:border-primary-300 hover:shadow-md transition-all flex items-center justify-between group"
  >
    <div className="flex items-center gap-4">
      <div className="p-3 bg-primary-100 rounded-full">
        <Icon className="h-6 w-6 text-primary-600" />
      </div>
      <div>
        <p className="font-semibold text-gray-900 flex items-center gap-2">
          {title}
          {badge > 0 && (
            <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </p>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
    </div>
    <FiArrowRight className="h-5 w-5 text-gray-400 group-hover:text-primary-600 transition-colors" />
  </Link>
);

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/admin/dashboard');
      setStats(res.data.data.stats);
    } catch (error) {
      console.error('Failed to fetch admin stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    toast.success('Stats refreshed!');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-gray-600">Platform stats and moderation tools</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <FiRefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Users"
          value={stats?.totalUsers}
          icon={FiUsers}
          color="bg-blue-100 text-blue-600"
          loading={loading}
        />
        <StatCard
          label="Verified Users"
          value={stats?.verifiedUsers}
          icon={FiCheckCircle}
          color="bg-green-100 text-green-600"
          loading={loading}
        />
        <StatCard
          label="Total Transactions"
          value={stats?.totalTransactions}
          icon={FiActivity}
          color="bg-purple-100 text-purple-600"
          loading={loading}
        />
        <StatCard
          label="Total Wallet Balance"
          value={stats ? `Rs ${stats.totalWalletBalance.toLocaleString('en-IN')}` : undefined}
          icon={FiDollarSign}
          color="bg-yellow-100 text-yellow-600"
          loading={loading}
        />
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Moderation Queues</h2>
        <AdminTool
          title="Dispute Queue"
          description="Review pending transaction disputes"
          href="/admin/disputes"
          icon={FiShield}
          badge={stats?.pendingDisputes}
        />
        <AdminTool
          title="KYC Approval Queue"
          description="Review pending KYC tier-upgrade submissions"
          href="/admin/kyc"
          icon={FiUserCheck}
          badge={stats?.pendingKYC}
        />
        <AdminTool
          title="Wallet Management"
          description="Look up a user, view wallet status, freeze or unfreeze"
          href="/admin/wallets"
          icon={FiUsers}
        />
      </div>
    </div>
  );
};

export default AdminDashboard;
