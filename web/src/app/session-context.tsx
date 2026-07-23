'use client';

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

import {
  api,
  errorMessage,
  type LoginInput,
  type RegisterInput,
  type Session,
  type SetupInput
} from '@/lib/api/client';

interface SessionContextValue {
  can: (permission: string) => boolean;
  clearError: () => void;
  error: string | null;
  errorCode: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<boolean>;
  logout: () => Promise<boolean>;
  refresh: () => Promise<void>;
  register: (input: RegisterInput) => Promise<boolean>;
  session: Session | null;
  setup: (input: SetupInput) => Promise<boolean>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

interface SessionProviderProps {
  children: ReactNode;
  initialSession: Session | null;
}

export function SessionProvider({ children, initialSession }: SessionProviderProps) {
  const [session, setSession] = useState<Session | null>(initialSession);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
    setErrorCode(null);
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);

    try {
      const result = await api.GET('/api/v1/auth/session');

      if (result.data) {
        setSession(result.data);
        clearError();
      } else if (result.response.status === 401) {
        setSession(null);
        clearError();
      } else {
        setError(errorMessage(result.error, 'The session could not be refreshed.'));
      }
    } catch {
      setError('The session could not be refreshed. Check your connection and retry.');
    } finally {
      setIsLoading(false);
    }
  }, [clearError]);

  const login = useCallback(async (input: LoginInput) => {
    setIsLoading(true);
    setError(null);
    setErrorCode(null);

    try {
      const result = await api.POST('/api/v1/auth/login', {
        body: input
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'The credentials did not match.'));
        setErrorCode(result.error.code);
        return false;
      }

      setSession(result.data);
      return true;
    } catch {
      setError('Sign in failed. Check your connection and retry.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    setIsLoading(true);
    setError(null);
    setErrorCode(null);

    try {
      const result = await api.POST('/api/v1/auth/register', {
        body: input
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'The account could not be created.'));
        setErrorCode(result.error.code);
        return false;
      }

      setSession(result.data);
      return true;
    } catch {
      setError('The account could not be created. Check your connection and retry.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setup = useCallback(async (input: SetupInput) => {
    setIsLoading(true);
    setError(null);
    setErrorCode(null);

    try {
      const result = await api.POST('/api/v1/setup', {
        body: input
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'Setup could not be completed.'));
        return false;
      }

      setSession(result.data);
      return true;
    } catch {
      setError('Setup could not be completed. Check your connection and retry.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    const csrfToken = session?.csrf_token;

    if (!csrfToken) {
      setSession(null);
      return true;
    }

    try {
      const result = await api.POST('/api/v1/auth/logout', {
        headers: {
          'x-csrf-token': csrfToken
        }
      });

      if (!result.response.ok) {
        setError(errorMessage(result.error, 'Sign out failed.'));
        return false;
      }

      setSession(null);
      return true;
    } catch {
      setError('Sign out failed. Check your connection and retry.');
      return false;
    }
  }, [session]);

  const can = useCallback(
    (permission: string) => {
      return session?.permissions.includes(permission) ?? false;
    },
    [session]
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      can,
      clearError,
      error,
      errorCode,
      isAuthenticated: session !== null,
      isLoading,
      login,
      logout,
      refresh,
      register,
      session,
      setup
    }),
    [can, clearError, error, errorCode, isLoading, login, logout, refresh, register, session, setup]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);

  if (!value) {
    throw new Error('useSession must be used within SessionProvider.');
  }

  return value;
}
