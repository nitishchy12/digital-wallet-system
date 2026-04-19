import axios from 'axios';
import toast from 'react-hot-toast';

// Create axios instance
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// ─── Request interceptor: attach access token ─────────────────────────────
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

// ─── BUG-09: Token refresh state ─────────────────────────────────────────
// We keep a single promise so if multiple requests fail simultaneously with
// 401, only ONE refresh call is made and all requests queue behind it.
let isRefreshing = false;
let refreshSubscribers = [];

const subscribeTokenRefresh = (resolve, reject) => {
  refreshSubscribers.push({ resolve, reject });
};

const onRefreshSuccess = (newToken) => {
  refreshSubscribers.forEach(({ resolve }) => resolve(newToken));
  refreshSubscribers = [];
};

const onRefreshFailure = (refreshError) => {
  refreshSubscribers.forEach(({ reject }) => reject(refreshError));
  refreshSubscribers = [];
};

const clearRefreshQueue = () => {
  refreshSubscribers = [];
};

const shouldToastError = (error) => !error.config?.skipErrorToast;

// ─── Response interceptor ────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // No response = network error
    if (!error.response) {
      if (shouldToastError(error)) {
        toast.error('Network error. Please check your connection.');
      }
      return Promise.reject(error);
    }

    const { status } = error.response;
    const message = error.response.data?.message || 'An error occurred';

    // ── BUG-09: Silent token refresh on 401 ──────────────────────────────
    if (status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem('refreshToken');

      // No refresh token → force logout immediately (no toast loop)
      if (!refreshToken) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        localStorage.removeItem('requiresVerification');
        window.location.href = '/signin';
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Queue this request until the refresh resolves
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh(
            (newToken) => {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(api(originalRequest));
            },
            (refreshError) => reject(refreshError)
          );
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Use a raw axios call (not `api`) to avoid interceptor loop
        const refreshResponse = await axios.post(
          `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/auth/refresh-token`,
          { refreshToken },
          {
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        const { accessToken, refreshToken: newRefreshToken } = refreshResponse.data.data;

        localStorage.setItem('accessToken', accessToken);
        if (newRefreshToken) {
          localStorage.setItem('refreshToken', newRefreshToken);
        }

        // Update the original request and all queued requests
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        onRefreshSuccess(accessToken);
        isRefreshing = false;

        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed → logout cleanly without a toast
        isRefreshing = false;
        onRefreshFailure(refreshError);
        clearRefreshQueue();
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        localStorage.removeItem('requiresVerification');
        window.location.href = '/signin';
        return Promise.reject(refreshError);
      }
    }

    // ── BUG-16: Centralised error toasting ───────────────────────────────
    // Show ONE toast per error here. Pages should NOT show their own toasts
    // for API errors — they can read the error message from error.response.
    if (!shouldToastError(error)) {
      return Promise.reject(error);
    }

    switch (status) {
      case 400:
        if (error.response.data?.errors) {
          error.response.data.errors.forEach((err) => {
            toast.error(`${err.field}: ${err.message}`);
          });
        } else {
          toast.error(message);
        }
        break;

      case 401:
        // We only reach here if _retry was already set (refresh failed above)
        // or no refreshToken existed. Redirect handled above already.
        break;

      case 403:
        if (message === 'Account not verified') {
          toast.error('Please verify your account to continue');
          const storedUser = localStorage.getItem('user');
          if (storedUser) {
            try {
              const user = JSON.parse(storedUser);
              localStorage.setItem('requiresVerification', 'true');
              window.location.href = `/verify-otp${user?.email ? `?email=${encodeURIComponent(user.email)}` : ''}`;
              break;
            } catch (parseError) {
              localStorage.removeItem('user');
            }
          }
        }
        toast.error(message || 'Access denied');
        break;

      case 404:
        toast.error(message || 'Resource not found');
        break;

      case 409:
        // Conflict — usually idempotency; let caller decide
        break;

      case 429:
        toast.error('Too many requests. Please try again later.');
        break;

      case 500:
      case 502:
      case 503:
        toast.error('Server error. Please try again later.');
        break;

      default:
        toast.error(message);
    }

    return Promise.reject(error);
  }
);

export default api;
