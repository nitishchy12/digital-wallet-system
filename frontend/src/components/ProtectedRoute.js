import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading, requiresVerification, user } = useAuth();
  const location = useLocation();
  const needsVerification = requiresVerification || user?.isVerified === false;

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    // Redirect to signin page with return url
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  if (needsVerification) {
    // Redirect to OTP verification if account is not verified
    return <Navigate to="/verify-otp" state={{ email: user?.email }} replace />;
  }

  return children;
};

export default ProtectedRoute;
