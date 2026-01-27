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
  requiresVerification: false
};

/* ================= REDUCER ================= */

const authReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };

    case 'LOGIN_SUCCESS':
      localStorage.setItem('accessToken', action.payload.accessToken);
      localStorage.setItem('user', JSON.stringify(action.payload.user));

      return {
        ...state,
        user: action.payload.user,
        token: action.payload.accessToken,
        isAuthenticated: true,
        loading: false,
        requiresVerification: false
      };

    case 'LOGOUT':
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');

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

    if (token && savedUser) {
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: {
          accessToken: token,
          user: JSON.parse(savedUser)
        }
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

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: response.data.data
      });

      toast.success('Login successful!');
      return { success: true };

    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      const message = error.response?.data?.message || 'Login failed';
      toast.error(message);
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
      toast.error(message);
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
      toast.error(message);
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
      toast.error(message);
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
      dispatch({ type: 'UPDATE_USER', payload: data })
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
