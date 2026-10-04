import React from 'react';
import { useToastNotification } from '../context/ToastNotificationContext';

export default function ToastNotification() {
  const { toast } = useToastNotification();

  return (
    <div
      className={`premium-toast ${toast.visible ? 'show' : ''} ${toast.type}`}
      role="status"
      aria-live="polite"
    >
      <div className="toast-indicator-dot" />
      <span className="toast-message">{toast.message}</span>
    </div>
  );
}
