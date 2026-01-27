import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { 
  FiArrowLeft, 
  FiFilter, 
  FiDownload, 
  FiTrendingUp, 
  FiPlus,
  FiSend,
  FiRefreshCw
} from 'react-icons/fi';
import toast from 'react-hot-toast';

const Transactions = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'sent', 'received'
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const navigate = useNavigate();

  const fetchTransactions = async () => {
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20'
      });

      if (filter !== 'all') {
        params.append('type', filter);
      }

      const response = await api.get(`/wallet/transactions?${params}`);
      setTransactions(response.data.data.transactions);
      setPagination(response.data.data.pagination);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, currentPage]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTransactions();
    toast.success('Transactions refreshed!');
  };

  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    setCurrentPage(1);
    setLoading(true);
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    setLoading(true);
  };

  const getTransactionIcon = (transaction) => {
    if (transaction.type === 'ADD_MONEY') {
      return <FiPlus className="h-4 w-4" />;
    }
    return transaction.direction === 'RECEIVED' 
      ? <FiTrendingUp className="h-4 w-4" />
      : <FiSend className="h-4 w-4" />;
  };

  const getTransactionColor = (transaction) => {
    if (transaction.type === 'ADD_MONEY') {
      return 'bg-blue-100 text-blue-600';
    }
    return transaction.direction === 'RECEIVED'
      ? 'bg-green-100 text-green-600'
      : 'bg-red-100 text-red-600';
  };

  const getAmountColor = (transaction) => {
    if (transaction.type === 'ADD_MONEY' || transaction.direction === 'RECEIVED') {
      return 'text-green-600';
    }
    return 'text-red-600';
  };

  const getAmountPrefix = (transaction) => {
    if (transaction.type === 'ADD_MONEY' || transaction.direction === 'RECEIVED') {
      return '+';
    }
    return '-';
  };

  const getTransactionTitle = (transaction) => {
    if (transaction.type === 'ADD_MONEY') {
      return 'Money Added';
    }
    return transaction.direction === 'RECEIVED'
      ? `From ${transaction.counterparty?.name}`
      : `To ${transaction.counterparty?.name}`;
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      SUCCESS: 'bg-green-100 text-green-800',
      PENDING: 'bg-yellow-100 text-yellow-800',
      FAILED: 'bg-red-100 text-red-800',
      CANCELLED: 'bg-gray-100 text-gray-800'
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusConfig[status] || statusConfig.PENDING}`}>
        {status}
      </span>
    );
  };

  if (loading && transactions.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-12 bg-gray-200 rounded"></div>
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <FiArrowLeft className="h-5 w-5 mr-2" />
          Back to Dashboard
        </button>
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Transaction History</h1>
            <p className="text-gray-600">View all your wallet transactions</p>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <FiRefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            
            <button className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              <FiDownload className="h-4 w-4" />
              <span>Export</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="card mb-6">
        <div className="flex items-center space-x-1">
          <FiFilter className="h-5 w-5 text-gray-400 mr-3" />
          {[
            { key: 'all', label: 'All Transactions' },
            { key: 'received', label: 'Received' },
            { key: 'sent', label: 'Sent' }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleFilterChange(tab.key)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === tab.key
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions List */}
      <div className="card">
        {transactions.length === 0 ? (
          <div className="text-center py-12">
            <FiSend className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No transactions found</p>
            <p className="text-gray-400">Your transaction history will appear here</p>
          </div>
        ) : (
          <div className="space-y-1">
            {transactions.map((transaction) => (
              <div
                key={transaction._id}
                className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className={`p-2 rounded-full ${getTransactionColor(transaction)}`}>
                    {getTransactionIcon(transaction)}
                  </div>
                  
                  <div>
                    <p className="font-medium text-gray-900">
                      {getTransactionTitle(transaction)}
                    </p>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <span>
                        {new Date(transaction.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      <span>•</span>
                      <span>ID: {transaction.transactionId}</span>
                    </div>
                    {transaction.description && (
                      <p className="text-sm text-gray-500 mt-1">
                        {transaction.description}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="text-right">
                  <p className={`font-semibold text-lg ${getAmountColor(transaction)}`}>
                    {getAmountPrefix(transaction)}{transaction.formattedAmount}
                  </p>
                  {getStatusBadge(transaction.status)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 pt-6 mt-6">
            <div className="text-sm text-gray-700">
              Showing page {pagination.currentPage} of {pagination.totalPages}
              {' '}({pagination.totalTransactions} total transactions)
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={!pagination.hasPrevPage || loading}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              
              <div className="flex items-center space-x-1">
                {[...Array(Math.min(5, pagination.totalPages))].map((_, i) => {
                  const pageNum = Math.max(1, pagination.currentPage - 2) + i;
                  if (pageNum > pagination.totalPages) return null;
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      disabled={loading}
                      className={`px-3 py-2 text-sm font-medium rounded-lg ${
                        pageNum === pagination.currentPage
                          ? 'bg-primary-600 text-white'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={!pagination.hasNextPage || loading}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Transactions;