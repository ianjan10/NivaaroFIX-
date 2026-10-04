import React, { createContext, useContext, useState, useRef, useCallback } from 'react';

const ToastNotificationContext = createContext();

export function ToastNotificationProvider({ children }) {
  const [toast, setToast] = useState({
    message: '',
    type: 'info', // 'info' | 'error' | 'success'
    visible: false
  });

  const timerRef = useRef(null);

  const showToast = useCallback((message, duration = 5000, type = 'info') => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setToast({
      message,
      type,
      visible: true
    });

    timerRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, duration);
  }, []);

  const hideToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setToast(prev => ({ ...prev, visible: false }));
  }, []);

  return (
    <ToastNotificationContext.Provider value={{ toast, showToast, hideToast }}>
      {children}
    </ToastNotificationContext.Provider>
  );
}

export function useToastNotification() {
  const context = useContext(ToastNotificationContext);
  if (!context) {
    throw new Error('useToastNotification must be used within a ToastNotificationProvider');
  }
  return context;
}
