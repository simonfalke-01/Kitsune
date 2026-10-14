'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { SessionProvider, useSession } from '../session-context';
import { Alert, Button, Form, Link, PasswordField, TextField } from '@/components/ui';

const registerSchema = z
  .object({
    display_name: z.string().trim().min(1, 'Enter your name.'),
    email: z.email('Enter a valid email address.'),
    organization: z.string().trim().min(1, 'Enter your organization.'),
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

type RegisterFormValues = z.infer<typeof registerSchema>;

interface RegisterFormProps {
  initialOrganization: string;
  returnTo: string;
}

function RegisterFormFields({ initialOrganization, returnTo }: RegisterFormProps) {
  const { clearError, error, isLoading, register } = useSession();
  const [isCreated, setIsCreated] = useState(false);
  const {
    clearErrors,
    control,
    handleSubmit,
    setError,
    formState: { errors }
  } = useForm<RegisterFormValues>({
    defaultValues: {
      display_name: '',
      email: '',
      organization: initialOrganization,
      password: '',
      password_confirmation: ''
    }
  });

  const submit = handleSubmit(async (values) => {
    clearError();
    clearErrors();

    const parsed = registerSchema.safeParse(values);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const fieldName = issue.path[0];

        if (
          fieldName === 'display_name' ||
          fieldName === 'email' ||
          fieldName === 'organization' ||
          fieldName === 'password' ||
          fieldName === 'password_confirmation'
        ) {
          setError(fieldName, {
            message: issue.message
          });
        }
      }

      return;
    }

    const registered = await register({
      display_name: parsed.data.display_name.trim(),
      email: parsed.data.email.trim(),
      organization: parsed.data.organization.trim(),
      password: parsed.data.password
    });

    if (registered) {
      setIsCreated(true);
    }
  });

  if (isCreated) {
    return (
      <div className="grid gap-6">
        <Alert
          description="Continue to Kitsune. A verification link may arrive by email and expires after 24 hours."
          title="Account created"
          tone="success"
        />
        <div>
          <Link href={returnTo}>Continue</Link>
        </div>
      </div>
    );
  }

  const signInParameters = new URLSearchParams({
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
          name="display_name"
          render={({ field }) => (
            <TextField
              autoComplete="name"
              errorMessage={errors.display_name?.message}
              isInvalid={Boolean(errors.display_name)}
              label="Name"
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
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <PasswordField
              autoComplete="new-password"
              description="12 to 128 characters"
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
        <Controller
          control={control}
          name="password_confirmation"
          render={({ field }) => (
            <PasswordField
              autoComplete="new-password"
              errorMessage={errors.password_confirmation?.message}
              isInvalid={Boolean(errors.password_confirmation)}
              label="Confirm password"
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              value={field.value}
            />
          )}
        />
        {error ? <Alert title={error} tone="danger" /> : null}
        <Button isLoading={isLoading} type="submit">
          Create account
        </Button>
      </Form>
      <p className="m-0 text-sm text-text-muted">
        Already have an account? <Link href={`/login?${signInParameters.toString()}`}>Sign in</Link>
      </p>
    </div>
  );
}

export function RegisterForm(props: RegisterFormProps) {
  return (
    <SessionProvider initialSession={null}>
      <RegisterFormFields {...props} />
    </SessionProvider>
  );
}
