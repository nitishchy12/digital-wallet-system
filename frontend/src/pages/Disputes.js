import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  under_review: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800'
};

const STATUS_LABELS = {
  pending: 'Pending Review',
  under_review: 'Under Review',
  resolved: 'Resolved',
  rejected: 'Rejected'
};

export default function Disputes() {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetchDisputes();
  }, []);

  async function fetchDisputes() {
    try {
      setLoading(true);
      const res = await api.get('/disputes/my');
      setDisputes(res.data.data || []);
    } catch (err) {
      setError('Failed to load disputes.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
    </div>
  );

  if (error) return (
    <div className="p-6 text-center text-red-600">{error}</div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">My Disputes</h1>

      {disputes.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="text-5xl mb-4">🛡️</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No disputes raised</h3>
          <p className="text-gray-500 text-sm">
            You can raise a dispute on any transfer within 24 hours from the Transactions page.
          </p>
          <Link
            to="/transactions"
            className="mt-4 inline-block px-6 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
          >
            View Transactions
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {disputes.map(dispute => (
            <div
              key={dispute._id}
              className="bg-white rounded-xl border border-gray-200 p-5 cursor-pointer hover:border-purple-300 transition-colors"
              onClick={() => setSelected(selected?._id === dispute._id ? null : dispute)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500 mb-1">
                    Transaction #{dispute.transactionId?._id?.toString().slice(-8) || 'N/A'}
                  </p>
                  <p className="font-semibold text-gray-800 text-lg">
                    ₹{dispute.amount?.toLocaleString('en-IN')}
                  </p>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-1">{dispute.reason}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-medium px-3 py-1 rounded-full ${STATUS_COLORS[dispute.status]}`}>
                    {STATUS_LABELS[dispute.status]}
                  </span>
                  {(dispute.status === 'pending' || dispute.status === 'under_review') && (
                    <p className="text-xs text-orange-600 mt-2 font-medium">
                      ₹{dispute.escrowAmount} held in escrow
                    </p>
                  )}
                </div>
              </div>

              {selected?._id === dispute._id && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Timeline</p>
                  <div className="space-y-2">
                    {dispute.timeline?.map((event, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full bg-purple-400 mt-1.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-700 capitalize">
                            {event.status?.replace('_', ' ')}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(event.changedAt).toLocaleString('en-IN')}
                          </p>
                          {event.note && (
                            <p className="text-xs text-gray-600 mt-0.5">{event.note}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {dispute.status === 'resolved' && dispute.compensatingTransactionId && (
                    <div className="mt-3 p-3 bg-green-50 rounded-lg">
                      <p className="text-sm text-green-700 font-medium">
                        ✓ ₹{dispute.amount} has been returned to your wallet
                      </p>
                      <p className="text-xs text-green-600 mt-0.5">
                        Reversal ID: #{dispute.compensatingTransactionId.toString().slice(-8)}
                      </p>
                    </div>
                  )}

                  {dispute.status === 'rejected' && (
                    <div className="mt-3 p-3 bg-red-50 rounded-lg">
                      <p className="text-sm text-red-700 font-medium">
                        Dispute rejected — original transfer stands
                      </p>
                      {dispute.resolutionNote && (
                        <p className="text-xs text-red-600 mt-0.5">{dispute.resolutionNote}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
