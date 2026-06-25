import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { FiArrowLeft, FiCheck, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';

const DisputeQueue = () => {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null); // dispute._id currently showing the note form
  const [activeAction, setActiveAction] = useState(null); // 'resolve' | 'reject'
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const fetchQueue = useCallback(async () => {
    try {
      const res = await api.get('/disputes/admin/queue?status=pending');
      setDisputes(res.data.data || []);
    } catch (error) {
      console.error('Failed to fetch dispute queue:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const openAction = (disputeId, action) => {
    setActiveId(disputeId);
    setActiveAction(action);
    setNote('');
  };

  const closeAction = () => {
    setActiveId(null);
    setActiveAction(null);
    setNote('');
  };

  const submitAction = async () => {
    if (note.trim().length < 10) {
      toast.error('Resolution note must be at least 10 characters');
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = activeAction === 'resolve' ? '/disputes/admin/resolve' : '/disputes/admin/reject';
      const res = await api.post(endpoint, { disputeId: activeId, resolutionNote: note.trim() });
      toast.success(res.data.message);
      setDisputes((prev) => prev.filter((d) => d._id !== activeId));
      closeAction();
    } catch (error) {
      console.error('Dispute action failed:', error);
    } finally {
      setSubmitting(false);
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
        <h1 className="text-2xl font-bold text-gray-900">Dispute Queue</h1>
        <p className="text-gray-600">{disputes.length} pending dispute{disputes.length === 1 ? '' : 's'} awaiting review</p>
      </div>

      {disputes.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">🛡️</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Queue is empty</h3>
          <p className="text-gray-500 text-sm">No disputes are currently pending review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {disputes.map((dispute) => (
            <div key={dispute._id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {dispute.raisedBy?.name} <span className="text-gray-400">raised against</span> {dispute.againstUserId?.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {dispute.raisedBy?.email} &rarr; {dispute.againstUserId?.email}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Transaction: {dispute.transactionId?.transactionId || dispute.transactionId?._id}
                    {' '}&middot;{' '}
                    {new Date(dispute.transactionId?.createdAt || dispute.createdAt).toLocaleDateString('en-IN')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-gray-900">Rs {dispute.amount.toLocaleString('en-IN')}</p>
                  <p className="text-xs text-orange-600">held in escrow</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 mt-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Reason given:</p>
                <p className="text-sm text-gray-700">{dispute.reason}</p>
              </div>

              {activeId === dispute._id ? (
                <div className="mt-4 border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {activeAction === 'resolve' ? 'Resolution note (money will be reversed)' : 'Rejection reason (escrow released, no money moves)'}
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    minLength={10}
                    placeholder="At least 10 characters..."
                    className="input-field"
                  />
                  <div className="flex gap-3 mt-3">
                    <button onClick={closeAction} className="btn-secondary flex-1" disabled={submitting}>
                      Cancel
                    </button>
                    <button
                      onClick={submitAction}
                      disabled={submitting || note.trim().length < 10}
                      className={`flex-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                        activeAction === 'resolve' ? 'btn-primary' : 'bg-red-600 text-white rounded-lg hover:bg-red-700'
                      }`}
                    >
                      {submitting ? 'Submitting...' : activeAction === 'resolve' ? 'Confirm Resolve' : 'Confirm Reject'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => openAction(dispute._id, 'reject')}
                    className="flex-1 flex items-center justify-center gap-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg py-2 transition-colors"
                  >
                    <FiX className="h-4 w-4" />
                    Reject
                  </button>
                  <button
                    onClick={() => openAction(dispute._id, 'resolve')}
                    className="flex-1 flex items-center justify-center gap-2 border border-green-200 text-green-600 hover:bg-green-50 rounded-lg py-2 transition-colors"
                  >
                    <FiCheck className="h-4 w-4" />
                    Resolve (Reverse Transfer)
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

export default DisputeQueue;
