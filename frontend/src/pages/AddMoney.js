import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { FiCreditCard, FiDollarSign, FiArrowLeft } from 'react-icons/fi';
import toast from 'react-hot-toast';

const AddMoney = () => {
  const [amount, setAmount] = useState('');
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMethods, setLoadingMethods] = useState(true);
  
  const navigate = useNavigate();

  const quickAmounts = [100, 500, 1000, 2000, 5000, 10000];

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      const response = await api.get('/payment/methods');
      setPaymentMethods(response.data.data.paymentMethods);
      if (response.data.data.paymentMethods.length > 0) {
        setSelectedMethod(response.data.data.paymentMethods[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch payment methods:', error);
      toast.error('Failed to load payment methods');
    } finally {
      setLoadingMethods(false);
    }
  };

  const handleAmountChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    setAmount(value);
  };

  const handleQuickAmount = (quickAmount) => {
    setAmount(quickAmount.toString());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const amountNum = parseInt(amount);
    if (!amountNum || amountNum < 1) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (amountNum > 100000) {
      toast.error('Maximum amount is ₹1,00,000');
      return;
    }

    if (!selectedMethod) {
      toast.error('Please select a payment method');
      return;
    }

    setIsLoading(true);

    try {
      // Create payment order
      const orderResponse = await api.post('/payment/create-order', {
        amount: amountNum,
        paymentGateway: selectedMethod.toUpperCase()
      });

      const { transaction, paymentData } = orderResponse.data.data;

      if (selectedMethod === 'mock') {
        toast.success(orderResponse.data.message || 'Money added successfully!');
        navigate('/dashboard');
        return;
      }

      if (selectedMethod === 'razorpay') {
        // Load Razorpay script
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => {
          const options = {
            key: paymentData.key,
            amount: paymentData.amount,
            currency: paymentData.currency,
            order_id: paymentData.orderId,
            name: 'Digital Wallet',
            description: 'Add money to wallet',
            handler: async (response) => {
              try {
                // Verify payment
                await api.post('/payment/verify', {
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  transactionId: transaction._id
                });

                toast.success('Money added successfully!');
                navigate('/dashboard');
              } catch (error) {
                console.error('Payment verification failed:', error);
                toast.error('Payment verification failed');
              }
            },
            modal: {
              ondismiss: () => {
                setIsLoading(false);
                toast.error('Payment cancelled');
              }
            },
            theme: {
              color: '#0ea5e9'
            }
          };

          const razorpay = new window.Razorpay(options);
          razorpay.open();
          setIsLoading(false);
        };
        
        script.onerror = () => {
          setIsLoading(false);
          toast.error('Failed to load payment gateway');
        };
        
        document.body.appendChild(script);
        return;
      }

      toast.error('Selected payment method is not supported yet');
      setIsLoading(false);
    } catch (error) {
      console.error('Payment initiation failed:', error);
      toast.error('Failed to initiate payment');
      setIsLoading(false);
    }
  };

  if (loadingMethods) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <FiArrowLeft className="h-5 w-5 mr-2" />
          Back to Dashboard
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Add Money</h1>
        <p className="text-gray-600">Add money to your digital wallet securely</p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Amount Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enter Amount
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
                required
              />
            </div>
            {amount && (
              <p className="mt-2 text-sm text-gray-600">
                Amount: ₹{parseInt(amount).toLocaleString('en-IN')}
              </p>
            )}
          </div>

          {/* Quick Amount Buttons */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Quick Select
            </label>
            <div className="grid grid-cols-3 gap-3">
              {quickAmounts.map((quickAmount) => (
                <button
                  key={quickAmount}
                  type="button"
                  onClick={() => handleQuickAmount(quickAmount)}
                  className={`p-3 border rounded-lg text-center font-medium transition-colors ${
                    amount === quickAmount.toString()
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-300 hover:border-gray-400 text-gray-700'
                  }`}
                >
                  ₹{quickAmount.toLocaleString('en-IN')}
                </button>
              ))}
            </div>
          </div>

          {/* Payment Methods */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Payment Method
            </label>
            {paymentMethods.length === 0 ? (
              <div className="text-center py-8">
                <FiCreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No payment methods available</p>
                <p className="text-sm text-gray-400">Please contact support</p>
              </div>
            ) : (
              <div className="space-y-3">
                {paymentMethods.map((method) => (
                  <label
                    key={method.id}
                    className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedMethod === method.id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={method.id}
                      checked={selectedMethod === method.id}
                      onChange={(e) => setSelectedMethod(e.target.value)}
                      className="sr-only"
                    />
                    <div className="flex items-center flex-1">
                      <FiCreditCard className="h-6 w-6 text-gray-400 mr-3" />
                      <div>
                        <p className="font-medium text-gray-900">{method.name}</p>
                        <p className="text-sm text-gray-500">{method.description}</p>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 ${
                      selectedMethod === method.id
                        ? 'border-primary-500 bg-primary-500'
                        : 'border-gray-300'
                    }`}>
                      {selectedMethod === method.id && (
                        <div className="w-2 h-2 bg-white rounded-full mx-auto mt-0.5"></div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Security Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <FiCreditCard className="h-5 w-5 text-blue-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">
                  Secure Payment
                </h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>
                    Your payment is processed securely through our trusted payment partners.
                    We never store your card details.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !amount || !selectedMethod || paymentMethods.length === 0}
            className="w-full btn-primary py-3 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Processing...
              </div>
            ) : (
              `Add ₹${amount ? parseInt(amount).toLocaleString('en-IN') : '0'}`
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AddMoney;
