import { useEffect, useRef, useState, useCallback } from 'react';

export function usePollWebSocket(pollId, onVoteUpdate) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const retryCountRef = useRef(0);
  const maxRetries = 5;

  const getWsUrl = useCallback(() => {
    if (import.meta.env.VITE_WS_URL) {
      let base = import.meta.env.VITE_WS_URL.trim();
      if (base.startsWith('https://')) {
        base = base.replace('https://', 'wss://');
      } else if (base.startsWith('http://')) {
        base = base.replace('http://', 'ws://');
      }
      base = base.replace(/\/+$/, '');
      return `${base}/ws/polls/${pollId}`;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // When using dev proxy or standard host
    const host = window.location.host;
    return `${protocol}//${host}/ws/polls/${pollId}`;
  }, [pollId]);

  useEffect(() => {
    if (!pollId) return;

    let isMounted = true;

    function connect() {
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return;
      }

      const url = getWsUrl();
      console.log(`[WebSocket] Connecting to: ${url}`);
      const socket = new WebSocket(url);
      wsRef.current = socket;

      socket.onopen = () => {
        if (!isMounted) return;
        console.log(`[WebSocket] Connected to poll ${pollId}`);
        setIsConnected(true);
        setConnectionError(null);
        retryCountRef.current = 0;
      };

      socket.onmessage = (event) => {
        if (!isMounted) return;
        try {
          // In case messages are split by newline
          const lines = event.data.split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            const payload = JSON.parse(line);
            console.log('[WebSocket] Received live update:', payload);
            if (payload.type === 'poll_update' && onVoteUpdate) {
              onVoteUpdate(payload);
            }
          }
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err);
        }
      };

      socket.onerror = (err) => {
        if (!isMounted) return;
        console.warn('[WebSocket] Error occurred:', err);
        setConnectionError('WebSocket connection error');
      };

      socket.onclose = (event) => {
        if (!isMounted) return;
        setIsConnected(false);
        console.log(`[WebSocket] Closed (code: ${event.code})`);

        // Reconnect with backoff if component is still mounted and retries < maxRetries
        if (retryCountRef.current < maxRetries) {
          const timeout = Math.min(1000 * Math.pow(2, retryCountRef.current), 10000);
          retryCountRef.current += 1;
          console.log(`[WebSocket] Reconnecting in ${timeout}ms (attempt ${retryCountRef.current})...`);
          reconnectTimeoutRef.current = setTimeout(connect, timeout);
        } else {
          setConnectionError('Unable to sustain live connection. Please refresh.');
        }
      };
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [pollId, getWsUrl, onVoteUpdate]);

  return { isConnected, connectionError };
}
