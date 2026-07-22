import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

export type Session = components['schemas']['SessionResponse'];
export type LoginInput = components['schemas']['LoginRequest'];
export type RegisterInput = components['schemas']['RegisterRequest'];
export type SetupInput = components['schemas']['SetupRequest'];
export type ApiErrorBody = components['schemas']['ErrorBody'];

export const api = createClient<paths>({
  baseUrl: '',
  credentials: 'include',
  headers: { accept: 'application/json' }
});

export function errorMessage(error: ApiErrorBody | undefined, fallback: string): string {
  return error?.message ?? fallback;
}
