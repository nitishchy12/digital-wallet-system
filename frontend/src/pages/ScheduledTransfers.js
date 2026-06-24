import { useState, useEffect } from 'react';
import api from '../utils/api';
import CreateScheduledModal from '../components/CreateScheduledModal';

const STATUS_CONFIG = {
  pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Scheduled' },
  processing: { color: 'bg-blue-100 text-blue-800', label: 'Processing' },
  completed: { color: 'bg-green-100 text-green-800', label: 'Completed' },
  failed: { color: 'bg-red-100 text-red-800', label: 'Failed' },
  cancelled: { color: 'bg-gray-100 text-gray-600', label: 'Cancelled' }
};

export default function ScheduledTransfers() {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchTransfers();
  }, []);

  async function fetchTransfers() {
    try {
      setLoading(true);
      const res = await api.get('/scheduled-transfers');
      setTransfers(res.data.data || []);
    } catch (err) {
      setError('Failed to load scheduled transfers.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(id) {
    setCancellingId(id);
    try {
      await api.delete(`/scheduled-transfers/${id}`);
      setTransfers(prev =>
        prev.map(t => t._id === id ? { ...t, status: 'cancelled' } : t)
      );
      showToast('Scheduled transfer cancelled.', 'success');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to cancel.';
      showToast(msg, 'error');
    } finally {
      setCancellingId(null);
    }
  }

  function showToast(message, type) {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  function formatScheduledTime(date) {
    const d = new Date(date);
    const now = new Date();
    const diffHours = (d.getTime() - now.getTime()) / 3600000;

    if (diffHours < 0) return d.toLocaleString('en-IN');
    if (diffHours < 24) return `In ${Math.round(diffHours)}h — ${d.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  const filteredTransfers = filter === 'all'
    ? transfers
    : transfers.filter(t => t.status === filter);

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Scheduled Transfers</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
        >
          + Schedule Transfer
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto">
        {['all', 'pending', 'completed', 'failed', 'cancelled'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === f
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm mb-4">{error}</div>
      )}

      {filteredTransfers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="text-5xl mb-4">⏰</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            {filter === 'all' ? 'No scheduled transfers yet' : `No ${filter} transfers`}
          </h3>
          <p className="text-gray-500 text-sm mb-4">
            Set up a transfer to run automatically at a future date — rent, subscriptions, recurring payments.
          </p>
          {filter === 'all' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700"
            >
              Schedule Your First Transfer
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTransfers.map(transfer => (
            <div
              key={transfer._id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-800">
                    ₹{transfer.amount?.toLocaleString('en-IN')}
                  </span>
                  <span className="text-gray-400">→</span>
                  <span className="text-gray-600 text-sm">{transfer.receiverEmail}</span>
                  {transfer.recurring && (
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                      🔁 Every {transfer.recurringIntervalDays}d
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {transfer.description || 'No description'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {formatScheduledTime(transfer.scheduledAt)}
                </p>
                {transfer.status === 'failed' && transfer.failureReason && (
                  <p className="text-xs text-red-500 mt-1">⚠ {transfer.failureReason}</p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium px-3 py-1 rounded-full ${STATUS_CONFIG[transfer.status]?.color}`}>
                  {STATUS_CONFIG[transfer.status]?.label}
                </span>
                {transfer.status === 'pending' && (
                  <button
                    onClick={() => handleCancel(transfer._id)}
                    disabled={cancellingId === transfer._id}
                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    {cancellingId === transfer._id ? 'Cancelling...' : 'Cancel'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateScheduledModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            showToast('Transfer scheduled successfully.', 'success');
            fetchTransfers();
          }}
        />
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-lg z-50 text-sm text-white ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.type === 'success' ? '✓ ' : '✕ '}{toast.message}
        </div>
      )}
    </div>
  );
}
