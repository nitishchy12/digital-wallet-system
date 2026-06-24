import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { FiArrowLeft, FiBell } from 'react-icons/fi';
import toast from 'react-hot-toast';

// Only these event types have a real producer wired in backend/workers/notificationWorker.js.
// Listing more here would let users toggle settings for notifications that never get sent.
const EVENT_LABELS = {
  TRANSFER_SENT: 'Money sent',
  MONEY_RECEIVED: 'Money received',
  LOW_BALANCE_ALERT: 'Low balance alert',
  DISPUTE_RAISED: 'Dispute raised'
};

const NotificationPreferences = () => {
  const [prefs, setPrefs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      const response = await api.get('/auth/notification-preferences', {
        skipErrorToast: true
      });
      setPrefs(response.data.data || {});
    } catch (error) {
      console.error('Failed to fetch notification preferences:', error);
      toast.error('Failed to load notification preferences');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (eventType, channel) => {
    setPrefs((prev) => ({
      ...prev,
      [eventType]: {
        ...prev[eventType],
        [channel]: !prev[eventType]?.[channel]
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await api.put('/auth/notification-preferences', prefs);
      setPrefs(response.data.data);
      toast.success('Preferences saved');
    } catch (error) {
      console.error('Failed to save notification preferences:', error);
    } finally {
      setSaving(false);
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
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/profile')}
        className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
      >
        <FiArrowLeft className="h-5 w-5 mr-2" />
        Back to Profile
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Notification Preferences</h1>
        <p className="text-gray-600">Choose how you want to be notified about activity</p>
      </div>

      <div className="card">
        <div className="grid grid-cols-[1fr,80px,80px] gap-2 px-4 py-3 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase">
          <span>Event</span>
          <span className="text-center">Email</span>
          <span className="text-center">In-App</span>
        </div>

        {Object.entries(EVENT_LABELS).map(([key, label]) => (
          <div
            key={key}
            className="grid grid-cols-[1fr,80px,80px] gap-2 px-4 py-3 border-b border-gray-100 items-center last:border-b-0"
          >
            <span className="text-sm text-gray-700">{label}</span>
            <div className="flex justify-center">
              <input
                type="checkbox"
                checked={prefs[key]?.email ?? true}
                onChange={() => toggle(key, 'email')}
                className="w-4 h-4 text-primary-600 rounded"
              />
            </div>
            <div className="flex justify-center">
              <input
                type="checkbox"
                checked={prefs[key]?.inApp ?? true}
                onChange={() => toggle(key, 'inApp')}
                className="w-4 h-4 text-primary-600 rounded"
              />
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary w-full mt-4 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Preferences'}
      </button>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
        <div className="flex">
          <FiBell className="h-5 w-5 text-blue-400 flex-shrink-0" />
          <p className="ml-3 text-sm text-blue-700">
            Only the events listed above are currently sent by the system. More notification
            types are planned but not live yet.
          </p>
        </div>
      </div>
    </div>
  );
};

export default NotificationPreferences;
