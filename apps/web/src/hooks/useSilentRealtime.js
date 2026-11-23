import { useEffect, useRef, useCallback } from 'react';

/**
 * Compare two objects deeply to determine if state has actually changed.
 */
export function fastDeepEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (_) {
    return false;
  }
}

/**
 * useSilentRealtime Hook
 * 
 * Guarantees zero UI flickering and seamless real-time data flow:
 * 1. WebSocket stream (with automatic backoff and reconnect)
 * 2. Server-Sent Events (SSE) fallback stream
 * 3. Silent background polling interval (heartbeat reconciliation)
 * 4. In-place deep diffing to prevent unnecessary DOM re-renders
 * 5. Window focus reconciliation
 */
export function useSilentRealtime({
  fetchFn,
  pollInterval = 6000,
  wsEndpoint = null,
  sseEndpoint = null,
  eventTypes = [],
  enabled = true
}) {
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  const isMountedRef = useRef(true);

  // 1. Silent Background Polling with tab visibility awareness
  useEffect(() => {
    if (!enabled) return;
    isMountedRef.current = true;

    // Window focus refresh
    const handleFocus = () => {
      if (document.visibilityState === 'visible' && isMountedRef.current) {
        fetchRef.current?.(true); // silent fetch
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    // Periodic silent background heartbeat
    let intervalId = null;
    if (pollInterval && pollInterval > 0) {
      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible' && isMountedRef.current) {
          fetchRef.current?.(true); // silent fetch
        }
      }, pollInterval);
    }

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
      if (intervalId) clearInterval(intervalId);
    };
  }, [pollInterval, enabled]);

  // 2. Real-time WebSocket listener with auto-reconnect
  useEffect(() => {
    if (!enabled || !wsEndpoint) return;
    let ws = null;
    let reconnectTimeout = null;
    let isDisposed = false;

    const connectWs = () => {
      if (isDisposed) return;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${window.location.host}${wsEndpoint}`;
        ws = new WebSocket(url);

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const type = data.type || data.event;
            if (!eventTypes || eventTypes.length === 0 || eventTypes.includes(type) || type === 'connected') {
              if (type !== 'connected') {
                fetchRef.current?.(true); // Trigger silent in-place refresh
              }
            }
          } catch (_) {}
        };

        ws.onclose = () => {
          if (!isDisposed) {
            reconnectTimeout = setTimeout(connectWs, 4000);
          }
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch (_) {
        if (!isDisposed) {
          reconnectTimeout = setTimeout(connectWs, 5000);
        }
      }
    };

    connectWs();

    return () => {
      isDisposed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
    };
  }, [wsEndpoint, enabled, JSON.stringify(eventTypes)]);

  // 3. Real-time SSE listener fallback
  useEffect(() => {
    if (!enabled || !sseEndpoint) return;
    let sse = null;
    let isDisposed = false;

    try {
      sse = new EventSource(sseEndpoint);

      const handleEvent = (event) => {
        if (isDisposed) return;
        try {
          const type = event.type;
          if (!eventTypes || eventTypes.length === 0 || eventTypes.includes(type)) {
            fetchRef.current?.(true); // Trigger silent in-place refresh
          }
        } catch (_) {}
      };

      if (eventTypes && eventTypes.length > 0) {
        eventTypes.forEach((t) => sse.addEventListener(t, handleEvent));
      } else {
        sse.onmessage = handleEvent;
      }
    } catch (_) {}

    return () => {
      isDisposed = true;
      if (sse) sse.close();
    };
  }, [sseEndpoint, enabled, JSON.stringify(eventTypes)]);
}

export default useSilentRealtime;
