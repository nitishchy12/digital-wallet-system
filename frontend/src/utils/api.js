/**
 * API Client with Axios Interceptor
 * Simplified - Access Token Only (Senior Approach)
 */

import axios from 'axios';
import toast from 'react-hot-toast';

// Create axios instance
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - Auto-attach access token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors and auto-logout on 401
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Handle network errors
    if (!error.response) {
      toast.error('Network error. Please check your connection.');
      return Promise.reject(error);
    }

    const status = error.response.status;
    const code = error.response.data?.code;
    const message = error.response.data?.message || 'An error occurred';

    // Handle 401 - Token expired or invalid
    if (status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem('accessToken');
      
      // Don't show error if already on login page
      if (window.location.pathname !== '/login') {
        toast.error('Session expired. Please login again.');
        window.location.href = '/login';
      }
      
      return Promise.reject(error);
    }

    // Handle validation errors (400 with errors array)
    if (status === 400 && error.response.data?.errors) {
      const validationErrors = error.response.data.errors;
      validationErrors.forEach(err => {
        toast.error(`${err.field}: ${err.message}`);
      });
      return Promise.reject(error);
    }

    // Handle specific error codes
    switch (code) {
      case 'ACCOUNT_NOT_VERIFIED':
        toast.error('Please verify your email first');
        break;
      case 'INSUFFICIENT_BALANCE':
        toast.error(message);
        break;
      case 'WALLET_NOT_FOUND':
        toast.error('Wallet not found. Please contact support.');
        break;
      case 'TOKEN_EXPIRED':
        toast.error('Session expired. Please login again.');
        localStorage.removeItem('accessToken');
        window.location.href = '/login';
        break;
      default:
        // Show error message from server
        if (message && status !== 401) {
          toast.error(message);
        }
    }

    return Promise.reject(error);
  }
);

export default api;
