import { io } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const socket = io(BACKEND_URL, {
  autoConnect: false,
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

// Track current user/role so we can re-join on reconnect
let _currentUserId  = null;
let _currentRole    = null;
let _currentVendorId = null;

// Re-join rooms whenever socket (re)connects — fixes the race condition where
// the server emits an event before the client has joined its room.
socket.on('connect', () => {
  if (_currentUserId) {
    socket.emit('join', _currentUserId);
    if (_currentRole === 'vendor' && _currentVendorId) {
      socket.emit('joinVendor', _currentVendorId);
      socket.emit('joinVendorDelivery', _currentVendorId);
    }
    if (_currentRole === 'admin') {
      socket.emit('joinAdmin');
    }
    console.log('📡 Socket (re)connected — rooms re-joined for', _currentRole, _currentUserId);
  }
});

// Export default socket instance
export default socket;

// Helper functions for common operations
export const connectSocket = (userId, role, vendorId = null) => {
  // Store so we can re-join on reconnect
  _currentUserId   = userId;
  _currentRole     = role;
  _currentVendorId = vendorId;

  if (!socket.connected) {
    socket.connect(); // 'connect' event above will handle room joins
  } else {
    // Already connected — join immediately
    socket.emit('join', userId);
    if (role === 'vendor' && vendorId) {
      socket.emit('joinVendor', vendorId);
      socket.emit('joinVendorDelivery', vendorId);
    }
    if (role === 'admin') socket.emit('joinAdmin');
  }

  console.log('📡 Socket connect requested for', role, 'userId:', userId);
};

export const disconnectSocket = () => {
  if (socket.connected) {
    socket.disconnect();
  }
  console.log('📡 Socket disconnected');
};

// Listen to a specific event
export const onEvent = (event, callback) => {
  socket.on(event, callback);
};

// Remove listener from a specific event
export const offEvent = (event, callback) => {
  socket.off(event, callback);
};

// Remove all listeners
export const removeAllListeners = () => {
  socket.removeAllListeners();
};
