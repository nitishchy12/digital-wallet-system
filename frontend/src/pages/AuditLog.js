import { useState, useEffect } from 'react';
import api from '../utils/api';

const ACTION_CONFIG = {
  USER_REGISTERED: { icon: '👤', label: 'Account created', color: 'text-blue-600' },
  USER_LOGIN: { icon: '🔓', label: 'Logged in', color: 'text-green-600' },
  USER_LOGIN_FAILED: { icon: '⚠️', label: 'Failed login attempt', color: 'text-red-600' },
  USER_LOGOUT: { icon: '🔒', label: 'Logged out', color: 'text-gray-600' },
  PASSWORD_RESET_REQUESTED: { icon: '🔑', label: 'Password reset requested', color: 'text-yellow-600' },
  PASSWORD_RESET_COMPLETED: { icon: '🔑', label: 'Password changed', color: 'text-orange-600' },
  OTP_VERIFIED: { icon: '✓', label: 'OTP verified', color: 'text-green-600' },
  OTP_FAILED: { icon: '✗', label: 'OTP verification failed', color: 'text-red-600' },
  TRANSFER_COMPLETED: { icon: '💸', label: 'Money transferred', color: 'text-purple-600' },
  TRANSFER_FAILED: { icon: '⚠️', label: 'Transfer failed', color: 'text-red-600' },
  WALLET_FROZEN: { icon: '🧊', label: 'Wallet frozen', color: 'text-red-700' },
  WALLET_UNFROZEN: { icon: '🔥', label: 'Wallet unfrozen', color: 'text-green-700' },
  DISPUTE_RAISED: { icon: '🛡️', label: 'Dispute raised', color: 'text-orange-600' },
  DISPUTE_RESOLVED: { icon: '✓', label: 'Dispute resolved', color: 'text-green-600' },
  KYC_SUBMITTED: { icon: '📋', label: 'KYC document submitted', color: 'text-blue-600' }
};

const DEFAULT_CONFIG = { icon: '•', label: 'Activity', color: 'text-gray-600' };

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    fetchLogs(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function fetchLogs(pageNum) {
    try {
      setLoading(true);
      const res = await api.get(`/audit/my-activity?page=${pageNum}`);
      setLogs(res.data.data?.logs || []);
      setPagination(res.data.data?.pagination || null);
    } catch (err) {
      setError('Failed to load activity log.');
    } finally {
      setLoading(false);
    }
  }

  function formatTimeAgo(date) {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return past.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function maskIP(ip) {
    if (!ip || ip === 'unknown') return 'Unknown location';
    if (ip.startsWith('::1') || ip.startsWith('127.0.0.1')) return 'This device (local)';
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.xxx.xxx`;
    return ip;
  }

  function groupByDate(logs) {
    const groups = {};
    logs.forEach(log => {
      const dateKey = new Date(log.createdAt).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(log);
    });
    return groups;
  }

  if (loading && logs.length === 0) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
    </div>
  );

  if (error) return (
    <div className="p-6 text-center text-red-600">{error}</div>
  );

  const groupedLogs = groupByDate(logs);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Account Activity</h1>
      <p className="text-sm text-gray-500 mb-6">
        A complete history of activity on your account. If you see something you don't recognize,
        change your password immediately.
      </p>

      {logs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="text-5xl mb-4">📋</div>
          <h3 className="text-lg font-semibold text-gray-700">No activity recorded yet</h3>
        </div>
      ) : (
        <>
          {Object.entries(groupedLogs).map(([dateKey, dateLogs]) => (
            <div key={dateKey} className="mb-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
                {dateKey}
              </p>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {dateLogs.map(log => {
                  const config = ACTION_CONFIG[log.action] || DEFAULT_CONFIG;
                  return (
                    <div key={log._id} className="flex items-start gap-3 p-4">
                      <span className="text-xl flex-shrink-0">{config.icon}</span>
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${config.color}`}>
                          {config.label}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-gray-400">
                            {maskIP(log.ip)}
                          </p>
                          {log.metadata?.amount && (
                            <>
                              <span className="text-gray-300">•</span>
                              <p className="text-xs text-gray-500 font-medium">
                                ₹{log.metadata.amount.toLocaleString('en-IN')}
                              </p>
                            </>
                          )}
                          {log.severity === 'critical' && (
                            <>
                              <span className="text-gray-300">•</span>
                              <span className="text-xs text-red-500 font-medium">Important</span>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                        {formatTimeAgo(log.createdAt)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {pagination && pagination.pages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-6">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {pagination.page} of {pagination.pages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page === pagination.pages}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
