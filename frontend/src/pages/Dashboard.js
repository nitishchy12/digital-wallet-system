import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import {
  FiPlus,
  FiSend,
  FiEye,
  FiEyeOff,
  FiTrendingUp,
  FiTrendingDown,
  FiActivity,
  FiRefreshCw,
  FiBarChart2,
  FiUsers
} from 'react-icons/fi';
import toast from 'react-hot-toast';

const Dashboard = () => {
  const { user } = useAuth();
  const [walletData, setWalletData] = useState({
    balance: 0,
    formattedBalance: 'Rs 0'
  });
  const [stats, setStats] = useState({
    totalTransactions: 0,
    totalSent: 0,
    totalReceived: 0,
    recentTransactions: 0
  });
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [analytics, setAnalytics] = useState({
    monthly: [],
    sentVsReceived: { sent: 0, received: 0 },
    topReceivers: []
  });
  const [showBalance, setShowBalance] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const [balanceRes, statsRes, transactionsRes, analyticsRes] = await Promise.all([
        api.get('/wallet/balance'),
        api.get('/wallet/stats'),
        api.get('/wallet/transactions?limit=5'),
        api.get('/wallet/analytics')
      ]);

      setWalletData(balanceRes.data.data);
      setStats(statsRes.data.data);
      setRecentTransactions(transactionsRes.data.data.transactions);
      setAnalytics(analyticsRes.data.data);
    } catch (error) {
      console.error('Dashboard data fetch error:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    toast.success('Dashboard refreshed!');
  };

  useEffect(() => {
    fetchDashboardData();

    const handleWalletUpdate = (event) => {
      const { newBalance } = event.detail;
      setWalletData((prev) => ({
        ...prev,
        balance: newBalance,
        formattedBalance: `Rs ${newBalance.toLocaleString('en-IN')}`
      }));

      fetchDashboardData();
    };

    window.addEventListener('walletUpdate', handleWalletUpdate);

    return () => {
      window.removeEventListener('walletUpdate', handleWalletUpdate);
    };
  }, []);

  const quickActions = [
    {
      name: 'Add Money',
      href: '/add-money',
      icon: FiPlus
    },
    {
      name: 'Send Money',
      href: '/send',
      icon: FiSend
    },
    {
      name: 'Transactions',
      href: '/transactions',
      icon: FiActivity
    }
  ];

  const maxMonthlyValue = Math.max(
    1,
    ...analytics.monthly.map((m) => Math.max(m.sent || 0, m.received || 0))
  );

  const sentValue = analytics.sentVsReceived.sent || 0;
  const receivedValue = analytics.sentVsReceived.received || 0;
  const totalFlow = sentValue + receivedValue;
  const sentRatio = totalFlow ? (sentValue / totalFlow) * 100 : 0;

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <div className="h-48 bg-gray-200 rounded-xl"></div>
          </div>
          <div className="h-48 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.name}!</h1>
          <p className="text-gray-600">Here is your wallet overview</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="card gradient-bg text-white">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Wallet Balance</h2>
              <button
                onClick={() => setShowBalance(!showBalance)}
                className="text-white hover:text-gray-200 transition-colors"
              >
                {showBalance ? <FiEyeOff className="h-5 w-5" /> : <FiEye className="h-5 w-5" />}
              </button>
            </div>
            <div className="mb-6">
              <p className="text-3xl font-bold">
                {showBalance ? walletData.formattedBalance : 'Rs ******'}
              </p>
              <p className="text-blue-100 text-sm">Available Balance</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {quickActions.map((action) => (
                <Link
                  key={action.name}
                  to={action.href}
                  className="flex flex-col items-center p-3 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-all duration-200"
                >
                  <action.icon className="h-6 w-6 mb-2" />
                  <span className="text-sm font-medium text-center">{action.name}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Transactions</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalTransactions}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <FiActivity className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Money Sent</p>
                <p className="text-2xl font-bold text-red-600">Rs {stats.totalSent.toLocaleString('en-IN')}</p>
              </div>
              <div className="p-3 bg-red-100 rounded-full">
                <FiTrendingDown className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Money Received</p>
                <p className="text-2xl font-bold text-green-600">Rs {stats.totalReceived.toLocaleString('en-IN')}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <FiTrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Monthly Spend vs Receive</h2>
            <FiBarChart2 className="h-5 w-5 text-gray-500" />
          </div>

          {analytics.monthly.length === 0 ? (
            <p className="text-sm text-gray-500">No monthly analytics available yet.</p>
          ) : (
            <div className="space-y-3">
              {analytics.monthly.map((item) => (
                <div key={`${item.month}-${item.year}`}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{item.month} {item.year}</span>
                    <span className="text-gray-500">
                      Sent Rs {item.sent.toLocaleString('en-IN')} | Received Rs {item.received.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="h-2 bg-gray-100 rounded overflow-hidden">
                      <div
                        className="h-2 bg-red-400"
                        style={{ width: `${Math.max((item.sent / maxMonthlyValue) * 100, 2)}%` }}
                      />
                    </div>
                    <div className="h-2 bg-gray-100 rounded overflow-hidden">
                      <div
                        className="h-2 bg-green-400"
                        style={{ width: `${Math.max((item.received / maxMonthlyValue) * 100, 2)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Sent vs Received Ratio</h3>
            <div className="h-3 bg-gray-100 rounded overflow-hidden flex">
              <div className="bg-red-400" style={{ width: `${sentRatio}%` }} />
              <div className="bg-green-400" style={{ width: `${100 - sentRatio}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>Sent: Rs {sentValue.toLocaleString('en-IN')}</span>
              <span>Received: Rs {receivedValue.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Top Receivers</h2>
            <FiUsers className="h-5 w-5 text-gray-500" />
          </div>

          {analytics.topReceivers.length === 0 ? (
            <p className="text-sm text-gray-500">No transfer analytics yet.</p>
          ) : (
            <div className="space-y-3">
              {analytics.topReceivers.map((receiver, idx) => (
                <div key={receiver.receiverId} className="p-3 rounded-lg bg-gray-50">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900">{idx + 1}. {receiver.name}</p>
                      <p className="text-xs text-gray-500">{receiver.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-red-600">Rs {receiver.totalAmount.toLocaleString('en-IN')}</p>
                      <p className="text-xs text-gray-500">{receiver.txCount} tx</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
          <Link to="/transactions" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
            View all
          </Link>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="text-center py-8">
            <FiActivity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No transactions yet</p>
            <p className="text-sm text-gray-400">Start by adding money to your wallet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentTransactions.map((transaction) => (
              <div key={transaction._id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-4">
                  <div
                    className={`p-2 rounded-full ${
                      transaction.direction === 'RECEIVED'
                        ? 'bg-green-100 text-green-600'
                        : transaction.type === 'ADD_MONEY'
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {transaction.direction === 'RECEIVED' ? (
                      <FiTrendingUp className="h-4 w-4" />
                    ) : transaction.type === 'ADD_MONEY' ? (
                      <FiPlus className="h-4 w-4" />
                    ) : (
                      <FiSend className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {transaction.type === 'ADD_MONEY'
                        ? 'Money Added'
                        : transaction.direction === 'RECEIVED'
                        ? `From ${transaction.counterparty?.name}`
                        : `To ${transaction.counterparty?.name}`}
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(transaction.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`font-semibold ${
                      transaction.direction === 'RECEIVED' || transaction.type === 'ADD_MONEY'
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {transaction.direction === 'RECEIVED' || transaction.type === 'ADD_MONEY' ? '+' : '-'}
                    {transaction.formattedAmount}
                  </p>
                  <p
                    className={`text-xs px-2 py-1 rounded-full ${
                      transaction.status === 'SUCCESS'
                        ? 'bg-green-100 text-green-800'
                        : transaction.status === 'PENDING'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {transaction.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
