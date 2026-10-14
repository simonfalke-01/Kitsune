'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';

import { Alert, Button, Link } from '@/components/ui';
import { api, errorMessage } from '@/lib/api/client';
import { initialSubmissionState, submissionReducer } from '@/lib/auth/public-auth';

interface VerifyEmailProps {
  token: string;
}

export function VerifyEmail({ token }: VerifyEmailProps) {
  const [state, dispatch] = useReducer(submissionReducer, initialSubmissionState);
  const requestedToken = useRef<string | null>(null);

  const verify = useCallback(async () => {
    if (!token) {
      dispatch({
        message: 'The verification link is incomplete. Open the full link from your email.',
        type: 'fail'
      });
      return;
    }

    dispatch({ type: 'submit' });

    try {
      const result = await api.POST('/api/v1/auth/email/verify', {
        body: { token }
      });

      if (!result.response.ok) {
        dispatch({
          message: errorMessage(result.error, 'The verification link is invalid or expired.'),
          type: 'fail'
        });
        return;
      }

      dispatch({
        message: 'Your email address is verified.',
        type: 'succeed'
      });
    } catch {
      dispatch({
        message: 'Email verification failed. Check your connection and retry.',
        type: 'fail'
      });
    }
  }, [token]);

  useEffect(() => {
    if (requestedToken.current === token) {
      return;
    }

    requestedToken.current = token;
    void verify();
  }, [token, verify]);

  if (state.status === 'submitting' || state.status === 'idle') {
    return <Alert title="Verifying email" />;
  }

  if (state.status === 'succeeded') {
    return (
      <div className="grid gap-6">
        <Alert description={state.message} title="Email verified" tone="success" />
        <div>
          <Link href="/login">Sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <Alert title={state.message} tone="danger" />
      {token ? (
        <div>
          <Button
            onPress={() => {
              void verify();
            }}
            tone="secondary"
          >
            Retry verification
          </Button>
        </div>
      ) : null}
      <div>
        <Link href="/login">Return to sign in</Link>
      </div>
    </div>
  );
}
