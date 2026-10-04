import React, { StrictMode, Component } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/dashboardDesignSystem.css';
import App from './App.jsx';

console.log('🚀 main.jsx executing...');

// Purge any stale/legacy test and dummy mock sessions from localStorage
try {
  const userStr = localStorage.getItem('nivaaro-user');
  if (userStr && (userStr.includes('Anjan') || userStr.includes('anjansingh100@gmail.com') || userStr.includes('dummy') || userStr.includes('qa_'))) {
    localStorage.removeItem('nivaaro-user');
  }
  const agentStr = localStorage.getItem('nivaaro-agent');
  if (agentStr && (agentStr.includes('Suresh') || agentStr.includes('FIX-PRO-8894') || agentStr.includes('dummy') || agentStr.includes('qa_'))) {
    localStorage.removeItem('nivaaro-agent');
  }
} catch (e) {}

// Global unhandled error logger & fallback
window.addEventListener('error', (event) => {
  console.error('🔥 Window unhandled error caught:', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('🔥 Window unhandled promise rejection caught:', event.reason);
});

// Robust React Error Boundary
class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('❌ Error caught by GlobalErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F7F5F1',
          padding: '2rem',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            maxWidth: '640px',
            width: '100%',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '2.5rem',
            boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
            border: '1px solid #E5E7EB',
            textAlign: 'center'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#FEF2F2',
              color: '#DC2626',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1.25rem'
            }}>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#111827', margin: '0 0 0.5rem 0' }}>
              Something went wrong loading NivaaroFix
            </h2>
            <p style={{ color: '#6B7280', fontSize: '0.95rem', margin: '0 0 1.5rem 0' }}>
              {this.state.error?.message || 'An unexpected runtime error occurred.'}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem('nivaaro-city');
                    localStorage.removeItem('nivaarofix_booking_intent');
                  } catch (e) {}
                  window.location.reload();
                }}
                style={{
                  backgroundColor: '#0F4D3C',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.75rem 1.5rem',
                  fontSize: '0.95rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Clear Cache & Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Element with id="root" not found in document!');
  }
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <GlobalErrorBoundary>
        <App />
      </GlobalErrorBoundary>
    </StrictMode>
  );
  console.log('✅ React root.render called successfully.');
} catch (err) {
  console.error('❌ Fatal error mounting React application:', err);
  const rootEl = document.getElementById('root') || document.body;
  rootEl.innerHTML = `
    <div style="padding: 2rem; max-width: 700px; margin: 2rem auto; font-family: sans-serif; background: #fff; border: 2px solid #ef4444; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      <h2 style="color: #b91c1c; margin-top: 0;">Fatal Application Startup Error</h2>
      <p style="color: #374151;">${err.message}</p>
      <pre style="background: #fef2f2; color: #991b1b; padding: 1rem; border-radius: 8px; font-size: 0.85rem; overflow-x: auto;">${err.stack || err}</pre>
    </div>
  `;
}
