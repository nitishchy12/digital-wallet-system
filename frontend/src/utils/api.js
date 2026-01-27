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

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    // Handle network errors
    if (!error.response) {
      toast.error('Network error. Please check your connection.');
      return Promise.reject(error);
    }

    // Handle other HTTP errors
    const status = error.response.status;
    const message = error.response.data?.message || 'An error occurred';

    switch (status) {
      case 400:
        // Bad request - usually validation errors
        if (error.response.data?.errors) {
          const validationErrors = error.response.data.errors;
          validationErrors.forEach(err => {
            toast.error(`${err.field}: ${err.message}`);
          });
        } else {
          toast.error(message);
        }
        break;

      case 401:
        // Unauthorized
        toast.error('Please login to continue');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        break;

      case 403:
        // Forbidden
        toast.error('Access denied');
        break;

      case 404:
        // Not found
        toast.error('Resource not found');
        break;

      case 429:
        // Too many requests
        toast.error('Too many requests. Please try again later.');
        break;

      case 500:
        // Server error
        toast.error('Server error. Please try again later.');
        break;

      default:
        toast.error(message);
    }

    return Promise.reject(error);
  }
);

export default api;