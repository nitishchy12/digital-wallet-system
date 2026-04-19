import React, { createContext, useContext, useReducer, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const AuthContext = createContext();

/* ================= INITIAL STATE ================= */

const initialState = {
  user: null,
  token: localStorage.getItem('accessToken'),
  isAuthenticated: false,
  loading: true,
  requiresVerification:
    localStorage.getItem('requiresVerification') === 'true' ||
    (() => {
      try {
        const savedUser = JSON.parse(localStorage.getItem('user') || 'null');
        return Boolean(savedUser && savedUser.isVerified === false);
      } catch (error) {
        return false;
      }
    })()
};

/* ================= REDUCER ================= */

const authReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };

    case 'LOGIN_SUCCESS': {
      const requiresVerification =
        action.payload.requiresVerification !== undefined
          ? Boolean(action.payload.requiresVerification)
          : Boolean(action.payload.user?.isVerified === false);

      // BUG-10 FIX: persist both access token AND refresh token so the
      // Axios interceptor can silently refresh on 401 instead of force-logout.
      localStorage.setItem('accessToken', action.payload.accessToken);
      localStorage.setItem('user', JSON.stringify(action.payload.user));
      localStorage.setItem('requiresVerification', String(requiresVerification));

      if (action.payload.refreshToken) {
        localStorage.setItem('refreshToken', action.payload.refreshToken);
      }

      return {
        ...state,
        user: action.payload.user,
        token: action.payload.accessToken,
        isAuthenticated: true,
        loading: false,
        requiresVerification
      };
    }

    case 'REQUIRES_VERIFICATION': {
      const pendingUser = action.payload?.user || null;
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.setItem('requiresVerification', 'true');

      if (pendingUser) {
        localStorage.setItem('user', JSON.stringify(pendingUser));
      }

      return {
        ...state,
        user: pendingUser,
        token: null,
        isAuthenticated: false,
        loading: false,
        requiresVerification: true
      };
    }

    case 'TOKEN_REFRESHED': {
      localStorage.setItem('accessToken', action.payload.accessToken);
      if (action.payload.refreshToken) {
        localStorage.setItem('refreshToken', action.payload.refreshToken);
      }
      return {
        ...state,
        token: action.payload.accessToken
      };
    }

    case 'LOGOUT':
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');   // BUG-10 FIX: clear on logout
      localStorage.removeItem('user');
      localStorage.removeItem('requiresVerification');

      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        loading: false,
        requiresVerification: false
      };

    case 'UPDATE_USER':
      localStorage.setItem(
        'user',
        JSON.stringify({ ...state.user, ...action.payload })
      );
      return {
        ...state,
        user: { ...state.user, ...action.payload }
      };

    default:
      return state;
  }
};

/* ================= PROVIDER ================= */

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  /* ===== Restore auth from localStorage on refresh ===== */
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const savedUser = localStorage.getItem('user');
    let parsedUser = null;

    if (savedUser) {
      try {
        parsedUser = JSON.parse(savedUser);
      } catch (error) {
        localStorage.removeItem('user');
      }
    }

    const requiresVerification =
      localStorage.getItem('requiresVerification') === 'true' ||
      Boolean(parsedUser && parsedUser.isVerified === false);

    if (token && parsedUser) {
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: {
          accessToken: token,
          user: parsedUser,
          requiresVerification
        }
      });
    } else if (requiresVerification && parsedUser) {
      dispatch({
        type: 'REQUIRES_VERIFICATION',
        payload: { user: parsedUser }
      });
    } else {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  /* ================= LOGIN ================= */

  const login = async (email, password) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });

      const response = await api.post('/auth/login', { email, password });
      const data = response.data.data;

      // BUG-05: If unverified, server returns no tokens — persist the pending
      // verification state so refresh/route guards keep the user on OTP flow.
      if (data.requiresVerification) {
        dispatch({
          type: 'REQUIRES_VERIFICATION',
          payload: { user: data.user }
        });
        return {
          success: true,
          requiresVerification: true,
          user: data.user
        };
      }

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: data
      });

      toast.success('Login successful!');
      return {
        success: true,
        requiresVerification: false,
        user: data.user
      };

    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      const message = error.response?.data?.message || 'Login failed';
      return { success: false, message };
    }
  };

  /* ================= REGISTER ================= */

  const register = async (userData) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });

      const response = await api.post('/auth/register', userData);

      dispatch({ type: 'SET_LOADING', payload: false });
      toast.success('Registration successful! Please verify your email.');

      return { success: true, data: response.data.data };

    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      const message = error.response?.data?.message || 'Registration failed';
      return { success: false, message };
    }
  };

  /* ================= VERIFY OTP ================= */

  const verifyOTP = async (email, otp) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });

      const response = await api.post('/auth/verify-otp', { email, otp });

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: response.data.data
      });

      toast.success('Account verified successfully!');
      return { success: true };

    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      const message = error.response?.data?.message || 'OTP verification failed';
      return { success: false, message };
    }
  };

  /* ================= RESEND OTP ================= */

  const resendOTP = async (email) => {
    try {
      await api.post('/auth/resend-otp', { email });
      toast.success('OTP sent successfully!');
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to resend OTP';
      return { success: false, message };
    }
  };

  /* ================= LOGOUT ================= */

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      dispatch({ type: 'LOGOUT' });
      toast.success('Logged out successfully');
    }
  };

  /* ================= CONTEXT VALUE ================= */

  const value = {
    ...state,
    login,
    register,
    verifyOTP,
    resendOTP,
    logout,
    updateUser: (data) =>
      dispatch({ type: 'UPDATE_USER', payload: data }),
    // Expose for the Axios interceptor so it can dispatch TOKEN_REFRESHED without importing AuthContext
    dispatchAuth: dispatch
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

/* ================= HOOK ================= */

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
