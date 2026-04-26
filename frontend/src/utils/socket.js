import { io } from 'socket.io-client';

const SOCKET_URL =
  process.env.REACT_APP_SERVER_URL || window.location.origin;

export const socket = io(SOCKET_URL, {
  transports: ['websocket'],
  autoConnect: false,
  withCredentials: true,
});






