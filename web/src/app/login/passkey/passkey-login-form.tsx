'use client';

import { useReducer } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, Button, Form, Link, TextField } from '@/components/ui';
import { api, errorMessage } from '@/lib/api/client';
import { authenticatePasskey } from '@/lib/auth/passkeys';
import { initialSubmissionState, submissionReducer } from '@/lib/auth/public-auth';

const passkeyLoginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  organization: z.string().trim().min(1, 'Enter your organization.')
});

type PasskeyLoginValues = z.infer<typeof passkeyLoginSchema>;

interface PasskeyLoginFormProps {
  initialOrganization: string;
  returnTo: string;
}

export function PasskeyLoginForm({ initialOrganization, returnTo }: PasskeyLoginFormProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(submissionReducer, initialSubmissionState);
  const {
    clearErrors,
    control,
    handleSubmit,
    setError,
    formState: { errors }
  } = useForm<PasskeyLoginValues>({
    defaultValues: {
      email: '',
      organization: initialOrganization
    }
  });

  const submit = handleSubmit(async (values) => {
    dispatch({ type: 'reset' });
    clearErrors();
    const parsed = passkeyLoginSchema.safeParse(values);

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
      const started = await api.POST('/api/v1/auth/passkeys/login/start', {
        body: {
          email: parsed.data.email.trim(),
          organization: parsed.data.organization.trim(),
          return_to: returnTo
        }
      });

      if (!started.data) {
        dispatch({
          message: errorMessage(started.error, 'Passkey sign in could not be started.'),
          type: 'fail'
        });
        return;
      }

      const credential = await authenticatePasskey(started.data.options);
      const finished = await api.POST('/api/v1/auth/passkeys/login/finish', {
        body: { credential }
      });

      if (!finished.data) {
        dispatch({
          message: errorMessage(finished.error, 'The passkey could not be verified. Retry.'),
          type: 'fail'
        });
        return;
      }

      router.replace(returnTo);
      router.refresh();
    } catch (error) {
      dispatch({
        message:
          error instanceof Error
            ? error.message
            : 'Passkey sign in failed. Check your connection and retry.',
        type: 'fail'
      });
    }
  });

  const passwordParameters = new URLSearchParams({
    next: returnTo
  });

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
              autoComplete="username webauthn"
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
          Continue with passkey
        </Button>
      </Form>
      <p className="m-0 text-sm text-text-muted">
        <Link href={`/login?${passwordParameters.toString()}`}>Use a password</Link>
      </p>
    </div>
  );
}
