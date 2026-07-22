import { browser } from '$app/environment';
import { api, errorMessage, type LoginInput, type Session, type SetupInput } from '$lib/api/client';

class SessionStore {
  current = $state<Session | null>(null);
  loading = $state(true);
  error = $state<string | null>(null);

  get authenticated(): boolean {
    return this.current !== null;
  }

  can(permission: string): boolean {
    return this.current?.permissions.includes(permission) ?? false;
  }

  async bootstrap(): Promise<void> {
    if (!browser) return;
    this.loading = true;
    const { data, error, response } = await api.GET('/api/v1/auth/session');
    if (data) {
      this.current = data;
      this.error = null;
    } else if (response.status === 401) {
      this.current = null;
      this.error = null;
    } else {
      this.error = errorMessage(error, 'Kitsune could not restore your session.');
    }
    this.loading = false;
  }

  async login(input: LoginInput): Promise<boolean> {
    this.loading = true;
    this.error = null;
    const { data, error } = await api.POST('/api/v1/auth/login', { body: input });
    this.loading = false;
    if (!data) {
      this.error = errorMessage(error, 'The credentials did not match.');
      return false;
    }
    this.current = data;
    return true;
  }

  async setup(input: SetupInput): Promise<boolean> {
    this.loading = true;
    this.error = null;
    const { data, error } = await api.POST('/api/v1/setup', { body: input });
    this.loading = false;
    if (!data) {
      this.error = errorMessage(error, 'Setup could not be completed.');
      return false;
    }
    this.current = data;
    return true;
  }

  async logout(): Promise<void> {
    const csrf = this.current?.csrf_token;
    if (!csrf) return;
    await api.POST('/api/v1/auth/logout', {
      headers: { 'x-csrf-token': csrf }
    });
    this.current = null;
  }
}

export const session = new SessionStore();
