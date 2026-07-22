import { browser } from '$app/environment';

export interface DomainEnvelope {
  id: string;
  schema_version: number;
  occurred_at: string;
  event: { type: string; data: unknown };
}

class RealtimeStore {
  connected = $state(false);
  latest = $state<DomainEnvelope | null>(null);
  private socket: WebSocket | null = null;
  private reconnect: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  start() {
    if (!browser || this.socket) {
      return;
    }
    this.stopped = false;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${location.host}/api/v1/realtime/ws`);
    this.socket.onopen = () => {
      this.connected = true;
    };
    this.socket.onmessage = (message) => {
      try {
        this.latest = JSON.parse(String(message.data)) as DomainEnvelope;
      } catch {
        this.latest = null;
      }
    };
    this.socket.onclose = () => {
      this.connected = false;
      this.socket = null;
      if (!this.stopped) {
        this.reconnect = setTimeout(() => this.start(), 1_500);
      }
    };
  }

  stop() {
    this.stopped = true;
    if (this.reconnect) {
      clearTimeout(this.reconnect);
    }
    this.socket?.close();
    this.socket = null;
    this.connected = false;
  }
}

export const realtime = new RealtimeStore();
