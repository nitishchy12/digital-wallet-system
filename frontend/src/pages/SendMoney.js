import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { FiArrowLeft, FiSearch, FiSend, FiUser, FiDollarSign } from 'react-icons/fi';
import toast from 'react-hot-toast';

const SendMoney = () => {
  const [step, setStep] = useState(1); // 1: Select recipient, 2: Enter amount, 3: Confirm
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);

  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const quickAmounts = [100, 500, 1000, 2000, 5000];

  useEffect(() => {
    fetchWalletBalance();
    
    // Check if recipient is pre-filled from QR scan
    if (location.state?.recipientData) {
      const recipientData = location.state.recipientData;
      // Create user object from QR data
      setSelectedUser({
        _id: recipientData.userId,
        name: recipientData.name || 'User',
        email: recipientData.email || ''
      });
      setStep(2); // Skip to amount step
    }
  }, []);

  useEffect(() => {
    if (searchQuery.length >= 2) {
      const debounceTimer = setTimeout(() => {
        searchUsers();
      }, 300);
      return () => clearTimeout(debounceTimer);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  // Handle QR code pre-fill
  useEffect(() => {
    if (location.state?.recipientData && !selectedUser) {
      const recipientData = location.state.recipientData;
      // If email is provided, search for user
      if (recipientData.email) {
        setSearchQuery(recipientData.email);
      } else if (recipientData.userId) {
        // Create a user object from QR data
        setSelectedUser({
          _id: recipientData.userId,
          name: recipientData.name || 'User',
          email: recipientData.email || ''
        });
        setStep(2);
      }
    }
  }, [location.state]);

  const fetchWalletBalance = async () => {
    try {
      const response = await api.get('/wallet/balance');
      setWalletBalance(response.data.data.balance);
    } catch (error) {
      console.error('Failed to fetch wallet balance:', error);
    }
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const response = await api.get(`/wallet/search-users?query=${encodeURIComponent(searchQuery)}`);
      setSearchResults(response.data.data.users);
    } catch (error) {
      console.error('User search failed:', error);
      toast.error('Failed to search users');
    } finally {
      setIsSearching(false);
    }
  };

  const handleUserSelect = (selectedUser) => {
    setSelectedUser(selectedUser);
    setStep(2);
  };

  const handleAmountChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    setAmount(value);
  };

  const handleQuickAmount = (quickAmount) => {
    setAmount(quickAmount.toString());
  };

  const handleSendMoney = async () => {
    const amountNum = parseInt(amount);
    
    if (!amountNum || amountNum < 1) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (amountNum > walletBalance) {
      toast.error('Insufficient wallet balance');
      return;
    }

    if (amountNum > 100000) {
      toast.error('Maximum transfer amount is ₹1,00,000');
      return;
    }

    setIsLoading(true);

    try {
      const response = await api.post('/wallet/transfer', {
        receiverEmail: selectedUser.email,
        amount: amountNum,
        description: description.trim() || undefined
      });

      toast.success(response.data.message);
      navigate('/');
    } catch (error) {
      console.error('Money transfer failed:', error);
      const message = error.response?.data?.message || 'Transfer failed';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      {[1, 2, 3].map((stepNum) => (
        <React.Fragment key={stepNum}>
          <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
            step >= stepNum ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600'
          }`}>
            {stepNum}
          </div>
          {stepNum < 3 && (
            <div className={`w-16 h-1 mx-2 ${
              step > stepNum ? 'bg-primary-600' : 'bg-gray-200'
            }`}></div>
          )}
        </React.Fragment>
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Select Recipient</h2>
        <p className="text-gray-600">Search for a user to send money to</p>
      </div>

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <FiSearch className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name or email..."
          className="input-field pl-10"
        />
        {isSearching && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
          </div>
        )}
      </div>

      {searchQuery.length >= 2 && (
        <div className="space-y-2">
          {searchResults.length === 0 && !isSearching ? (
            <div className="text-center py-8">
              <FiUser className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No users found</p>
              <p className="text-sm text-gray-400">Try searching with a different name or email</p>
            </div>
          ) : (
            searchResults.map((searchUser) => (
              <div
                key={searchUser._id}
                onClick={() => handleUserSelect(searchUser)}
                className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 cursor-pointer transition-colors"
              >
                <div className="h-10 w-10 rounded-full bg-primary-600 flex items-center justify-center mr-4">
                  <span className="text-white font-medium">
                    {searchUser.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{searchUser.name}</p>
                  <p className="text-sm text-gray-500">{searchUser.email}</p>
                </div>
                <FiSend className="h-5 w-5 text-gray-400" />
              </div>
            ))
          )}
        </div>
      )}

      {searchQuery.length < 2 && (
        <div className="text-center py-12">
          <FiSearch className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Start typing to search for users</p>
          <p className="text-sm text-gray-400">Enter at least 2 characters</p>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Enter Amount</h2>
        <p className="text-gray-600">How much do you want to send?</p>
      </div>

      {/* Selected User */}
      <div className="flex items-center p-4 bg-gray-50 rounded-lg">
        <div className="h-10 w-10 rounded-full bg-primary-600 flex items-center justify-center mr-4">
          <span className="text-white font-medium">
            {selectedUser.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1">
          <p className="font-medium text-gray-900">{selectedUser.name}</p>
          <p className="text-sm text-gray-500">{selectedUser.email}</p>
        </div>
        <button
          onClick={() => setStep(1)}
          className="text-primary-600 hover:text-primary-700 text-sm font-medium"
        >
          Change
        </button>
      </div>

      {/* Wallet Balance */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          Available Balance: <span className="font-semibold">₹{walletBalance.toLocaleString('en-IN')}</span>
        </p>
      </div>

      {/* Amount Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Amount
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <FiDollarSign className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={amount}
            onChange={handleAmountChange}
            placeholder="Enter amount"
            className="input-field pl-10 text-lg font-semibold"
          />
        </div>
        {amount && (
          <p className="mt-2 text-sm text-gray-600">
            Amount: ₹{parseInt(amount).toLocaleString('en-IN')}
          </p>
        )}
      </div>

      {/* Quick Amounts */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Quick Select
        </label>
        <div className="grid grid-cols-5 gap-2">
          {quickAmounts.map((quickAmount) => (
            <button
              key={quickAmount}
              type="button"
              onClick={() => handleQuickAmount(quickAmount)}
              disabled={quickAmount > walletBalance}
              className={`p-2 border rounded-lg text-center font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                amount === quickAmount.toString()
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-300 hover:border-gray-400 text-gray-700'
              }`}
            >
              ₹{quickAmount}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Description (Optional)
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's this for?"
          className="input-field"
          maxLength={200}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-4">
        <button
          onClick={() => setStep(1)}
          className="flex-1 btn-secondary"
        >
          Back
        </button>
        <button
          onClick={() => setStep(3)}
          disabled={!amount || parseInt(amount) < 1 || parseInt(amount) > walletBalance}
          className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Confirm Transfer</h2>
        <p className="text-gray-600">Please review the details before sending</p>
      </div>

      {/* Transfer Summary */}
      <div className="card bg-gray-50">
        <div className="space-y-4">
          <div className="flex justify-between">
            <span className="text-gray-600">To:</span>
            <div className="text-right">
              <p className="font-medium text-gray-900">{selectedUser.name}</p>
              <p className="text-sm text-gray-500">{selectedUser.email}</p>
            </div>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-600">Amount:</span>
            <span className="text-2xl font-bold text-gray-900">
              ₹{parseInt(amount).toLocaleString('en-IN')}
            </span>
          </div>
          
          {description && (
            <div className="flex justify-between">
              <span className="text-gray-600">Description:</span>
              <span className="text-gray-900">{description}</span>
            </div>
          )}
          
          <div className="border-t pt-4">
            <div className="flex justify-between">
              <span className="text-gray-600">Current Balance:</span>
              <span className="text-gray-900">₹{walletBalance.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Balance After:</span>
              <span className="font-medium text-gray-900">
                ₹{(walletBalance - parseInt(amount)).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-4">
        <button
          onClick={() => setStep(2)}
          disabled={isLoading}
          className="flex-1 btn-secondary"
        >
          Back
        </button>
        <button
          onClick={handleSendMoney}
          disabled={isLoading}
          className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Sending...
            </div>
          ) : (
            'Send Money'
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <FiArrowLeft className="h-5 w-5 mr-2" />
          Back to Dashboard
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Send Money</h1>
        <p className="text-gray-600">Transfer money to other Digital Wallet users</p>
      </div>

      <div className="card">
        {renderStepIndicator()}
        
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>
    </div>
  );
};

export default SendMoney;