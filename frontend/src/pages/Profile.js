import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FiArrowLeft, FiUser, FiMail, FiPhone, FiShield, FiEdit3, FiCreditCard } from 'react-icons/fi';
import api from '../utils/api';

const KYC_TIERS = {
  0: {
    label: 'Basic',
    color: 'bg-gray-100 text-gray-700',
    borderColor: 'border-gray-300',
    limits: {
      perTransfer: '₹10,000',
      daily: '₹10,000',
      balance: '₹10,000'
    },
    nextStep: 'Submit your documents to upgrade to Tier 1',
    badge: '🔓'
  },
  1: {
    label: 'Verified',
    color: 'bg-blue-100 text-blue-700',
    borderColor: 'border-blue-300',
    limits: {
      perTransfer: '₹50,000',
      daily: '₹50,000',
      balance: '₹1,00,000'
    },
    nextStep: 'Submit additional KYC documents to upgrade to Tier 2',
    badge: '✓'
  },
  2: {
    label: 'Full KYC',
    color: 'bg-green-100 text-green-700',
    borderColor: 'border-green-300',
    limits: {
      perTransfer: '₹2,00,000',
      daily: '₹2,00,000',
      balance: '₹5,00,000'
    },
    nextStep: null,
    badge: '⭐'
  }
};

const Profile = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile');

  const [kycStatus, setKycStatus] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [docType, setDocType] = useState('aadhar');
  const [docNumber, setDocNumber] = useState('');

  const currentTier = user?.kycTier ?? 0;
  const tierInfo = KYC_TIERS[currentTier];

  useEffect(() => {
    fetchKycStatus();
  }, []);

  async function fetchKycStatus() {
    try {
      const res = await api.get('/auth/kyc/status', { skipErrorToast: true });
      setKycStatus(res.data.data);
    } catch (err) {
      // KYC status unavailable — upgrade form still works
    }
  }

  async function handleKycSubmit(e) {
    e.preventDefault();
    if (!docNumber.trim()) return;
    setUploading(true);
    setUploadError(null);

    try {
      await api.post('/auth/kyc/submit', {
        docType,
        docNumber: docNumber.trim()
      });
      setUploadSuccess(true);
      setDocNumber('');
      fetchKycStatus();
    } catch (err) {
      setUploadError(err.response?.data?.message || 'Submission failed. Try again.');
    } finally {
      setUploading(false);
    }
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: FiUser },
    { id: 'kyc', label: 'KYC & Limits', icon: FiCreditCard },
    { id: 'security', label: 'Security', icon: FiShield }
  ];

  const renderProfileTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Profile Information</h3>
        <button className="flex items-center space-x-2 text-primary-600 hover:text-primary-700">
          <FiEdit3 className="h-4 w-4" />
          <span>Edit</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Full Name
          </label>
          <div className="flex items-center p-3 bg-gray-50 rounded-lg">
            <FiUser className="h-5 w-5 text-gray-400 mr-3" />
            <span className="text-gray-900">{user?.name}</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email Address
          </label>
          <div className="flex items-center p-3 bg-gray-50 rounded-lg">
            <FiMail className="h-5 w-5 text-gray-400 mr-3" />
            <span className="text-gray-900">{user?.email}</span>
            {user?.isVerified && (
              <span className="ml-2 px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                Verified
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Phone Number
          </label>
          <div className="flex items-center p-3 bg-gray-50 rounded-lg">
            <FiPhone className="h-5 w-5 text-gray-400 mr-3" />
            <span className="text-gray-900">{user?.phone}</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Account Status
          </label>
          <div className="flex items-center p-3 bg-gray-50 rounded-lg">
            <div className={`h-3 w-3 rounded-full mr-3 ${user?.isActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-gray-900">{user?.isActive ? 'Active' : 'Inactive'}</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            KYC Status
          </label>
          <div className="flex items-center p-3 bg-gray-50 rounded-lg">
            <span className={`px-3 py-1 text-sm font-medium rounded-full ${
              user?.kycStatus === 'verified' 
                ? 'bg-green-100 text-green-800'
                : user?.kycStatus === 'rejected'
                ? 'bg-red-100 text-red-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {user?.kycStatus?.charAt(0).toUpperCase() + user?.kycStatus?.slice(1)}
            </span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Member Since
          </label>
          <div className="flex items-center p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-900">
              {new Date(user?.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderKycTab = () => (
    <div className="space-y-6">
      {/* Current tier card */}
      <div className={`rounded-xl border-2 ${tierInfo.borderColor} p-5`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-gray-500">Current KYC Level</p>
            <h3 className="text-xl font-bold text-gray-900">
              Tier {currentTier} — {tierInfo.label}
            </h3>
          </div>
          <span className={`text-sm font-medium px-3 py-1 rounded-full ${tierInfo.color}`}>
            {tierInfo.badge} Active
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Per Transfer', value: tierInfo.limits.perTransfer },
            { label: 'Daily Limit', value: tierInfo.limits.daily },
            { label: 'Max Balance', value: tierInfo.limits.balance }
          ].map(item => (
            <div key={item.label} className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">{item.label}</p>
              <p className="text-sm font-bold text-gray-900">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tier progression */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-4">KYC Tier Progress</h3>
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((tier, idx) => (
            <div key={tier} className="flex items-center gap-2 flex-1">
              <div className="flex-1 text-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-1 text-sm font-bold ${
                  tier <= currentTier
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-200 text-gray-400'
                }`}>
                  {tier <= currentTier ? '✓' : tier}
                </div>
                <p className="text-xs text-gray-600">{KYC_TIERS[tier].label}</p>
              </div>
              {idx < 2 && (
                <div className={`h-0.5 flex-1 ${tier < currentTier ? 'bg-primary-600' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Upgrade section */}
      {currentTier < 2 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">
            Upgrade to Tier {currentTier + 1}
          </h3>
          <p className="text-xs text-gray-500 mb-4">{tierInfo.nextStep}</p>

          {kycStatus?.status === 'pending' ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <p className="text-sm font-medium text-yellow-800">
                📋 Document under review
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                Our team typically reviews within 24 hours. You will be notified once approved.
              </p>
            </div>
          ) : uploadSuccess ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-sm font-medium text-green-800">
                ✓ Document submitted successfully
              </p>
              <p className="text-xs text-green-700 mt-1">
                We will review your document and upgrade your tier within 24 hours.
              </p>
            </div>
          ) : (
            <form onSubmit={handleKycSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Document Type
                </label>
                <select
                  value={docType}
                  onChange={e => setDocType(e.target.value)}
                  className="input-field text-sm"
                >
                  <option value="aadhar">Aadhaar Card</option>
                  <option value="pan">PAN Card</option>
                  <option value="passport">Passport</option>
                  <option value="driving_license">Driving License</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Document Number
                </label>
                <input
                  type="text"
                  value={docNumber}
                  onChange={e => setDocNumber(e.target.value)}
                  placeholder={docType === 'aadhar' ? 'XXXX XXXX XXXX' : docType === 'pan' ? 'ABCDE1234F' : 'Document number'}
                  className="input-field text-sm"
                />
              </div>

              {uploadError && (
                <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg">{uploadError}</p>
              )}

              <button
                type="submit"
                disabled={uploading || !docNumber.trim()}
                className="btn-primary w-full disabled:opacity-50"
              >
                {uploading ? 'Submitting...' : 'Submit for Review'}
              </button>

              <p className="text-xs text-gray-400 text-center">
                Your document number is stored securely and never shared.
              </p>
            </form>
          )}
        </div>
      )}

      {currentTier === 2 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
          <p className="text-2xl mb-2">⭐</p>
          <p className="font-semibold text-green-800">Full KYC Verified</p>
          <p className="text-sm text-green-700 mt-1">
            You have the highest transfer limits available.
          </p>
        </div>
      )}
    </div>
  );

  const renderSecurityTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Security Settings</h3>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
          <div>
            <h4 className="font-medium text-gray-900">Password</h4>
            <p className="text-sm text-gray-500">Last updated: Never</p>
          </div>
          <button className="btn-outline" onClick={() => navigate('/forgot-password')}>
            Change Password
          </button>
        </div>

        <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
          <div>
            <h4 className="font-medium text-gray-900">Two-Factor Authentication</h4>
            <p className="text-sm text-gray-500">Add an extra layer of security</p>
          </div>
          <button className="btn-outline">
            Enable 2FA
          </button>
        </div>

        <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
          <div>
            <h4 className="font-medium text-gray-900">Account Activity</h4>
            <p className="text-sm text-gray-500">View your login history and account activity</p>
          </div>
          <button className="btn-outline" onClick={() => navigate('/audit-log')}>
            View Activity
          </button>
        </div>

        <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
          <div>
            <h4 className="font-medium text-gray-900">Notification Preferences</h4>
            <p className="text-sm text-gray-500">Choose how you're notified about activity</p>
          </div>
          <button className="btn-outline" onClick={() => navigate('/notification-preferences')}>
            Manage
          </button>
        </div>

        <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
          <div>
            <h4 className="font-medium text-gray-900">Account Deactivation</h4>
            <p className="text-sm text-gray-500">Temporarily disable your account</p>
          </div>
          <button className="text-red-600 hover:text-red-700 font-medium">
            Deactivate
          </button>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <FiShield className="h-5 w-5 text-yellow-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">
              Security Tips
            </h3>
            <div className="mt-2 text-sm text-yellow-700">
              <ul className="list-disc list-inside space-y-1">
                <li>Use a strong, unique password</li>
                <li>Enable two-factor authentication</li>
                <li>Never share your login credentials</li>
                <li>Log out from shared devices</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

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
        <h1 className="text-2xl font-bold text-gray-900">Profile Settings</h1>
        <p className="text-gray-600">Manage your account information and security settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Profile Header */}
        <div className="lg:col-span-4">
          <div className="card">
            <div className="flex items-center space-x-4">
              <div className="h-16 w-16 rounded-full bg-primary-600 flex items-center justify-center">
                <span className="text-white text-2xl font-bold">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{user?.name}</h2>
                <p className="text-gray-600">{user?.email}</p>
                <div className="flex items-center space-x-2 mt-1">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    user?.isVerified 
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {user?.isVerified ? 'Verified' : 'Unverified'}
                  </span>
                  <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                    {user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1)}
                  </span>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${tierInfo.color}`}>
                    {tierInfo.badge} KYC {tierInfo.label}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="card">
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <tab.icon className="mr-3 h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          <div className="card">
            {activeTab === 'profile' && renderProfileTab()}
            {activeTab === 'kyc' && renderKycTab()}
            {activeTab === 'security' && renderSecurityTab()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
