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
  FiRefreshCw
} from 'react-icons/fi';
import toast from 'react-hot-toast';

const Dashboard = () => {
  const { user } = useAuth();
  const [walletData, setWalletData] = useState({
    balance: 0,
    formattedBalance: '₹0'
  });
  const [stats, setStats] = useState({
    totalTransactions: 0,
    totalSent: 0,
    totalReceived: 0,
    recentTransactions: 0
  });
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [showBalance, setShowBalance] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const [balanceRes, statsRes, transactionsRes] = await Promise.all([
        api.get('/wallet/balance'),
        api.get('/wallet/stats'),
        api.get('/wallet/transactions?limit=5')
      ]);

      setWalletData(balanceRes.data.data);
      setStats(statsRes.data.data);
      setRecentTransactions(transactionsRes.data.data.transactions);
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

    // Listen for wallet updates from socket
    const handleWalletUpdate = (event) => {
      const { newBalance } = event.detail;
      setWalletData(prev => ({
        ...prev,
        balance: newBalance,
        formattedBalance: `₹${newBalance.toLocaleString('en-IN')}`
      }));
      
      // Refresh stats and transactions
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
      icon: FiPlus,
      color: 'bg-green-500 hover:bg-green-600',
      description: 'Add money to wallet'
    },
    {
      name: 'Send Money',
      href: '/send-money',
      icon: FiSend,
      color: 'bg-blue-500 hover:bg-blue-600',
      description: 'Transfer to others'
    },
    {
      name: 'Transactions',
      href: '/transactions',
      icon: FiActivity,
      color: 'bg-purple-500 hover:bg-purple-600',
      description: 'View transaction history'
    }
  ];

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <div className="h-48 bg-gray-200 rounded-xl"></div>
          </div>
          <div className="h-48 bg-gray-200 rounded-xl"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user?.name}! 👋
          </h1>
          <p className="text-gray-600">Here's your wallet overview</p>
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

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Wallet Balance Card */}
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
                {showBalance ? walletData.formattedBalance : '₹••••••'}
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

        {/* Quick Stats */}
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
                <p className="text-2xl font-bold text-red-600">
                  ₹{stats.totalSent.toLocaleString('en-IN')}
                </p>
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
                <p className="text-2xl font-bold text-green-600">
                  ₹{stats.totalReceived.toLocaleString('en-IN')}
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <FiTrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
          <Link
            to="/transactions"
            className="text-primary-600 hover:text-primary-700 text-sm font-medium"
          >
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
              <div
                key={transaction._id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center space-x-4">
                  <div className={`p-2 rounded-full ${
                    transaction.direction === 'RECEIVED' 
                      ? 'bg-green-100 text-green-600' 
                      : transaction.type === 'ADD_MONEY'
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-red-100 text-red-600'
                  }`}>
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
                        : `To ${transaction.counterparty?.name}`
                      }
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
                  <p className={`font-semibold ${
                    transaction.direction === 'RECEIVED' || transaction.type === 'ADD_MONEY'
                      ? 'text-green-600' 
                      : 'text-red-600'
                  }`}>
                    {transaction.direction === 'RECEIVED' || transaction.type === 'ADD_MONEY' ? '+' : '-'}
                    {transaction.formattedAmount}
                  </p>
                  <p className={`text-xs px-2 py-1 rounded-full ${
                    transaction.status === 'SUCCESS' 
                      ? 'bg-green-100 text-green-800'
                      : transaction.status === 'PENDING'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
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