'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useSession } from '../../session-context';
import { Alert, Button, CodeBlock, Form, TextField, showToast } from '@/components/ui';
import { api, errorMessage, type TotpEnrollment } from '@/lib/api/client';

const totpSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/u, 'Enter the current six-digit code.')
});

type TotpValues = z.infer<typeof totpSchema>;

export function MfaPanel() {
  const { session } = useSession();
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'confirm' | 'start' | null>(null);
  const {
    clearErrors,
    control,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors }
  } = useForm<TotpValues>({
    defaultValues: {
      code: ''
    }
  });

  const start = async () => {
    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    setPendingAction('start');
    setError(null);

    try {
      const result = await api.POST('/api/v1/auth/mfa/totp/start', {
        headers: {
          'x-csrf-token': session.csrf_token
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'Authenticator setup could not start.'));
        return;
      }

      setEnrollment(result.data);
      setRecoveryCodes(null);
    } catch {
      setError('Authenticator setup could not start. Check your connection and retry.');
    } finally {
      setPendingAction(null);
    }
  };

  const submit = handleSubmit(async (values) => {
    clearErrors();
    setError(null);
    const parsed = totpSchema.safeParse(values);

    if (!parsed.success) {
      setFieldError('code', {
        message: parsed.error.issues[0]?.message
      });
      return;
    }

    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    setPendingAction('confirm');

    try {
      const result = await api.POST('/api/v1/auth/mfa/totp/confirm', {
        body: {
          code: parsed.data.code
        },
        headers: {
          'x-csrf-token': session.csrf_token
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'The authenticator code was not accepted.'));
        return;
      }

      setRecoveryCodes(result.data.codes);
      setEnrollment(null);
      reset();
      showToast({
        title: 'Authenticator enabled',
        tone: 'success'
      });
    } catch {
      setError('Authenticator setup could not be completed. Check your connection and retry.');
    } finally {
      setPendingAction(null);
    }
  });

  return (
    <section aria-busy={pendingAction !== null} className="grid gap-4" aria-labelledby="mfa-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2
          className="m-0 font-display text-xl font-semibold tracking-tight text-text"
          id="mfa-title"
        >
          Authenticator
        </h2>
        <Button
          isLoading={pendingAction === 'start'}
          onPress={() => {
            void start();
          }}
          size="small"
          tone="secondary"
        >
          Start setup
        </Button>
      </div>

      {error ? <Alert title={error} tone="danger" /> : null}

      {enrollment ? (
        <div className="grid gap-4 rounded-lg border border-border-subtle bg-surface-raised p-4">
          <Alert
            description="Starting a new setup replaces the active authenticator after confirmation."
            title="Add the secret to your authenticator"
            tone="info"
          />
          <CodeBlock code={enrollment.secret} label="Authenticator secret" />
          <CodeBlock code={enrollment.provisioning_uri} label="Provisioning URI" />
          <Form
            onSubmit={(event) => {
              void submit(event);
            }}
            validationBehavior="aria"
          >
            <Controller
              control={control}
              name="code"
              render={({ field }) => (
                <TextField
                  autoComplete="one-time-code"
                  errorMessage={errors.code?.message}
                  inputMode="numeric"
                  isInvalid={Boolean(errors.code)}
                  label="Authenticator code"
                  maxLength={6}
                  name={field.name}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  value={field.value}
                />
              )}
            />
            <Button isLoading={pendingAction === 'confirm'} type="submit">
              Confirm authenticator
            </Button>
          </Form>
        </div>
      ) : null}

      {recoveryCodes ? (
        <div className="grid gap-3">
          <Alert
            description="Store these single-use codes now. They cannot be retrieved later."
            title="Recovery codes ready"
            tone="success"
          />
          <CodeBlock code={recoveryCodes.join('\n')} label="Recovery codes" />
        </div>
      ) : null}
    </section>
  );
}
