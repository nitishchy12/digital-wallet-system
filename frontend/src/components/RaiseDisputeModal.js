import { useState } from 'react';
import api from '../utils/api';

export default function RaiseDisputeModal({ transaction, onClose, onSuccess }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const MIN_REASON_LENGTH = 20;
  const canSubmit = reason.trim().length >= MIN_REASON_LENGTH && !loading;

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    try {
      await api.post('/disputes', {
        transactionId: transaction._id,
        reason: reason.trim()
      });
      onSuccess();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to raise dispute.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-1">Raise a Dispute</h2>
        <p className="text-sm text-gray-500 mb-4">
          Transfer of ₹{transaction.amount?.toLocaleString('en-IN')} will be held in escrow
          until the dispute is resolved.
        </p>

        <div className="bg-gray-50 rounded-lg p-3 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Amount</span>
            <span className="font-semibold text-gray-800">
              ₹{transaction.amount?.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-500">Transaction ID</span>
            <span className="font-mono text-xs text-gray-600">
              #{transaction._id?.toString().slice(-8)}
            </span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-500">Date</span>
            <span className="text-gray-600">
              {new Date(transaction.createdAt).toLocaleDateString('en-IN')}
            </span>
          </div>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Reason for dispute
        </label>
        <textarea
          className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
          rows={4}
          placeholder="Explain why you are disputing this transfer (minimum 20 characters)..."
          value={reason}
          onChange={e => setReason(e.target.value)}
          maxLength={500}
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1 mb-4">
          <span>
            {reason.length < MIN_REASON_LENGTH
              ? `${MIN_REASON_LENGTH - reason.length} more characters needed`
              : '✓ Ready to submit'}
          </span>
          <span>{reason.length}/500</span>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Raising dispute...' : 'Raise Dispute'}
          </button>
        </div>
      </div>
    </div>
  );
}
