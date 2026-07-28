'use client';

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import { useSession } from './session-context';

export interface DomainEnvelope {
  event: {
    data: unknown;
    type: string;
  };
  event_id: string | null;
  id: string;
  occurred_at: string;
  schema_version: number;
}

interface RealtimeContextValue {
  isConnected: boolean;
  latest: DomainEnvelope | null;
  status: RealtimeStatus;
}

export type RealtimeStatus = 'disabled' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

interface RealtimeProviderProps {
  children: ReactNode;
}

function isDomainEnvelope(value: unknown): value is DomainEnvelope {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<DomainEnvelope>;

  return (
    (candidate.event_id === null || typeof candidate.event_id === 'string') &&
    typeof candidate.id === 'string' &&
    typeof candidate.occurred_at === 'string' &&
    typeof candidate.schema_version === 'number' &&
    typeof candidate.event?.type === 'string'
  );
}

export function RealtimeProvider({ children }: RealtimeProviderProps) {
  const { isAuthenticated } = useSession();
  const [latest, setLatest] = useState<DomainEnvelope | null>(null);
  const [status, setStatus] = useState<RealtimeStatus>(isAuthenticated ? 'connecting' : 'disabled');

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let stopped = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let keepaliveTimer: number | null = null;
    let reconnectAttempt = 0;
    let hasConnected = false;

    const clearSocketTimers = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      if (keepaliveTimer !== null) {
        window.clearInterval(keepaliveTimer);
        keepaliveTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (stopped || !navigator.onLine || reconnectTimer !== null) {
        return;
      }

      reconnectAttempt += 1;
      const delay = Math.min(1_000 * 2 ** Math.min(reconnectAttempt - 1, 4), 15_000);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    function connect() {
      if (stopped) {
        return;
      }

      if (!navigator.onLine) {
        setStatus('offline');
        return;
      }

      setStatus(hasConnected ? 'reconnecting' : 'connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/api/v1/realtime/ws`);

      socket.addEventListener('open', () => {
        hasConnected = true;
        reconnectAttempt = 0;
        setStatus('connected');
        keepaliveTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send('{"type":"keepalive"}');
          }
        }, 20_000);
      });

      socket.addEventListener('message', (message) => {
        try {
          const parsed: unknown = JSON.parse(String(message.data));

          if (isDomainEnvelope(parsed)) {
            setLatest(parsed);
          }
        } catch {
          // Ignore malformed transport messages without discarding stable state.
        }
      });

      socket.addEventListener('close', () => {
        if (keepaliveTimer !== null) {
          window.clearInterval(keepaliveTimer);
          keepaliveTimer = null;
        }

        socket = null;

        if (!stopped) {
          setStatus(navigator.onLine ? 'reconnecting' : 'offline');
          scheduleReconnect();
        }
      });

      socket.addEventListener('error', () => {
        socket?.close();
      });
    }

    const handleOffline = () => {
      clearSocketTimers();
      setStatus('offline');
      socket?.close();
    };

    const handleOnline = () => {
      clearSocketTimers();
      socket?.close();
      socket = null;
      connect();
    };

    connect();
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      stopped = true;
      clearSocketTimers();
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      socket?.close();
    };
  }, [isAuthenticated]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      isConnected: isAuthenticated && status === 'connected',
      latest: isAuthenticated ? latest : null,
      status: isAuthenticated ? status : 'disabled'
    }),
    [isAuthenticated, latest, status]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const value = useContext(RealtimeContext);

  if (!value) {
    throw new Error('useRealtime must be used within RealtimeProvider.');
  }

  return value;
}
