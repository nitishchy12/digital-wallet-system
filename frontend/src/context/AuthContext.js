/**
 * Auth Context - Simplified (Access Token Only)
 * Senior Approach: Simple, stable, works
 */

import React, { createContext, useContext, useReducer, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const AuthContext = createContext();

const initialState = {
  user: null,
  token: localStorage.getItem('accessToken'),
  isAuthenticated: false,
  loading: true,
  requiresVerification: false
};

const authReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    
    case 'LOGIN_SUCCESS':
      // Store access token only
      localStorage.setItem('accessToken', action.payload.accessToken);
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.accessToken,
        isAuthenticated: true,
        loading: false,
        requiresVerification: action.payload.requiresVerification || false
      };
    
    case 'LOGOUT':
      localStorage.removeItem('accessToken');
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        loading: false,
        requiresVerification: false
      };
    
    case 'UPDATE_USER':
      return {
        ...state,
        user: { ...state.user, ...action.payload }
      };
    
    case 'SET_VERIFICATION_REQUIRED':
      return {
        ...state,
        requiresVerification: action.payload
      };
    
    default:
      return state;
  }
};

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check if user is authenticated on app load
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('accessToken');
      
      if (token) {
        try {
          const response = await api.get('/user/profile');
          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: {
              user: response.data.data,
              accessToken: token,
              requiresVerification: !response.data.data.isVerified
            }
          });
        } catch (error) {
          console.error('Auth check failed:', error);
          dispatch({ type: 'LOGOUT' });
        }
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    checkAuth();
  }, []);

  const login = async (email, password) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      const response = await api.post('/auth/login', { email, password });
      
      if (response.data.success) {
        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: {
            user: response.data.data.user,
            accessToken: response.data.data.accessToken,
            requiresVerification: response.data.data.requiresVerification || false
          }
        });
        
        toast.success('Login successful!');
        return { success: true };
      }
      
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      const message = error.response?.data?.message || 'Login failed';
      
      // Handle specific error codes
      if (error.response?.data?.code === 'ACCOUNT_NOT_VERIFIED') {
        dispatch({ type: 'SET_VERIFICATION_REQUIRED', payload: true });
      }
      
      return { success: false, message };
    }
  };

  const register = async (userData) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      const response = await api.post('/auth/register', userData);
      
      dispatch({ type: 'SET_LOADING', payload: false });
      
      if (response.data.success) {
        toast.success('Registration successful! Please verify your email with OTP.');
        return { 
          success: true, 
          data: response.data.data 
        };
      }
      
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      const message = error.response?.data?.message || 'Registration failed';
      return { success: false, message };
    }
  };

  const verifyOTP = async (email, otp) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      const response = await api.post('/auth/verify-otp', { email, otp });
      
      if (response.data.success) {
        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: {
            user: response.data.data.user,
            accessToken: response.data.data.accessToken,
            requiresVerification: false
          }
        });
        
        toast.success('Account verified successfully! Wallet created.');
        return { success: true };
      }
      
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      const message = error.response?.data?.message || 'OTP verification failed';
      
      // Show remaining attempts if available
      if (error.response?.data?.remainingAttempts !== undefined) {
        toast.error(`${message} (${error.response.data.remainingAttempts} attempts remaining)`);
      }
      
      return { success: false, message };
    }
  };

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

  const updateUser = (userData) => {
    dispatch({ type: 'UPDATE_USER', payload: userData });
  };

  const value = {
    ...state,
    login,
    register,
    verifyOTP,
    resendOTP,
    logout,
    updateUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
