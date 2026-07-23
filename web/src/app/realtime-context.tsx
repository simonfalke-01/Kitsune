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
}

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
  const [isConnected, setIsConnected] = useState(false);
  const [latest, setLatest] = useState<DomainEnvelope | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let stopped = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/api/v1/realtime/ws`);

      socket.addEventListener('open', () => {
        setIsConnected(true);
      });

      socket.addEventListener('message', (message) => {
        try {
          const parsed: unknown = JSON.parse(String(message.data));

          if (isDomainEnvelope(parsed)) {
            setLatest(parsed);
          }
        } catch {
          setLatest(null);
        }
      });

      socket.addEventListener('close', () => {
        setIsConnected(false);
        socket = null;

        if (!stopped) {
          reconnectTimer = window.setTimeout(connect, 1500);
        }
      });
    };

    connect();

    return () => {
      stopped = true;

      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }

      socket?.close();
    };
  }, [isAuthenticated]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      isConnected: isAuthenticated && isConnected,
      latest: isAuthenticated ? latest : null
    }),
    [isAuthenticated, isConnected, latest]
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
