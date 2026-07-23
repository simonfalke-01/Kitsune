import { api, errorMessage, type AuditEntry, type AuditQuery } from '$lib/api/client';
import { session } from '$lib/stores/session.svelte';

export type AuditFilters = Pick<
  AuditQuery,
  'event_id' | 'actor_id' | 'action' | 'resource_type' | 'occurred_after' | 'occurred_before'
>;

const PAGE_SIZE = 50;

class AuditStore {
  entries = $state<AuditEntry[]>([]);
  nextCursor = $state<string | null>(null);
  loading = $state(false);
  loadingMore = $state(false);
  error = $state<string | null>(null);
  private filters: AuditFilters = {};
  private request = 0;

  async load(filters: AuditFilters = {}): Promise<void> {
    await session.bootstrap();
    if (!session.can('audit_read')) {
      this.error = 'Your role does not include audit history access.';
      return;
    }
    const request = ++this.request;
    this.loading = true;
    this.error = null;
    this.filters = compactFilters(filters);
    const { data, error } = await api.GET('/api/v1/audit', {
      params: { query: { limit: PAGE_SIZE, ...this.filters } }
    });
    if (request !== this.request) {
      return;
    }
    this.loading = false;
    if (!data) {
      this.entries = [];
      this.nextCursor = null;
      this.error = errorMessage(error, 'The audit trail could not be loaded.');
      return;
    }
    this.entries = data.entries;
    this.nextCursor = data.next_cursor ?? null;
  }

  async loadMore(): Promise<void> {
    const cursor = this.nextCursor;
    if (!cursor || this.loadingMore) {
      return;
    }
    this.loadingMore = true;
    this.error = null;
    const { data, error } = await api.GET('/api/v1/audit', {
      params: {
        query: {
          limit: PAGE_SIZE,
          cursor,
          ...this.filters
        }
      }
    });
    this.loadingMore = false;
    if (!data) {
      this.error = errorMessage(error, 'More audit history could not be loaded.');
      return;
    }
    const existing = new Set(this.entries.map((entry) => entry.id));
    this.entries = this.entries.concat(data.entries.filter((entry) => !existing.has(entry.id)));
    this.nextCursor = data.next_cursor ?? null;
  }
}

function compactFilters(filters: AuditFilters): AuditFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== '')
  ) as AuditFilters;
}

export const audit = new AuditStore();
