import { useState } from 'react';
import api from '../utils/api';

export default function CreateScheduledModal({ onClose, onSuccess }) {
  const [receiverEmail, setReceiverEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [intervalDays, setIntervalDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const minDate = new Date(Date.now() + 60000).toISOString().split('T')[0];

  function buildScheduledAt() {
    if (!date || !time) return null;
    return new Date(`${date}T${time}`).toISOString();
  }

  const scheduledAt = buildScheduledAt();
  const canSubmit = receiverEmail.trim() &&
    Number(amount) > 0 &&
    date && time &&
    scheduledAt &&
    new Date(scheduledAt) > new Date();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    try {
      await api.post('/scheduled-transfers', {
        receiverEmail: receiverEmail.trim(),
        amount: Number(amount),
        description: description.trim() || undefined,
        scheduledAt: buildScheduledAt(),
        recurring,
        recurringIntervalDays: recurring ? Number(intervalDays) : null
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to schedule transfer.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Schedule a Transfer</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Receiver Email</label>
            <input
              type="email"
              value={receiverEmail}
              onChange={e => setReceiverEmail(e.target.value)}
              placeholder="receiver@example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₹)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="500"
              min="1"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Monthly rent"
              maxLength={100}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input
                type="date"
                value={date}
                min={minDate}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Time</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="recurring"
              checked={recurring}
              onChange={e => setRecurring(e.target.checked)}
              className="w-4 h-4 text-primary-600 rounded"
            />
            <label htmlFor="recurring" className="text-sm text-gray-700">
              Make this recurring
            </label>
          </div>

          {recurring && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Repeat every</label>
              <select
                value={intervalDays}
                onChange={e => setIntervalDays(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value={1}>Day</option>
                <option value={7}>Week</option>
                <option value={30}>Month</option>
              </select>
            </div>
          )}

          {date && time && scheduledAt && new Date(scheduledAt) <= new Date() && (
            <p className="text-xs text-red-500">Scheduled time must be in the future.</p>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? 'Scheduling...' : 'Schedule Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
