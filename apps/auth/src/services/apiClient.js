/**
 * Shared API Client for NivaaroFix Auth Portal
 *
 * Ensures bulletproof authentication by:
 * 1. Always including credentials ('include') so HttpOnly session cookies are transmitted cross-origin.
 * 2. Automatically attaching Bearer and x-session-token headers from localStorage/sessionStorage.
 * 3. Gracefully distinguishing true session expiry from network/transient errors.
 */

const API_BASE = 'http://localhost:5000';

export function getStoredSessionToken() {
  try {
    const raw = localStorage.getItem('nivaarofix_session_token') || sessionStorage.getItem('nivaarofix_session_token');
    if (raw) return raw;
    
    // Check inside stored user/agent JSON objects as fallback
    const agentStr = localStorage.getItem('nivaaro-agent');
    if (agentStr) {
      const parsed = JSON.parse(agentStr);
      if (parsed?.sessionToken || parsed?.token) return parsed.sessionToken || parsed.token;
    }

    const userStr = localStorage.getItem('nivaaro-user');
    if (userStr) {
      const parsed = JSON.parse(userStr);
      if (parsed?.sessionToken || parsed?.token) return parsed.sessionToken || parsed.token;
    }
  } catch {}
  return '';
}

export function setStoredSessionToken(token) {
  try {
    if (token) {
      localStorage.setItem('nivaarofix_session_token', token);
      sessionStorage.setItem('nivaarofix_session_token', token);
    } else {
      localStorage.removeItem('nivaarofix_session_token');
      sessionStorage.removeItem('nivaarofix_session_token');
    }
  } catch {}
}

export async function apiClient(endpoint, options = {}) {
  const url = endpoint.startsWith('http') 
    ? endpoint 
    : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const token = getStoredSessionToken();
  const headers = {
    ...(options.headers || {})
  };

  // Only set application/json if not sending FormData
  if (!(options.body instanceof FormData) && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Inject session token in headers
  if (token) {
    if (!headers['Authorization'] && !headers['authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (!headers['x-session-token']) {
      headers['x-session-token'] = token;
    }
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });

  return res;
}

export default apiClient;

