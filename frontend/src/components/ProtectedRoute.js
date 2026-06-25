import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';

const ProtectedRoute = ({ children, adminOnly = false }) => {
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

  if (adminOnly && user?.role !== 'admin') {
    // Backend enforces this on every admin endpoint regardless — this is
    // just UX, not the actual security boundary.
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default ProtectedRoute;
