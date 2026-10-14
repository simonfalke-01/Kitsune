'use client';

import { useReducer, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, Button, Form, Link, TextField } from '@/components/ui';
import { api } from '@/lib/api/client';
import {
  externalAuthStartHref,
  initialSubmissionState,
  submissionReducer
} from '@/lib/auth/public-auth';

const externalLoginSchema = z.object({
  organization: z.string().trim().min(1, 'Enter your organization.')
});

type ExternalLoginValues = z.infer<typeof externalLoginSchema>;

interface ExternalLoginFormProps {
  initialOrganization: string;
  returnTo: string;
}

interface AvailableProvider {
  displayName: string;
  href: string;
  id: string;
}

export function ExternalLoginForm({ initialOrganization, returnTo }: ExternalLoginFormProps) {
  const [state, dispatch] = useReducer(submissionReducer, initialSubmissionState);
  const [providers, setProviders] = useState<AvailableProvider[] | null>(null);
  const {
    clearErrors,
    control,
    handleSubmit,
    setError,
    formState: { errors }
  } = useForm<ExternalLoginValues>({
    defaultValues: {
      organization: initialOrganization
    }
  });

  const submit = handleSubmit(async (values) => {
    dispatch({ type: 'reset' });
    setProviders(null);
    clearErrors();
    const parsed = externalLoginSchema.safeParse(values);

    if (!parsed.success) {
      setError('organization', {
        message: parsed.error.issues[0]?.message ?? 'Enter your organization.'
      });
      return;
    }

    dispatch({ type: 'submit' });
    const organization = parsed.data.organization.trim();

    try {
      const [oidc, saml] = await Promise.all([
        api.GET('/api/v1/auth/oidc/providers/public', {
          params: { query: { organization } }
        }),
        api.GET('/api/v1/auth/saml/providers/public', {
          params: { query: { organization } }
        })
      ]);

      if (!oidc.response.ok || !saml.response.ok) {
        dispatch({
          message: 'Organization sign-in methods could not be loaded. Retry.',
          type: 'fail'
        });
        return;
      }

      const available = [
        ...(oidc.data ?? []).map((provider) => ({
          displayName: provider.display_name,
          id: `oidc:${provider.key}`,
          startPath: provider.start_path
        })),
        ...(saml.data ?? []).map((provider) => ({
          displayName: provider.display_name,
          id: `saml:${provider.key}`,
          startPath: provider.start_path
        }))
      ].flatMap((provider) => {
        const href = externalAuthStartHref(provider.startPath, returnTo);

        return href
          ? [
              {
                displayName: provider.displayName,
                href,
                id: provider.id
              }
            ]
          : [];
      });

      setProviders(available);
      dispatch({
        message: 'Organization sign-in methods loaded.',
        type: 'succeed'
      });
    } catch {
      dispatch({
        message: 'Organization sign-in methods could not be loaded. Check your connection.',
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
        {state.status === 'failed' ? <Alert title={state.message} tone="danger" /> : null}
        <Button isLoading={state.status === 'submitting'} type="submit">
          Find sign-in methods
        </Button>
      </Form>
      {providers?.length ? (
        <section className="grid gap-4" aria-labelledby="provider-list-title">
          <h2
            className="m-0 font-display text-lg font-semibold tracking-tight text-text"
            id="provider-list-title"
          >
            Available methods
          </h2>
          <ul className="m-0 grid list-none gap-3 p-0">
            {providers.map((provider) => (
              <li key={provider.id}>
                <Link href={provider.href}>{provider.displayName}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {providers?.length === 0 ? (
        <Alert title="No organization sign-in methods are available." />
      ) : null}
      <p className="m-0 text-sm text-text-muted">
        <Link href={`/login?${passwordParameters.toString()}`}>Use email and password</Link>
      </p>
    </div>
  );
}
