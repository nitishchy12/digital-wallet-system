import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { FiArrowLeft, FiSearch, FiLock, FiUnlock } from 'react-icons/fi';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  active: 'bg-green-100 text-green-800',
  frozen: 'bg-red-100 text-red-800',
  suspended: 'bg-gray-100 text-gray-800'
};

const WalletManagement = () => {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;

    setSearching(true);
    setResult(null);
    try {
      const res = await api.get(`/admin/users/lookup?email=${encodeURIComponent(email.trim())}`, {
        skipErrorToast: true
      });
      setResult(res.data.data);
      setReason('');
    } catch (error) {
      const message = error.response?.data?.message || 'User not found';
      toast.error(message);
    } finally {
      setSearching(false);
    }
  };

  const handleFreeze = async () => {
    if (reason.trim().length < 10) {
      toast.error('A reason of at least 10 characters is required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/admin/wallet/freeze', { userId: result.user._id, reason: reason.trim() });
      toast.success(res.data.message);
      setResult((prev) => ({
        ...prev,
        wallet: { ...prev.wallet, status: 'frozen', frozenReason: reason.trim() }
      }));
      setReason('');
    } catch (error) {
      console.error('Freeze failed:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnfreeze = async () => {
    if (reason.trim().length < 10) {
      toast.error('A reason of at least 10 characters is required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/admin/wallet/unfreeze', { userId: result.user._id, reason: reason.trim() });
      toast.success(res.data.message);
      setResult((prev) => ({
        ...prev,
        wallet: { ...prev.wallet, status: 'active', frozenReason: null }
      }));
      setReason('');
    } catch (error) {
      console.error('Unfreeze failed:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/admin')}
        className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
      >
        <FiArrowLeft className="h-5 w-5 mr-2" />
        Back to Admin Panel
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Wallet Management</h1>
        <p className="text-gray-600">Search a user by email to view and manage their wallet</p>
      </div>

      <form onSubmit={handleSearch} className="card mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">User Email</label>
        <div className="flex gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="input-field flex-1"
          />
          <button type="submit" disabled={searching} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            <FiSearch className="h-4 w-4" />
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {result && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">{result.user.name}</p>
              <p className="text-sm text-gray-500">{result.user.email}</p>
              <p className="text-xs text-gray-400 mt-1">
                Tier {result.user.kycTier} &middot; {result.user.isVerified ? 'Verified' : 'Unverified'} &middot; {result.user.isActive ? 'Active account' : 'Deactivated account'}
              </p>
            </div>
            {result.wallet && (
              <span className={`px-3 py-1 text-xs font-semibold rounded-full ${STATUS_COLORS[result.wallet.status] || STATUS_COLORS.active}`}>
                {result.wallet.status}
              </span>
            )}
          </div>

          {!result.wallet ? (
            <p className="text-sm text-gray-500">This user has no wallet yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4">
                <div>
                  <p className="text-xs text-gray-500">Balance</p>
                  <p className="text-lg font-semibold text-gray-900">Rs {result.wallet.balance.toLocaleString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Escrow Held</p>
                  <p className="text-lg font-semibold text-orange-600">Rs {(result.wallet.escrowHeld || 0).toLocaleString('en-IN')}</p>
                </div>
              </div>

              {result.wallet.status === 'frozen' && result.wallet.frozenReason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-red-700 mb-1">Frozen reason:</p>
                  <p className="text-sm text-red-800">{result.wallet.frozenReason}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason (required, min 10 characters)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Why are you freezing/unfreezing this wallet?"
                  className="input-field"
                />
              </div>

              <div className="flex gap-3">
                {result.wallet.status === 'frozen' ? (
                  <button
                    onClick={handleUnfreeze}
                    disabled={submitting || reason.trim().length < 10}
                    className="flex-1 flex items-center justify-center gap-2 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <FiUnlock className="h-4 w-4" />
                    {submitting ? 'Submitting...' : 'Unfreeze Wallet'}
                  </button>
                ) : (
                  <button
                    onClick={handleFreeze}
                    disabled={submitting || reason.trim().length < 10}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed py-2"
                  >
                    <FiLock className="h-4 w-4" />
                    {submitting ? 'Submitting...' : 'Freeze Wallet'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default WalletManagement;
