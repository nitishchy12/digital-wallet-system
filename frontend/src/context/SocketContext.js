import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";
import toast from "react-hot-toast";

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const socketRef = useRef(null); // 🔒 prevents re-creation
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user?._id) return;

    // 🚫 If socket already exists, DO NOTHING
    if (socketRef.current) return;

    const socket = io(
      process.env.REACT_APP_SERVER_URL || "http://localhost:5000",
      {
        transports: ["websocket"],
        reconnection: true,
      }
    );

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("✅ Socket connected:", socket.id);
      setIsConnected(true);
      socket.emit("join-user-room", user._id);
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected");
      setIsConnected(false);
    });

    socket.on("transaction-update", (data) => {
      if (data?.transaction?.amount) {
        toast.success(`₹${data.transaction.amount} transaction update`);
      }

      window.dispatchEvent(
        new CustomEvent("walletUpdate", {
          detail: {
            newBalance: data.newBalance,
            transaction: data.transaction,
          },
        })
      );
    });

    return () => {
      console.log("🔌 Cleaning socket");
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [isAuthenticated, user?._id]);

  const value = {
    socket: socketRef.current,
    isConnected,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error("useSocket must be used inside SocketProvider");
  }
  return ctx;
};
