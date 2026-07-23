'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useEvent } from '../../../event-context';
import { useSession } from '../../../session-context';
import {
  Alert,
  AlertDialog,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogTrigger,
  EmptyState,
  Form,
  PasswordField,
  Select,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  TextField,
  showToast
} from '@/components/ui';
import {
  api,
  errorMessage,
  type ManagedGrant,
  type ManagedPermission,
  type ManagedRole,
  type ManagedUser
} from '@/lib/api/client';

interface AccessAdminViewProps {
  initialError: string | null;
  initialGrants: ManagedGrant[];
  initialPermissions: ManagedPermission[];
  initialRoles: ManagedRole[];
  initialUsers: ManagedUser[];
}

const userSchema = z.object({
  display_name: z.string().trim().min(1, 'Enter a display name.'),
  email: z.string().trim().email('Enter a valid email address.'),
  email_verified: z.boolean(),
  password: z.string().min(12, 'Use at least 12 characters.').max(128)
});

const roleSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Enter a role key.')
    .regex(/^[a-z][a-z0-9_]*$/u, 'Use lowercase letters, numbers, and underscores.'),
  name: z.string().trim().min(1, 'Enter a role name.'),
  permissions: z.array(z.string()).min(1)
});

const grantSchema = z.object({
  event_id: z.string(),
  role_id: z.string().min(1, 'Choose a role.'),
  user_id: z.string().min(1, 'Choose a user.')
});

type UserValues = z.infer<typeof userSchema>;
type RoleValues = z.infer<typeof roleSchema>;
type GrantValues = z.infer<typeof grantSchema>;

function CreateUserForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const { session } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<UserValues>({
    defaultValues: {
      display_name: '',
      email: '',
      email_verified: false,
      password: ''
    }
  });

  const submit = handleSubmit(async (values) => {
    const parsed = userSchema.safeParse(values);

    if (!parsed.success || !session?.csrf_token) {
      setError('The account details or session are invalid.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.POST('/api/v1/admin/users', {
        body: {
          custom_fields: {},
          display_name: parsed.data.display_name,
          email: parsed.data.email,
          email_verified: parsed.data.email_verified,
          password: parsed.data.password
        },
        headers: {
          'x-csrf-token': session.csrf_token
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'The account could not be created.'));
        return;
      }

      reset();
      await onCreated();
      showToast({
        title: 'Account created',
        tone: 'success'
      });
    } catch {
      setError('The account could not be created. Check your connection and retry.');
    } finally {
      setIsSubmitting(false);
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
        name="display_name"
        render={({ field }) => (
          <TextField
            autoFocus
            errorMessage={errors.display_name?.message}
            isInvalid={Boolean(errors.display_name)}
            label="Display name"
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
            errorMessage={errors.email?.message}
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
            errorMessage={errors.password?.message}
            isInvalid={Boolean(errors.password)}
            label="Temporary password"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="email_verified"
        render={({ field }) => (
          <Checkbox isSelected={field.value} onChange={field.onChange}>
            Mark email as verified
          </Checkbox>
        )}
      />
      {error ? <Alert title={error} tone="danger" /> : null}
      <Button isLoading={isSubmitting} type="submit">
        Create account
      </Button>
    </Form>
  );
}

function CreateRoleForm({
  onCreated,
  permissions
}: {
  onCreated: () => Promise<void>;
  permissions: ManagedPermission[];
}) {
  const { session } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<RoleValues>({
    defaultValues: {
      key: '',
      name: '',
      permissions: []
    }
  });

  const submit = handleSubmit(async (values) => {
    const parsed = roleSchema.safeParse(values);

    if (!parsed.success || !session?.csrf_token) {
      setError('Choose at least one permission and check the role details.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.POST('/api/v1/admin/roles', {
        body: parsed.data,
        headers: {
          'x-csrf-token': session.csrf_token
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'The role could not be created.'));
        return;
      }

      reset();
      await onCreated();
      showToast({
        title: 'Role created',
        tone: 'success'
      });
    } catch {
      setError('The role could not be created. Check your connection and retry.');
    } finally {
      setIsSubmitting(false);
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
        name="name"
        render={({ field }) => (
          <TextField
            autoFocus
            errorMessage={errors.name?.message}
            isInvalid={Boolean(errors.name)}
            label="Role name"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="key"
        render={({ field }) => (
          <TextField
            errorMessage={errors.key?.message}
            isInvalid={Boolean(errors.key)}
            label="Role key"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="permissions"
        render={({ field }) => (
          <fieldset className="grid gap-3 rounded-lg border border-border-subtle p-4">
            <legend className="px-2 text-sm font-semibold text-text">Permissions</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {permissions.map((permission) => (
                <Checkbox
                  isSelected={field.value.includes(permission.key)}
                  key={permission.key}
                  onChange={(selected) => {
                    field.onChange(
                      selected
                        ? [...field.value, permission.key]
                        : field.value.filter((value) => value !== permission.key)
                    );
                  }}
                >
                  {permission.key}
                </Checkbox>
              ))}
            </div>
          </fieldset>
        )}
      />
      {error ? <Alert title={error} tone="danger" /> : null}
      <Button isLoading={isSubmitting} type="submit">
        Create role
      </Button>
    </Form>
  );
}

function CreateGrantForm({
  onCreated,
  roles,
  users
}: {
  onCreated: () => Promise<void>;
  roles: ManagedRole[];
  users: ManagedUser[];
}) {
  const { events } = useEvent();
  const { session } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<GrantValues>({
    defaultValues: {
      event_id: 'organization',
      role_id: roles[0]?.id ?? '',
      user_id: users[0]?.id ?? ''
    }
  });

  const submit = handleSubmit(async (values) => {
    const parsed = grantSchema.safeParse(values);

    if (!parsed.success || !session?.csrf_token) {
      setError('Choose a user and role.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.POST('/api/v1/admin/role-grants', {
        body: {
          event_id: parsed.data.event_id === 'organization' ? null : parsed.data.event_id,
          role_id: parsed.data.role_id,
          team_id: null,
          user_id: parsed.data.user_id
        },
        headers: {
          'x-csrf-token': session.csrf_token
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'The role grant could not be assigned.'));
        return;
      }

      reset();
      await onCreated();
      showToast({
        title: 'Role assigned',
        tone: 'success'
      });
    } catch {
      setError('The role grant could not be assigned. Check your connection and retry.');
    } finally {
      setIsSubmitting(false);
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
        name="user_id"
        render={({ field }) => (
          <Select
            label="Account"
            onSelectionChange={(key) => {
              field.onChange(String(key));
            }}
            options={users.map((user) => ({
              id: user.id,
              label: `${user.display_name} (${user.email})`
            }))}
            selectedKey={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="role_id"
        render={({ field }) => (
          <Select
            label="Role"
            onSelectionChange={(key) => {
              field.onChange(String(key));
            }}
            options={roles.map((role) => ({
              id: role.id,
              label: role.name
            }))}
            selectedKey={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="event_id"
        render={({ field }) => (
          <Select
            description="Organization scope applies across every event."
            label="Scope"
            onSelectionChange={(key) => {
              field.onChange(String(key));
            }}
            options={[
              {
                id: 'organization',
                label: 'Organization'
              },
              ...events.map((event) => ({
                id: event.id,
                label: event.name
              }))
            ]}
            selectedKey={field.value}
          />
        )}
      />
      {errors.user_id || errors.role_id ? (
        <Alert title="Choose a user and role." tone="danger" />
      ) : null}
      {error ? <Alert title={error} tone="danger" /> : null}
      <Button isLoading={isSubmitting} type="submit">
        Assign role
      </Button>
    </Form>
  );
}

export function AccessAdminView({
  initialError,
  initialGrants,
  initialPermissions,
  initialRoles,
  initialUsers
}: AccessAdminViewProps) {
  const { events } = useEvent();
  const { can, session } = useSession();
  const [error, setError] = useState(initialError);
  const [grants, setGrants] = useState(initialGrants);
  const [permissions, setPermissions] = useState(initialPermissions);
  const [roles, setRoles] = useState(initialRoles);
  const [users, setUsers] = useState(initialUsers);
  const [accountOpen, setAccountOpen] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const userNames = new Map(users.map((user) => [user.id, user.display_name]));
  const eventNames = new Map(events.map((event) => [event.id, event.name]));

  const refresh = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [userResult, roleResult, grantResult, permissionResult] = await Promise.all([
        api.GET('/api/v1/admin/users'),
        api.GET('/api/v1/admin/roles'),
        api.GET('/api/v1/admin/role-grants'),
        api.GET('/api/v1/admin/permissions')
      ]);

      if (!userResult.data || !roleResult.data || !grantResult.data || !permissionResult.data) {
        setError('Access inventory could not be loaded.');
        return;
      }

      setUsers(userResult.data);
      setRoles(roleResult.data);
      setGrants(grantResult.data);
      setPermissions(permissionResult.data);
    } catch {
      setError('Access inventory could not be loaded. Check your connection and retry.');
    } finally {
      setIsLoading(false);
    }
  };

  const setUserDisabled = async (user: ManagedUser, disabled: boolean) => {
    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    setPendingAction(user.id);
    setError(null);

    try {
      const result = await api.PATCH('/api/v1/admin/users/{user_id}', {
        body: {
          custom_fields: user.custom_fields,
          disabled,
          display_name: user.display_name,
          email_verified: user.email_verified
        },
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            user_id: user.id
          }
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'The account status could not be changed.'));
        return;
      }

      await refresh();
      showToast({
        title: disabled ? 'Account disabled' : 'Account enabled',
        tone: 'success'
      });
    } catch {
      setError('The account status could not be changed. Check your connection and retry.');
    } finally {
      setPendingAction(null);
    }
  };

  const revokeGrant = async (grant: ManagedGrant) => {
    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    setPendingAction(grant.id);
    setError(null);

    try {
      const result = await api.DELETE('/api/v1/admin/role-grants/{grant_id}', {
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            grant_id: grant.id
          }
        }
      });

      if (result.error) {
        setError(errorMessage(result.error, 'The role grant could not be revoked.'));
        return;
      }

      await refresh();
      showToast({
        title: 'Role revoked',
        tone: 'success'
      });
    } catch {
      setError('The role grant could not be revoked. Check your connection and retry.');
    } finally {
      setPendingAction(null);
    }
  };

  if (!can('identity_manage')) {
    return <Alert title="Access management is unavailable for this account." tone="danger" />;
  }

  return (
    <div aria-busy={isLoading || pendingAction !== null} className="grid gap-12">
      {error ? (
        <Alert
          actions={
            <Button
              isLoading={isLoading}
              onPress={() => {
                void refresh();
              }}
              size="small"
              tone="secondary"
            >
              Retry
            </Button>
          }
          title={error}
          tone="danger"
        />
      ) : null}

      <section className="grid gap-4" aria-labelledby="accounts-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2
              className="m-0 font-display text-xl font-semibold tracking-tight text-text"
              id="accounts-title"
            >
              Accounts
            </h2>
            <Badge>{users.length}</Badge>
          </div>
          <DialogTrigger isOpen={accountOpen} onOpenChange={setAccountOpen}>
            <Button>Create account</Button>
            <Dialog title="Create account">
              <CreateUserForm
                onCreated={async () => {
                  await refresh();
                  setAccountOpen(false);
                }}
              />
            </Dialog>
          </DialogTrigger>
        </div>
        {users.length === 0 ? (
          <EmptyState description="Create the first managed account." title="No accounts" />
        ) : (
          <Table aria-label="Managed accounts">
            <TableHeader>
              <TableColumn isRowHeader>Account</TableColumn>
              <TableColumn>Email</TableColumn>
              <TableColumn>Status</TableColumn>
              <TableColumn>Actions</TableColumn>
            </TableHeader>
            <TableBody emptyState="No accounts.">
              {users.map((user) => (
                <TableRow id={user.id} key={user.id}>
                  <TableCell>{user.display_name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge tone={user.disabled ? 'danger' : 'success'}>
                      {user.disabled ? 'Disabled' : 'Active'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.id === session?.user.id ? (
                      <span className="text-sm text-text-muted">Current account</span>
                    ) : user.disabled ? (
                      <Button
                        isDisabled={pendingAction !== null}
                        onPress={() => {
                          void setUserDisabled(user, false);
                        }}
                        size="small"
                        tone="secondary"
                      >
                        Enable
                      </Button>
                    ) : (
                      <DialogTrigger>
                        <Button isDisabled={pendingAction !== null} size="small" tone="danger">
                          Disable
                        </Button>
                        <AlertDialog
                          actions={
                            <>
                              <Button slot="close" tone="quiet">
                                Keep account
                              </Button>
                              <Button
                                onPress={() => {
                                  void setUserDisabled(user, true);
                                }}
                                slot="close"
                                tone="danger"
                              >
                                Disable account
                              </Button>
                            </>
                          }
                          description={`${user.display_name} will lose access until an organizer enables the account.`}
                          title="Disable account?"
                        />
                      </DialogTrigger>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="grid gap-4" aria-labelledby="roles-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2
              className="m-0 font-display text-xl font-semibold tracking-tight text-text"
              id="roles-title"
            >
              Roles
            </h2>
            <Badge>{roles.length}</Badge>
          </div>
          <DialogTrigger isOpen={roleOpen} onOpenChange={setRoleOpen}>
            <Button tone="secondary">Create role</Button>
            <Dialog title="Create role">
              <CreateRoleForm
                onCreated={async () => {
                  await refresh();
                  setRoleOpen(false);
                }}
                permissions={permissions}
              />
            </Dialog>
          </DialogTrigger>
        </div>
        <Table aria-label="Access roles">
          <TableHeader>
            <TableColumn isRowHeader>Role</TableColumn>
            <TableColumn>Key</TableColumn>
            <TableColumn>Permissions</TableColumn>
            <TableColumn>Source</TableColumn>
          </TableHeader>
          <TableBody emptyState="No roles.">
            {roles.map((role) => (
              <TableRow id={role.id} key={role.id}>
                <TableCell>{role.name}</TableCell>
                <TableCell>
                  <span className="font-mono text-xs">{role.key}</span>
                </TableCell>
                <TableCell>{role.permissions.length}</TableCell>
                <TableCell>{role.built_in ? 'Built in' : 'Custom'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="grid gap-4" aria-labelledby="grants-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2
              className="m-0 font-display text-xl font-semibold tracking-tight text-text"
              id="grants-title"
            >
              Role grants
            </h2>
            <Badge>{grants.length}</Badge>
          </div>
          <DialogTrigger isOpen={grantOpen} onOpenChange={setGrantOpen}>
            <Button isDisabled={roles.length === 0 || users.length === 0} tone="secondary">
              Assign role
            </Button>
            <Dialog title="Assign role">
              <CreateGrantForm
                onCreated={async () => {
                  await refresh();
                  setGrantOpen(false);
                }}
                roles={roles}
                users={users}
              />
            </Dialog>
          </DialogTrigger>
        </div>
        <Table aria-label="Role grants">
          <TableHeader>
            <TableColumn isRowHeader>Account</TableColumn>
            <TableColumn>Role</TableColumn>
            <TableColumn>Scope</TableColumn>
            <TableColumn>Actions</TableColumn>
          </TableHeader>
          <TableBody emptyState="No role grants.">
            {grants.map((grant) => (
              <TableRow id={grant.id} key={grant.id}>
                <TableCell>{userNames.get(grant.user_id) ?? grant.user_id}</TableCell>
                <TableCell>{grant.role_name}</TableCell>
                <TableCell>
                  {grant.event_id ? (eventNames.get(grant.event_id) ?? 'Event') : 'Organization'}
                </TableCell>
                <TableCell>
                  <DialogTrigger>
                    <Button isDisabled={pendingAction !== null} size="small" tone="danger">
                      Revoke
                    </Button>
                    <AlertDialog
                      actions={
                        <>
                          <Button slot="close" tone="quiet">
                            Keep role
                          </Button>
                          <Button
                            onPress={() => {
                              void revokeGrant(grant);
                            }}
                            slot="close"
                            tone="danger"
                          >
                            Revoke role
                          </Button>
                        </>
                      }
                      description={`${grant.role_name} access will be removed from ${userNames.get(grant.user_id) ?? 'this account'}.`}
                      title="Revoke role?"
                    />
                  </DialogTrigger>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
