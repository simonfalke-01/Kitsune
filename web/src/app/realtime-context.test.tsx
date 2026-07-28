import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RealtimeProvider, useRealtime } from './realtime-context';

vi.mock('./session-context', () => ({
  useSession: () => ({
    isAuthenticated: true
  })
}));

type SocketListener = (event: { data?: string }) => void;

class TestWebSocket {
  static OPEN = 1;
  static instances: TestWebSocket[] = [];

  readonly listeners = new Map<string, SocketListener[]>();
  readyState = 0;

  constructor(readonly url: string) {
    TestWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: SocketListener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  close() {
    this.readyState = 3;
  }

  send() {}

  emit(type: string, event: { data?: string } = {}) {
    if (type === 'open') {
      this.readyState = TestWebSocket.OPEN;
    }

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function RealtimeProbe() {
  const { latest, status } = useRealtime();
  return (
    <div>
      <span>{status}</span>
      <span>{latest?.event.type ?? 'no event'}</span>
    </div>
  );
}

beforeEach(() => {
  TestWebSocket.instances = [];
  vi.stubGlobal('WebSocket', TestWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RealtimeProvider', () => {
  it('keeps the last valid event while reconnecting after malformed traffic', () => {
    render(
      <RealtimeProvider>
        <RealtimeProbe />
      </RealtimeProvider>
    );

    const socket = TestWebSocket.instances[0];
    expect(socket).toBeDefined();
    expect(screen.getByText('connecting')).toBeVisible();

    act(() => {
      socket?.emit('open');
      socket?.emit('message', {
        data: JSON.stringify({
          event: { data: {}, type: 'challenge_changed' },
          event_id: 'event',
          id: 'envelope',
          occurred_at: '2026-07-28T04:00:00Z',
          schema_version: 1
        })
      });
      socket?.emit('message', { data: '{not-json' });
    });

    expect(screen.getByText('connected')).toBeVisible();
    expect(screen.getByText('challenge_changed')).toBeVisible();

    act(() => {
      socket?.emit('close');
    });

    expect(screen.getByText('reconnecting')).toBeVisible();
    expect(screen.getByText('challenge_changed')).toBeVisible();
  });
});
