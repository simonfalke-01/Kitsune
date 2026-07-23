'use client';

import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { SessionProvider, useSession } from '../session-context';
import { Alert, Button, Form, PasswordField, TextField } from '@/components/ui';

const setupSchema = z
  .object({
    display_name: z.string().trim().min(1, 'Enter your name.'),
    email: z.email('Enter a valid email address.'),
    organization_name: z.string().trim().min(1, 'Enter an organization name.'),
    organization_slug: z
      .string()
      .trim()
      .min(1, 'Enter an organization key.')
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens.'),
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

type SetupFormValues = z.infer<typeof setupSchema>;

function SetupFormFields() {
  const router = useRouter();
  const { clearError, error, isLoading, setup } = useSession();
  const {
    clearErrors,
    control,
    handleSubmit,
    setError,
    formState: { errors }
  } = useForm<SetupFormValues>({
    defaultValues: {
      display_name: '',
      email: '',
      organization_name: '',
      organization_slug: '',
      password: '',
      password_confirmation: ''
    }
  });

  const submit = handleSubmit(async (values) => {
    clearError();
    clearErrors();

    const parsed = setupSchema.safeParse(values);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const fieldName = issue.path[0];

        if (
          fieldName === 'display_name' ||
          fieldName === 'email' ||
          fieldName === 'organization_name' ||
          fieldName === 'organization_slug' ||
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

    const completed = await setup({
      display_name: parsed.data.display_name.trim(),
      email: parsed.data.email.trim(),
      organization_name: parsed.data.organization_name.trim(),
      organization_slug: parsed.data.organization_slug.trim(),
      password: parsed.data.password
    });

    if (completed) {
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
        name="organization_name"
        render={({ field }) => (
          <TextField
            autoComplete="organization"
            errorMessage={errors.organization_name?.message}
            isInvalid={Boolean(errors.organization_name)}
            label="Organization name"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="organization_slug"
        render={({ field }) => (
          <TextField
            errorMessage={errors.organization_slug?.message}
            isInvalid={Boolean(errors.organization_slug)}
            label="Organization key"
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
            label="Your name"
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
        Create Kitsune
      </Button>
    </Form>
  );
}

export function SetupForm() {
  return (
    <SessionProvider initialSession={null}>
      <SetupFormFields />
    </SessionProvider>
  );
}
