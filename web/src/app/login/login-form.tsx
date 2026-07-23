'use client';

import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { SessionProvider, useSession } from '../session-context';
import { Alert, Button, Form, PasswordField, TextField } from '@/components/ui';

const loginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  mfa_code: z.string(),
  organization: z.string().trim().min(1, 'Enter your organization.'),
  password: z.string().min(1, 'Enter your password.')
});

type LoginFormValues = z.infer<typeof loginSchema>;

function LoginFormFields() {
  const router = useRouter();
  const { clearError, error, errorCode, isLoading, login } = useSession();
  const requiresMfa = errorCode === 'mfa_required' || errorCode === 'mfa_invalid';
  const {
    control,
    clearErrors,
    handleSubmit,
    setError,
    formState: { errors }
  } = useForm<LoginFormValues>({
    defaultValues: {
      email: '',
      mfa_code: '',
      organization: '',
      password: ''
    }
  });

  const submit = handleSubmit(async (values) => {
    clearError();
    clearErrors();

    const parsed = loginSchema.safeParse(values);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const fieldName = issue.path[0];

        if (
          fieldName === 'email' ||
          fieldName === 'mfa_code' ||
          fieldName === 'organization' ||
          fieldName === 'password'
        ) {
          setError(fieldName, {
            message: issue.message
          });
        }
      }

      return;
    }

    if (requiresMfa && parsed.data.mfa_code.trim().length === 0) {
      setError('mfa_code', {
        message: 'Enter your authentication code.'
      });
      return;
    }

    const authenticated = await login({
      email: parsed.data.email.trim(),
      mfa_code: requiresMfa ? parsed.data.mfa_code.trim() : null,
      organization: parsed.data.organization.trim(),
      password: parsed.data.password
    });

    if (authenticated) {
      router.replace('/challenges');
      router.refresh();
    }
  });

  return (
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
            autoComplete="username"
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
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <PasswordField
            autoComplete="current-password"
            errorMessage={errors.password?.message}
            isInvalid={Boolean(errors.password)}
            label="Password"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      {requiresMfa ? (
        <Controller
          control={control}
          name="mfa_code"
          render={({ field }) => (
            <TextField
              autoComplete="one-time-code"
              errorMessage={
                errors.mfa_code?.message ??
                (errorCode === 'mfa_invalid' ? 'Enter a valid authentication code.' : undefined)
              }
              inputMode="numeric"
              isInvalid={Boolean(errors.mfa_code) || errorCode === 'mfa_invalid'}
              label="Authentication code"
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              value={field.value}
            />
          )}
        />
      ) : null}
      {error && errorCode !== 'mfa_required' && errorCode !== 'mfa_invalid' ? (
        <Alert title={error} tone="danger" />
      ) : null}
      <Button isLoading={isLoading} type="submit">
        Sign in
      </Button>
    </Form>
  );
}

export function LoginForm() {
  return (
    <SessionProvider initialSession={null}>
      <LoginFormFields />
    </SessionProvider>
  );
}
