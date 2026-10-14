'use client';

import { useReducer } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, Button, Form, Link, PasswordField, TextField } from '@/components/ui';
import { api, errorMessage } from '@/lib/api/client';
import { initialSubmissionState, submissionReducer } from '@/lib/auth/public-auth';

const recoveryStartSchema = z.object({
  email: z.email('Enter a valid email address.'),
  organization: z.string().trim().min(1, 'Enter your organization.')
});

const recoveryCompleteSchema = z
  .object({
    password: z
      .string()
      .min(12, 'Use at least 12 characters.')
      .max(128, 'Use no more than 128 characters.'),
    password_confirmation: z.string()
  })
  .refine((values) => values.password === values.password_confirmation, {
    message: 'Passwords do not match.',
    path: ['password_confirmation']
  });

type RecoveryStartValues = z.infer<typeof recoveryStartSchema>;
type RecoveryCompleteValues = z.infer<typeof recoveryCompleteSchema>;

interface RecoveryFormProps {
  initialOrganization: string;
  token: string;
}

function RecoveryStartForm({
  initialOrganization
}: Pick<RecoveryFormProps, 'initialOrganization'>) {
  const [state, dispatch] = useReducer(submissionReducer, initialSubmissionState);
  const {
    clearErrors,
    control,
    handleSubmit,
    setError,
    formState: { errors }
  } = useForm<RecoveryStartValues>({
    defaultValues: {
      email: '',
      organization: initialOrganization
    }
  });

  const submit = handleSubmit(async (values) => {
    dispatch({ type: 'reset' });
    clearErrors();
    const parsed = recoveryStartSchema.safeParse(values);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const fieldName = issue.path[0];

        if (fieldName === 'email' || fieldName === 'organization') {
          setError(fieldName, { message: issue.message });
        }
      }

      return;
    }

    dispatch({ type: 'submit' });

    try {
      const result = await api.POST('/api/v1/auth/recovery', {
        body: {
          email: parsed.data.email.trim(),
          organization: parsed.data.organization.trim()
        }
      });

      if (!result.response.ok) {
        dispatch({
          message: errorMessage(result.error, 'Recovery could not be started. Retry.'),
          type: 'fail'
        });
        return;
      }

      dispatch({
        message:
          'If this account can be recovered, an email with a 30-minute recovery link will arrive.',
        type: 'succeed'
      });
    } catch {
      dispatch({
        message: 'Recovery could not be started. Check your connection and retry.',
        type: 'fail'
      });
    }
  });

  if (state.status === 'succeeded') {
    return (
      <div className="grid gap-6">
        <Alert description={state.message} title="Check your email" tone="success" />
        <div>
          <Link href="/login">Return to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <Form
        onSubmit={(event) => {
          void submit(event);
        }}
        validationBehavior="aria"
      >
        <Controller
          control={control}
          name="organization"
          render={({ field }) => (
            <TextField
              autoComplete="organization"
              errorMessage={errors.organization?.message}
              isInvalid={Boolean(errors.organization)}
              label="Organization"
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              value={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <TextField
              autoComplete="email"
              errorMessage={errors.email?.message}
              inputMode="email"
              isInvalid={Boolean(errors.email)}
              label="Email"
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              type="email"
              value={field.value}
            />
          )}
        />
        {state.status === 'failed' ? <Alert title={state.message} tone="danger" /> : null}
        <Button isLoading={state.status === 'submitting'} type="submit">
          Send recovery link
        </Button>
      </Form>
      <p className="m-0 text-sm text-text-muted">
        Remember your password? <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}

function RecoveryCompleteForm({ token }: Pick<RecoveryFormProps, 'token'>) {
  const [state, dispatch] = useReducer(submissionReducer, initialSubmissionState);
  const {
    clearErrors,
    control,
    handleSubmit,
    setError,
    formState: { errors }
  } = useForm<RecoveryCompleteValues>({
    defaultValues: {
      password: '',
      password_confirmation: ''
    }
  });

  const submit = handleSubmit(async (values) => {
    dispatch({ type: 'reset' });
    clearErrors();
    const parsed = recoveryCompleteSchema.safeParse(values);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const fieldName = issue.path[0];

        if (fieldName === 'password' || fieldName === 'password_confirmation') {
          setError(fieldName, { message: issue.message });
        }
      }

      return;
    }

    dispatch({ type: 'submit' });

    try {
      const result = await api.POST('/api/v1/auth/recovery/complete', {
        body: {
          password: parsed.data.password,
          token
        }
      });

      if (!result.response.ok) {
        dispatch({
          message: errorMessage(
            result.error,
            'The recovery link is invalid or expired. Start recovery again.'
          ),
          type: 'fail'
        });
        return;
      }

      dispatch({
        message: 'Your password has been updated. Sign in with the new password.',
        type: 'succeed'
      });
    } catch {
      dispatch({
        message: 'The password could not be updated. Check your connection and retry.',
        type: 'fail'
      });
    }
  });

  if (state.status === 'succeeded') {
    return (
      <div className="grid gap-6">
        <Alert description={state.message} title="Password updated" tone="success" />
        <div>
          <Link href="/login">Sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <Form
        onSubmit={(event) => {
          void submit(event);
        }}
        validationBehavior="aria"
      >
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <PasswordField
              autoComplete="new-password"
              description="12 to 128 characters"
              errorMessage={errors.password?.message}
              isInvalid={Boolean(errors.password)}
              label="New password"
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              value={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="password_confirmation"
          render={({ field }) => (
            <PasswordField
              autoComplete="new-password"
              errorMessage={errors.password_confirmation?.message}
              isInvalid={Boolean(errors.password_confirmation)}
              label="Confirm new password"
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              value={field.value}
            />
          )}
        />
        {state.status === 'failed' ? <Alert title={state.message} tone="danger" /> : null}
        <Button isLoading={state.status === 'submitting'} type="submit">
          Update password
        </Button>
      </Form>
      <p className="m-0 text-sm text-text-muted">
        Need another link? <Link href="/recover">Start recovery</Link>
      </p>
    </div>
  );
}

export function RecoveryForm({ initialOrganization, token }: RecoveryFormProps) {
  return token ? (
    <RecoveryCompleteForm token={token} />
  ) : (
    <RecoveryStartForm initialOrganization={initialOrganization} />
  );
}
