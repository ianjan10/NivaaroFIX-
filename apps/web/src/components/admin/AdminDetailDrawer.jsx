import React, { useEffect, useRef } from 'react';

/**
 * Shared Admin Detail Drawer (480px right-side drawer)
 * Traps focus, closes on ESC or backdrop click, restores focus to trigger element.
 */
export default function AdminDetailDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  triggerRef
}) {
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousActiveElement = document.activeElement;

    // Handle ESC key
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Trap focus inside drawer
      if (e.key === 'Tab' && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Initial focus on close button or first focusable
    const timer = setTimeout(() => {
      if (drawerRef.current) {
        const firstBtn = drawerRef.current.querySelector('button');
        firstBtn?.focus();
      }
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
      if (triggerRef?.current) {
        triggerRef.current.focus();
      } else if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        previousActiveElement.focus();
      }
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  return (
    <div className="admin-drawer-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="admin-drawer-panel"
        ref={drawerRef}
        onClick={(e) => e.stopPropagation()}
        style={{ width: '480px', maxWidth: '100vw' }}
      >
        <div className="admin-drawer-header">
          <div>
            <h2 className="admin-drawer-title">{title}</h2>
            {subtitle && <p className="admin-drawer-subtitle">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="admin-drawer-close"
            onClick={onClose}
            aria-label="Close drawer (ESC)"
          >
            ×
          </button>
        </div>

        <div className="admin-drawer-content">
          {children}
        </div>
      </div>
    </div>
  );
}

