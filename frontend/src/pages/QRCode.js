import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { QRCodeSVG } from 'qrcode.react';
import { FiArrowLeft, FiDownload, FiShare2, FiCopy } from 'react-icons/fi';
import toast from 'react-hot-toast';

const QRCode = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQRCode();
  }, []);

  const fetchQRCode = async () => {
    try {
      const response = await api.get('/user/qr-code');
      setQrData(response.data.data);
    } catch (error) {
      console.error('Failed to fetch QR code:', error);
      toast.error('Failed to load QR code');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyQRData = () => {
    if (qrData?.qrData) {
      navigator.clipboard.writeText(JSON.stringify(qrData.qrData));
      toast.success('QR data copied to clipboard!');
    }
  };

  const handleDownloadQR = () => {
    const svg = document.getElementById('qr-code-svg');
    if (svg) {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `${user?.name}-qr-code.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      };
      
      img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Digital Wallet QR Code',
          text: `Send money to ${user?.name} using Digital Wallet`,
          url: window.location.href
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      // Fallback: copy URL to clipboard
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard!');
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="card">
            <div className="h-64 bg-gray-200 rounded-lg mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
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
        <h1 className="text-2xl font-bold text-gray-900">My QR Code</h1>
        <p className="text-gray-600">Share this QR code to receive payments</p>
      </div>

      <div className="card text-center">
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-primary-100 rounded-full mb-4">
            <span className="text-primary-600 text-2xl font-bold">
              {user?.name?.charAt(0).toUpperCase()}
            </span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">{user?.name}</h2>
          <p className="text-gray-600">{user?.email}</p>
        </div>

        {qrData?.qrCode ? (
          <div className="mb-6">
            <div className="inline-block p-6 bg-white border-2 border-gray-200 rounded-xl shadow-sm">
              <QRCodeSVG
                id="qr-code-svg"
                value={JSON.stringify(qrData.qrData)}
                size={200}
                level="M"
                includeMargin={true}
                fgColor="#000000"
                bgColor="#ffffff"
              />
            </div>
            <p className="text-sm text-gray-500 mt-4">
              Scan this QR code to send money to {user?.name}
            </p>
          </div>
        ) : (
          <div className="mb-6">
            <div className="w-48 h-48 bg-gray-200 rounded-xl mx-auto flex items-center justify-center">
              <p className="text-gray-500">QR Code not available</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            onClick={handleDownloadQR}
            disabled={!qrData?.qrCode}
            className="flex items-center justify-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiDownload className="h-4 w-4" />
            <span>Download</span>
          </button>

          <button
            onClick={handleShare}
            className="flex items-center justify-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <FiShare2 className="h-4 w-4" />
            <span>Share</span>
          </button>

          <button
            onClick={handleCopyQRData}
            disabled={!qrData?.qrData}
            className="flex items-center justify-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiCopy className="h-4 w-4" />
            <span>Copy Data</span>
          </button>
        </div>

        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-sm font-medium text-blue-800 mb-2">How to use this QR code:</h3>
          <ul className="text-sm text-blue-700 text-left space-y-1">
            <li>• Share this QR code with people who want to send you money</li>
            <li>• They can scan it using the Digital Wallet app</li>
            <li>• The payment will be processed instantly</li>
            <li>• You'll receive a notification when money is received</li>
          </ul>
        </div>

        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">Security Notice</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Only share this QR code with trusted individuals. Anyone with this code can initiate a payment request to you.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRCode;
