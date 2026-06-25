import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { FiArrowLeft, FiCheck, FiX, FiFileText } from 'react-icons/fi';
import toast from 'react-hot-toast';

const DOC_LABELS = {
  aadhar: 'Aadhar Card',
  pan: 'PAN Card',
  passport: 'Passport',
  driving_license: 'Driving License'
};

const KYCQueue = () => {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(null);
  const navigate = useNavigate();

  const fetchQueue = useCallback(async () => {
    try {
      const res = await api.get('/admin/kyc/queue?status=pending');
      setSubmissions(res.data.data || []);
    } catch (error) {
      console.error('Failed to fetch KYC queue:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const approve = async (id) => {
    setSubmitting(id);
    try {
      const res = await api.patch(`/admin/kyc/${id}`, { action: 'approve' });
      toast.success(res.data.message);
      setSubmissions((prev) => prev.filter((s) => s._id !== id));
    } catch (error) {
      console.error('KYC approve failed:', error);
    } finally {
      setSubmitting(null);
    }
  };

  const openReject = (id) => {
    setRejectingId(id);
    setReason('');
  };

  const submitReject = async () => {
    if (reason.trim().length < 10) {
      toast.error('Rejection reason must be at least 10 characters');
      return;
    }
    setSubmitting(rejectingId);
    try {
      const res = await api.patch(`/admin/kyc/${rejectingId}`, { action: 'reject', reason: reason.trim() });
      toast.success(res.data.message);
      setSubmissions((prev) => prev.filter((s) => s._id !== rejectingId));
      setRejectingId(null);
      setReason('');
    } catch (error) {
      console.error('KYC reject failed:', error);
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => navigate('/admin')}
        className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
      >
        <FiArrowLeft className="h-5 w-5 mr-2" />
        Back to Admin Panel
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">KYC Approval Queue</h1>
        <p className="text-gray-600">{submissions.length} pending submission{submissions.length === 1 ? '' : 's'}</p>
      </div>

      {submissions.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">📄</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Queue is empty</h3>
          <p className="text-gray-500 text-sm">No KYC submissions are currently pending review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map((doc) => (
            <div key={doc._id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 rounded-full">
                    <FiFileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{doc.userId?.name}</p>
                    <p className="text-sm text-gray-500">{doc.userId?.email}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Currently Tier {doc.userId?.kycTier} &rarr; requesting Tier {doc.targetTier}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{DOC_LABELS[doc.docType] || doc.docType}</p>
                  <p className="text-xs text-gray-500">{doc.docNumber}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(doc.createdAt).toLocaleDateString('en-IN')}</p>
                </div>
              </div>

              {rejectingId === doc._id ? (
                <div className="mt-4 border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rejection reason
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    minLength={10}
                    placeholder="At least 10 characters..."
                    className="input-field"
                  />
                  <div className="flex gap-3 mt-3">
                    <button onClick={() => setRejectingId(null)} className="btn-secondary flex-1" disabled={submitting === doc._id}>
                      Cancel
                    </button>
                    <button
                      onClick={submitReject}
                      disabled={submitting === doc._id || reason.trim().length < 10}
                      className="flex-1 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting === doc._id ? 'Submitting...' : 'Confirm Reject'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => openReject(doc._id)}
                    disabled={submitting === doc._id}
                    className="flex-1 flex items-center justify-center gap-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg py-2 transition-colors disabled:opacity-50"
                  >
                    <FiX className="h-4 w-4" />
                    Reject
                  </button>
                  <button
                    onClick={() => approve(doc._id)}
                    disabled={submitting === doc._id}
                    className="flex-1 flex items-center justify-center gap-2 border border-green-200 text-green-600 hover:bg-green-50 rounded-lg py-2 transition-colors disabled:opacity-50"
                  >
                    <FiCheck className="h-4 w-4" />
                    {submitting === doc._id ? 'Submitting...' : 'Approve'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default KYCQueue;
