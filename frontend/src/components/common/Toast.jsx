import React, { createContext, useContext, useState } from 'react';

const ToastContext = createContext();

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);

    setTimeout(() => {
      removeToast(id);
    }, 4000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}

      {/* Toast UI */}
      <div
        className="toast-container"
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              padding: '16px 20px',
              borderRadius: '12px',
              color: 'white',
              fontWeight: '500',
              fontSize: '14px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
              minWidth: '300px',
              animation: 'slideIn 0.3s ease-out',
              background:
                toast.type === 'success'
                  ? '#10b981'
                  : toast.type === 'error'
                  ? '#ef4444'
                  : toast.type === 'loading'
                  ? '#3b82f6'
                  : '#10b981'
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Animation */}
      <style>
        {`
          @keyframes slideIn {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}
      </style>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }

  return context;
};