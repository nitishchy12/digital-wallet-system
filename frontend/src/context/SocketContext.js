import React, { createContext, useContext, useEffect, useState } from 'react';
import { socket } from '../utils/socket';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated && user) {
      if (!socket.connected) {
        socket.connect();
      }

      const handleConnect = () => {
        console.log('✅ Socket connected:', socket.id);
        setIsConnected(true);
        socket.emit('join-user-room', user._id);
      };

      const handleDisconnect = (reason) => {
        console.log('❌ Socket disconnected:', reason);
        setIsConnected(false);
      };

      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);

      // Listen for transaction updates
      socket.on('transaction-update', (data) => {
        console.log('📱 Transaction update received:', data);

        switch (data.type) {
          case 'MONEY_RECEIVED':
            toast.success(
              `💰 ₹${data.transaction.amount.toLocaleString('en-IN')} received!`,
              {
                duration: 5000,
                icon: '💰'
              }
            );
            break;

          case 'MONEY_ADDED':
            toast.success(
              `✅ ₹${data.transaction.amount.toLocaleString('en-IN')} added to wallet!`,
              {
                duration: 4000,
                icon: '✅'
              }
            );
            break;

          case 'TRANSFER_SENT':
            toast.success(
              `📤 ₹${data.transaction.amount.toLocaleString('en-IN')} sent successfully!`,
              {
                duration: 4000,
                icon: '📤'
              }
            );
            break;

          default:
            toast.success('Transaction completed!');
        }

        // Trigger custom event for components to listen
        window.dispatchEvent(new CustomEvent('walletUpdate', {
          detail: {
            newBalance: data.newBalance,
            transaction: data.transaction
          }
        }));
      });

      // Listen for payment notifications
      socket.on('payment-notification', (data) => {
        console.log('💳 Payment notification:', data);

        if (data.type === 'payment-success') {
          toast.success('Payment successful!', {
            duration: 4000,
            icon: '💳'
          });
        } else if (data.type === 'payment-failed') {
          toast.error('Payment failed. Please try again.', {
            duration: 5000,
            icon: '❌'
          });
        }
      });

      // Listen for security alerts
      socket.on('security-alert', (data) => {
        console.log('🔒 Security alert:', data);

        toast.error(data.message, {
          duration: 8000,
          icon: '🔒'
        });
      });

      return () => {
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        socket.off('transaction-update');
        socket.off('payment-notification');
        socket.off('security-alert');
      };
    }
  }, [isAuthenticated, user]);

  // Emit events
  const emitEvent = (eventName, data) => {
    if (socket && isConnected) {
      socket.emit(eventName, data);
    } else {
      console.warn('Socket not connected. Cannot emit event:', eventName);
    }
  };

  const value = {
    socket,
    isConnected,
    emitEvent,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
