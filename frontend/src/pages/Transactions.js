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
  const [exporting, setExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

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
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (minAmount) params.append('minAmount', minAmount);
      if (maxAmount) params.append('maxAmount', maxAmount);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (minAmount) params.append('minAmount', minAmount);
      if (maxAmount) params.append('maxAmount', maxAmount);

      const response = await api.get(`/wallet/transactions?${params}`, {
        skipErrorToast: true
      });
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

  
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('type', filter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (minAmount) params.append('minAmount', minAmount);
      if (maxAmount) params.append('maxAmount', maxAmount);

      const response = await api.get('/wallet/transactions/export?' + params.toString(), {
        responseType: 'blob'
      });

      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'transactions_' + new Date().toISOString().split('T')[0] + '.csv');
      document.body.appendChild(link);
      link.click();
      
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('Export downloaded successfully!');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export transactions');
    } finally {
      setExporting(false);
    }
  };

  const handleApplyFilters = (e) => {
    e.preventDefault();
    if (currentPage !== 1) {
      setCurrentPage(1);
    } else {
      fetchTransactions();
    }
  };

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
    setMinAmount('');
    setMaxAmount('');
    setTimeout(() => {
      if (currentPage !== 1) {
        setCurrentPage(1);
      } else {
        const fetchFilters = async () => {
          setLoading(true);
          try {
            const params = new URLSearchParams({ page: '1', limit: '20' });
            if (filter !== 'all') params.append('type', filter);
            const res = await api.get('/wallet/transactions?' + params.toString(), { skipErrorToast: true });
            setTransactions(res.data.data.transactions);
            setPagination(res.data.data.pagination);
          } catch(e) {}
          setLoading(false);
        };
        fetchFilters();
      }
    }, 0);
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
          onClick={() => navigate('/dashboard')}
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
            
            <button onClick={handleExport} disabled={exporting || transactions.length === 0} className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"><FiDownload className="h-4 w-4" /><span>{exporting ? "Exporting..." : "Export"}</span></button>
          </div>
        </div>
      </div>

      
      {/* Advanced Filters */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-gray-100 mb-4 space-y-4 md:space-y-0">
          <div className="flex items-center space-x-1 overflow-x-auto">
            <FiFilter className="h-5 w-5 text-gray-400 mr-3 hidden md:block" />
            {[
              { key: 'all', label: 'All Transactions' },
              { key: 'received', label: 'Received' },
              { key: 'sent', label: 'Sent' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleFilterChange(tab.key)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  filter === tab.key
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            {showFilters ? 'Hide Filters' : 'Advanced Filters'}
          </button>
        </div>

        {showFilters && (
          <form onSubmit={handleApplyFilters} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Min Amount (Rs)</label>
                <input type="number" placeholder="0" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Max Amount (Rs)</label>
                <input type="number" placeholder="100000" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500" />
              </div>
            </div>
            <div className="mt-4 flex justify-end space-x-3">
              <button type="button" onClick={handleClearFilters} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Clear</button>
              <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700">Apply Filters</button>
            </div>
          </form>
        )}
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
              Showing page {pagination.page} of {pagination.totalPages}
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
                  const pageNum = Math.max(1, (pagination.page || 1) - 2) + i;
                  if (pageNum > pagination.totalPages) return null;
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      disabled={loading}
                      className={`px-3 py-2 text-sm font-medium rounded-lg ${
                        pageNum === (pagination.page || currentPage)
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
