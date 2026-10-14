'use client';

import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
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
  SearchField,
  Select,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  TextArea,
  TextField,
  showToast
} from '@/components/ui';
import {
  api,
  errorMessage,
  type ManagedGrant,
  type ManagedPermission,
  type ManagedRole,
  type ManagedUser,
  type TeamSummary
} from '@/lib/api/client';
import {
  createGrantInput,
  disablingUserWouldRemoveLastPlatformManager,
  filterManagedGrants,
  filterManagedRoles,
  filterManagedUsers,
  formatCustomFields,
  grantAlreadyExists,
  grantHasPlatformAuthority,
  grantScopeSelection,
  grantScopeSummary,
  parseCustomFields,
  removingRolePlatformAuthorityWouldRemoveLastManager,
  revokingGrantWouldRemoveLastPlatformManager,
  roleGrantCount,
  roleHasPlatformAuthority,
  selectedScopeSummary,
  userHasPlatformAuthority
} from '@/lib/admin-access';

interface AccessAdminViewProps {
  initialError: string | null;
  initialGrants: ManagedGrant[];
  initialPermissions: ManagedPermission[];
  initialRoles: ManagedRole[];
  initialUsers: ManagedUser[];
}

const userSchema = z.object({
  custom_fields: z.string(),
  display_name: z.string().trim().min(1, 'Enter a display name.'),
  email: z.string().trim().email('Enter a valid email address.'),
  email_verified: z.boolean(),
  password: z.string().min(12, 'Use at least 12 characters.').max(128)
});

const updateUserSchema = z.object({
  custom_fields: z.string(),
  disabled: z.boolean(),
  display_name: z.string().trim().min(1, 'Enter a display name.').max(80),
  email_verified: z.boolean()
});

const roleSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Enter a role key.')
    .max(63)
    .regex(/^[a-z][a-z0-9_]*$/u, 'Use lowercase letters, numbers, and underscores.'),
  name: z.string().trim().min(1, 'Enter a role name.').max(80),
  permissions: z.array(z.string()).min(1)
});

const grantSchema = z.object({
  event_id: z.string(),
  role_id: z.string().min(1, 'Choose a role.'),
  scope_kind: z.enum(['event', 'event_team', 'organization', 'team']),
  team_id: z.string(),
  user_id: z.string().min(1, 'Choose a user.')
});

type UserValues = z.infer<typeof userSchema>;
type UpdateUserValues = z.infer<typeof updateUserSchema>;
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
      custom_fields: '{}',
      display_name: '',
      email: '',
      email_verified: false,
      password: ''
    }
  });

  const submit = handleSubmit(async (values) => {
    const parsed = userSchema.safeParse(values);
    const customFields = parseCustomFields(values.custom_fields);

    if (!parsed.success || !customFields.success || !session?.csrf_token) {
      setError('The account details or session are invalid.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.POST('/api/v1/admin/users', {
        body: {
          custom_fields: customFields.data,
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
      <Controller
        control={control}
        name="custom_fields"
        render={({ field }) => {
          const parsed = parseCustomFields(field.value);

          return (
            <TextArea
              description="Optional JSON object. Use at most 32 fields and 16 KiB."
              errorMessage={parsed.success ? undefined : parsed.error}
              isInvalid={!parsed.success}
              label="Custom fields"
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              rows={6}
              value={field.value}
            />
          );
        }}
      />
      {error ? <Alert title={error} tone="danger" /> : null}
      <Button isLoading={isSubmitting} type="submit">
        Create account
      </Button>
    </Form>
  );
}

function EditUserForm({
  canPlatformManage,
  currentUserId,
  grants,
  onUpdated,
  roles,
  user,
  users
}: {
  canPlatformManage: boolean;
  currentUserId: string | undefined;
  grants: ManagedGrant[];
  onUpdated: () => Promise<void>;
  roles: ManagedRole[];
  user: ManagedUser;
  users: ManagedUser[];
}) {
  const { session } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors }
  } = useForm<UpdateUserValues>({
    defaultValues: {
      custom_fields: formatCustomFields(user.custom_fields),
      disabled: user.disabled,
      display_name: user.display_name,
      email_verified: user.email_verified
    }
  });
  const disabled = useWatch({
    control,
    name: 'disabled'
  });
  const hasPlatformAuthority = userHasPlatformAuthority(user.id, grants, roles);
  const authorityMismatch = hasPlatformAuthority && !canPlatformManage;
  const disablesCurrentUser = disabled && !user.disabled && user.id === currentUserId;
  const removesLastManager =
    disabled &&
    !user.disabled &&
    disablingUserWouldRemoveLastPlatformManager(user, users, grants, roles);

  const submit = handleSubmit(async (values) => {
    const parsed = updateUserSchema.safeParse(values);
    const customFields = parseCustomFields(values.custom_fields);

    if (
      !parsed.success ||
      !customFields.success ||
      !session?.csrf_token ||
      authorityMismatch ||
      disablesCurrentUser ||
      removesLastManager
    ) {
      setError('The account changes cannot be applied.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.PATCH('/api/v1/admin/users/{user_id}', {
        body: {
          custom_fields: customFields.data,
          disabled: parsed.data.disabled,
          display_name: parsed.data.display_name,
          email_verified: parsed.data.email_verified
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
        setError(errorMessage(result.error, 'The account could not be updated.'));
        return;
      }

      await onUpdated();
      showToast({
        title: parsed.data.disabled
          ? 'Account disabled'
          : user.disabled
            ? 'Account enabled'
            : 'Account updated',
        tone: 'success'
      });
    } catch {
      setError('The account could not be updated. Check your connection and retry.');
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <Form
      onSubmit={(event) => {
        if (!disabled || user.disabled) {
          void submit(event);
        } else {
          event.preventDefault();
        }
      }}
      validationBehavior="aria"
    >
      <dl className="m-0 grid gap-2 rounded-lg border border-border-subtle bg-surface-sunken p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-4">
          <dt className="text-text-muted">Email</dt>
          <dd className="m-0 text-text">{user.email}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-4">
          <dt className="text-text-muted">Created</dt>
          <dd className="m-0 tabular-nums text-text">
            {new Date(user.created_at).toLocaleString()}
          </dd>
        </div>
      </dl>
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
        name="email_verified"
        render={({ field }) => (
          <Checkbox isSelected={field.value} onChange={field.onChange}>
            Email verified
          </Checkbox>
        )}
      />
      <Controller
        control={control}
        name="disabled"
        render={({ field }) => (
          <Checkbox
            isDisabled={user.id === currentUserId && !user.disabled}
            isSelected={field.value}
            onChange={field.onChange}
          >
            Account disabled
          </Checkbox>
        )}
      />
      <Controller
        control={control}
        name="custom_fields"
        render={({ field }) => {
          const parsed = parseCustomFields(field.value);

          return (
            <TextArea
              description="JSON object. Use at most 32 fields and 16 KiB."
              errorMessage={parsed.success ? undefined : parsed.error}
              isInvalid={!parsed.success}
              label="Custom fields"
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              rows={8}
              value={field.value}
            />
          );
        }}
      />
      {hasPlatformAuthority ? (
        <Alert
          description={
            authorityMismatch
              ? 'Platform management permission is required to change this account.'
              : 'Changes affect an account with organization-wide platform authority.'
          }
          title="Platform authority"
          tone={authorityMismatch ? 'danger' : 'warning'}
        />
      ) : null}
      {disablesCurrentUser ? (
        <Alert title="You cannot disable your current account." tone="danger" />
      ) : null}
      {removesLastManager ? (
        <Alert
          description="Enable or grant platform authority to another account first."
          title="The organization must retain an active platform manager."
          tone="danger"
        />
      ) : null}
      {error ? <Alert title={error} tone="danger" /> : null}
      {disabled && !user.disabled ? (
        <DialogTrigger>
          <Button
            isDisabled={
              authorityMismatch || disablesCurrentUser || removesLastManager || isSubmitting
            }
            tone="danger"
            type="button"
          >
            Review disabling
          </Button>
          <AlertDialog
            actions={
              <>
                <Button slot="close" tone="quiet">
                  Keep account active
                </Button>
                <Button
                  isLoading={isSubmitting}
                  onPress={() => {
                    void submit();
                  }}
                  slot="close"
                  tone="danger"
                >
                  Disable account
                </Button>
              </>
            }
            description={`${user.display_name} will lose access. Active sessions and API tokens will be revoked.`}
            title="Disable account?"
          />
        </DialogTrigger>
      ) : (
        <Button isDisabled={authorityMismatch} isLoading={isSubmitting} type="submit">
          Save account
        </Button>
      )}
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

function EditRoleForm({
  canPlatformManage,
  grants,
  onUpdated,
  permissions,
  role,
  roles,
  users
}: {
  canPlatformManage: boolean;
  grants: ManagedGrant[];
  onUpdated: () => Promise<void>;
  permissions: ManagedPermission[];
  role: ManagedRole;
  roles: ManagedRole[];
  users: ManagedUser[];
}) {
  const { session } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors }
  } = useForm<RoleValues>({
    defaultValues: {
      key: role.key,
      name: role.name,
      permissions: role.permissions
    }
  });
  const selectedPermissions = useWatch({
    control,
    name: 'permissions'
  });
  const assignedCount = roleGrantCount(role.id, grants);
  const changesPlatformAuthority =
    roleHasPlatformAuthority(role) !== selectedPermissions.includes('platform_manage');
  const authorityMismatch = assignedCount > 0 && changesPlatformAuthority && !canPlatformManage;
  const removesLastManager =
    assignedCount > 0 &&
    roleHasPlatformAuthority(role) &&
    !selectedPermissions.includes('platform_manage') &&
    removingRolePlatformAuthorityWouldRemoveLastManager(role, users, grants, roles);

  const submit = handleSubmit(async (values) => {
    const parsed = roleSchema.safeParse(values);

    if (
      !parsed.success ||
      !session?.csrf_token ||
      authorityMismatch ||
      removesLastManager ||
      role.built_in
    ) {
      setError('The role changes cannot be applied.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.PUT('/api/v1/admin/roles/{role_id}', {
        body: parsed.data,
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            role_id: role.id
          }
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'The role could not be updated.'));
        return;
      }

      await onUpdated();
      showToast({
        title: 'Role updated',
        tone: 'success'
      });
    } catch {
      setError('The role could not be updated. Check your connection and retry.');
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
      <Alert
        description={
          assignedCount === 0
            ? 'This role has no active grants.'
            : `Changes apply to ${assignedCount} active ${assignedCount === 1 ? 'grant' : 'grants'}.`
        }
        title={assignedCount === 0 ? 'Unassigned role' : 'Assigned role'}
        tone={assignedCount === 0 ? 'info' : 'warning'}
      />
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
      {authorityMismatch ? (
        <Alert
          description="Platform management permission is required when an assigned role gains or loses platform authority."
          title="Platform authority change blocked"
          tone="danger"
        />
      ) : null}
      {removesLastManager ? (
        <Alert
          description="Grant platform authority through another role or account first."
          title="The organization must retain an active platform manager."
          tone="danger"
        />
      ) : null}
      {error ? <Alert title={error} tone="danger" /> : null}
      <Button
        isDisabled={authorityMismatch || removesLastManager}
        isLoading={isSubmitting}
        type="submit"
      >
        Save role
      </Button>
    </Form>
  );
}

function RolePermissions({ role }: { role: ManagedRole }) {
  return (
    <div className="grid gap-4">
      <dl className="m-0 grid gap-2 rounded-lg border border-border-subtle bg-surface-sunken p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-4">
          <dt className="text-text-muted">Key</dt>
          <dd className="m-0 font-mono text-xs text-text">{role.key}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-4">
          <dt className="text-text-muted">Source</dt>
          <dd className="m-0 text-text">{role.built_in ? 'Built in' : 'Custom'}</dd>
        </div>
      </dl>
      <div className="grid gap-2">
        <h3 className="m-0 text-sm font-semibold text-text">Permissions</h3>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {role.permissions.map((permission) => (
            <li key={permission}>
              <Badge>{permission}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CreateGrantForm({
  canPlatformManage,
  grants,
  isTeamsLoading,
  onCreated,
  roles,
  teamError,
  teams,
  users
}: {
  canPlatformManage: boolean;
  grants: ManagedGrant[];
  isTeamsLoading: boolean;
  onCreated: () => Promise<void>;
  roles: ManagedRole[];
  teamError: string | null;
  teams: TeamSummary[];
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
    setValue,
    formState: { errors }
  } = useForm<GrantValues>({
    defaultValues: {
      event_id: events[0]?.id ?? '',
      role_id: roles[0]?.id ?? '',
      scope_kind: 'organization',
      team_id: teams[0]?.id ?? '',
      user_id: users[0]?.id ?? ''
    }
  });
  const roleId = useWatch({
    control,
    name: 'role_id'
  });
  const scopeKind = useWatch({
    control,
    name: 'scope_kind'
  });
  const eventId = useWatch({
    control,
    name: 'event_id'
  });
  const teamId = useWatch({
    control,
    name: 'team_id'
  });
  const userId = useWatch({
    control,
    name: 'user_id'
  });
  const selectedRole = roles.find((role) => role.id === roleId);
  const platformRole = roleHasPlatformAuthority(selectedRole);
  const authorityMismatch = platformRole && !canPlatformManage;
  const invalidPlatformScope = platformRole && scopeKind !== 'organization';
  const scope = grantScopeSelection(scopeKind, eventId, teamId);
  const missingScopeResource =
    ((scopeKind === 'event' || scopeKind === 'event_team') && !scope.eventId) ||
    ((scopeKind === 'team' || scopeKind === 'event_team') && !scope.teamId);
  const duplicate = grantAlreadyExists(grants, userId, roleId, scope);

  useEffect(() => {
    if (platformRole && scopeKind !== 'organization') {
      setValue('scope_kind', 'organization');
    }
  }, [platformRole, scopeKind, setValue]);

  const submit = handleSubmit(async (values) => {
    const parsed = grantSchema.safeParse(values);
    const parsedScope = parsed.success
      ? grantScopeSelection(parsed.data.scope_kind, parsed.data.event_id, parsed.data.team_id)
      : null;

    if (
      !parsed.success ||
      !parsedScope ||
      !session?.csrf_token ||
      authorityMismatch ||
      invalidPlatformScope ||
      missingScopeResource ||
      duplicate
    ) {
      setError('Choose a valid user, role, and scope.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.POST('/api/v1/admin/role-grants', {
        body: createGrantInput(parsed.data.user_id, parsed.data.role_id, parsedScope),
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
              description: roleHasPlatformAuthority(role)
                ? 'Organization scope only'
                : `${role.permissions.length} permissions`,
              id: role.id,
              label: role.name
            }))}
            selectedKey={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="scope_kind"
        render={({ field }) => (
          <Select
            description={
              platformRole
                ? 'Platform authority can only use organization scope.'
                : 'Limit the role to an event, team, or both.'
            }
            label="Scope"
            onSelectionChange={(key) => {
              field.onChange(String(key));
            }}
            options={[
              {
                id: 'organization',
                label: 'Organization'
              },
              ...(events.length > 0
                ? [
                    {
                      id: 'event',
                      label: 'Event'
                    }
                  ]
                : []),
              ...(teams.length > 0
                ? [
                    {
                      id: 'team',
                      label: 'Team'
                    }
                  ]
                : []),
              ...(events.length > 0 && teams.length > 0
                ? [
                    {
                      id: 'event_team',
                      label: 'Event and team'
                    }
                  ]
                : [])
            ]}
            selectedKey={field.value}
          />
        )}
      />
      {scopeKind === 'event' || scopeKind === 'event_team' ? (
        <Controller
          control={control}
          name="event_id"
          render={({ field }) => (
            <Select
              label="Event"
              onSelectionChange={(key) => {
                field.onChange(String(key));
              }}
              options={events.map((event) => ({
                id: event.id,
                label: event.name
              }))}
              selectedKey={field.value}
            />
          )}
        />
      ) : null}
      {scopeKind === 'team' || scopeKind === 'event_team' ? (
        <Controller
          control={control}
          name="team_id"
          render={({ field }) => (
            <Select
              label="Team"
              onSelectionChange={(key) => {
                field.onChange(String(key));
              }}
              options={teams.map((team) => ({
                description: `${team.members.length} ${team.members.length === 1 ? 'member' : 'members'}`,
                id: team.id,
                label: team.name
              }))}
              selectedKey={field.value}
            />
          )}
        />
      ) : null}
      <Alert
        description={selectedScopeSummary(
          scope,
          events.map((event) => ({ id: event.id, name: event.name })),
          teams.map((team) => ({ id: team.id, name: team.name }))
        )}
        title="Grant scope"
      />
      {authorityMismatch ? (
        <Alert
          description="Platform management permission is required to assign this role."
          title="Platform authority"
          tone="danger"
        />
      ) : null}
      {isTeamsLoading ? <Alert title="Team scopes are loading." /> : null}
      {teamError ? (
        <Alert description={teamError} title="Team scopes are unavailable." tone="warning" />
      ) : null}
      {duplicate ? (
        <Alert title="This account already has the role at the selected scope." tone="danger" />
      ) : null}
      {errors.user_id || errors.role_id ? (
        <Alert title="Choose a user and role." tone="danger" />
      ) : null}
      {error ? <Alert title={error} tone="danger" /> : null}
      <Button
        isDisabled={authorityMismatch || duplicate || invalidPlatformScope || missingScopeResource}
        isLoading={isSubmitting}
        type="submit"
      >
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
  const canPlatformManage = can('platform_manage');
  const canTeamManage = can('team_manage');
  const hasIdentityManagement = can('identity_manage');
  const [error, setError] = useState(initialError);
  const [grants, setGrants] = useState(initialGrants);
  const [permissions, setPermissions] = useState(initialPermissions);
  const [roles, setRoles] = useState(initialRoles);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [users, setUsers] = useState(initialUsers);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountQuery, setAccountQuery] = useState('');
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [grantQuery, setGrantQuery] = useState('');
  const [grantOpen, setGrantOpen] = useState(false);
  const [roleQuery, setRoleQuery] = useState('');
  const [roleOpen, setRoleOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTeamsLoading, setIsTeamsLoading] = useState(hasIdentityManagement && canTeamManage);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(
    canTeamManage ? null : 'Team-scoped grants require team management permission.'
  );
  const userNames = useMemo(
    () => new Map(users.map((user) => [user.id, user.display_name])),
    [users]
  );
  const eventNames = useMemo(
    () => new Map(events.map((event) => [event.id, event.name])),
    [events]
  );
  const teamNames = useMemo(() => new Map(teams.map((team) => [team.id, team.name])), [teams]);
  const visibleUsers = useMemo(
    () => filterManagedUsers(users, accountQuery),
    [accountQuery, users]
  );
  const visibleRoles = useMemo(() => filterManagedRoles(roles, roleQuery), [roleQuery, roles]);
  const visibleGrants = useMemo(
    () => filterManagedGrants(grants, grantQuery, userNames, eventNames, teamNames),
    [eventNames, grantQuery, grants, teamNames, userNames]
  );

  useEffect(() => {
    if (!hasIdentityManagement || !canTeamManage) {
      return;
    }

    let active = true;
    void api
      .GET('/api/v1/admin/teams')
      .then((result) => {
        if (!active) {
          return;
        }

        if (!result.data) {
          setTeamError(
            errorMessage(result.error, 'Team scopes could not be loaded. Retry the inventory.')
          );
          return;
        }

        setTeams(result.data);
        setTeamError(null);
      })
      .catch(() => {
        if (active) {
          setTeamError('Team scopes could not be loaded. Check your connection and retry.');
        }
      })
      .finally(() => {
        if (active) {
          setIsTeamsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [canTeamManage, hasIdentityManagement]);

  const refresh = async () => {
    setIsLoading(true);
    setError(null);
    if (canTeamManage) {
      setIsTeamsLoading(true);
      setTeamError(null);
    }

    try {
      const [userResult, roleResult, grantResult, permissionResult, teamResult] = await Promise.all(
        [
          api.GET('/api/v1/admin/users'),
          api.GET('/api/v1/admin/roles'),
          api.GET('/api/v1/admin/role-grants'),
          api.GET('/api/v1/admin/permissions'),
          canTeamManage ? api.GET('/api/v1/admin/teams') : Promise.resolve(null)
        ]
      );

      if (!userResult.data || !roleResult.data || !grantResult.data || !permissionResult.data) {
        setError('Access inventory could not be loaded.');
        return;
      }

      setUsers(userResult.data);
      setRoles(roleResult.data);
      setGrants(grantResult.data);
      setPermissions(permissionResult.data);
      if (teamResult?.data) {
        setTeams(teamResult.data);
      } else if (teamResult) {
        setTeamError(
          errorMessage(teamResult.error, 'Team scopes could not be loaded. Retry the inventory.')
        );
      }
    } catch {
      setError('Access inventory could not be loaded. Check your connection and retry.');
    } finally {
      setIsLoading(false);
      setIsTeamsLoading(false);
    }
  };

  const deleteRole = async (role: ManagedRole) => {
    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    if (role.built_in || roleGrantCount(role.id, grants) > 0) {
      setError('Revoke every grant from this custom role before deleting it.');
      return;
    }

    setPendingAction(role.id);
    setError(null);

    try {
      const result = await api.DELETE('/api/v1/admin/roles/{role_id}', {
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            role_id: role.id
          }
        }
      });

      if (result.error) {
        setError(errorMessage(result.error, 'The role could not be deleted.'));
        return;
      }

      await refresh();
      showToast({
        title: 'Role deleted',
        tone: 'success'
      });
    } catch {
      setError('The role could not be deleted. Check your connection and retry.');
    } finally {
      setPendingAction(null);
    }
  };

  const revokeGrant = async (grant: ManagedGrant) => {
    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    if (grantHasPlatformAuthority(grant, roles) && !canPlatformManage) {
      setError('Platform management permission is required to revoke this grant.');
      return;
    }

    if (revokingGrantWouldRemoveLastPlatformManager(grant, users, grants, roles)) {
      setError('The organization must retain an active platform manager.');
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

  if (!hasIdentityManagement) {
    return (
      <Alert
        description="Identity management permission is required to inspect or change accounts, roles, and grants."
        title="Access management is unavailable for this account."
        tone="danger"
      />
    );
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
        {users.length > 0 ? (
          <SearchField
            label="Filter accounts"
            onChange={setAccountQuery}
            placeholder="Name, email, verification, or status"
            value={accountQuery}
          />
        ) : null}
        {users.length === 0 ? (
          <EmptyState description="Create the first managed account." title="No accounts" />
        ) : visibleUsers.length === 0 ? (
          <EmptyState
            description="Change or clear the account filter."
            title="No matching accounts"
          />
        ) : (
          <Table aria-label="Managed accounts">
            <TableHeader>
              <TableColumn isRowHeader>Account</TableColumn>
              <TableColumn>Email</TableColumn>
              <TableColumn>Verification</TableColumn>
              <TableColumn>Status</TableColumn>
              <TableColumn>Actions</TableColumn>
            </TableHeader>
            <TableBody emptyState="No accounts.">
              {visibleUsers.map((user) => (
                <TableRow id={user.id} key={user.id}>
                  <TableCell>{user.display_name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge tone={user.email_verified ? 'success' : 'warning'}>
                      {user.email_verified ? 'Verified' : 'Unverified'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge tone={user.disabled ? 'danger' : 'success'}>
                      {user.disabled ? 'Disabled' : 'Active'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      {user.id === session?.user.id ? (
                        <Badge tone="info">Current account</Badge>
                      ) : null}
                      {userHasPlatformAuthority(user.id, grants, roles) ? (
                        <Badge tone="warning">Platform authority</Badge>
                      ) : null}
                      <DialogTrigger
                        isOpen={editingUserId === user.id}
                        onOpenChange={(open) => {
                          setEditingUserId(open ? user.id : null);
                        }}
                      >
                        <Button isDisabled={pendingAction !== null} size="small" tone="secondary">
                          Manage
                        </Button>
                        <Dialog
                          description="Email addresses cannot be changed through the managed-user API."
                          title={`Manage ${user.display_name}`}
                        >
                          <EditUserForm
                            canPlatformManage={canPlatformManage}
                            currentUserId={session?.user.id}
                            grants={grants}
                            onUpdated={async () => {
                              await refresh();
                              setEditingUserId(null);
                            }}
                            roles={roles}
                            user={user}
                            users={users}
                          />
                        </Dialog>
                      </DialogTrigger>
                    </div>
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
        {roles.length > 0 ? (
          <SearchField
            label="Filter roles"
            onChange={setRoleQuery}
            placeholder="Name, key, source, or permission"
            value={roleQuery}
          />
        ) : null}
        {roles.length === 0 ? (
          <EmptyState description="Create a custom role to group permissions." title="No roles" />
        ) : visibleRoles.length === 0 ? (
          <EmptyState description="Change or clear the role filter." title="No matching roles" />
        ) : (
          <Table aria-label="Access roles">
            <TableHeader>
              <TableColumn isRowHeader>Role</TableColumn>
              <TableColumn>Key</TableColumn>
              <TableColumn>Permissions</TableColumn>
              <TableColumn>Grants</TableColumn>
              <TableColumn>Source</TableColumn>
              <TableColumn>Actions</TableColumn>
            </TableHeader>
            <TableBody emptyState="No roles.">
              {visibleRoles.map((role) => {
                const assignedCount = roleGrantCount(role.id, grants);

                return (
                  <TableRow id={role.id} key={role.id}>
                    <TableCell>{role.name}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{role.key}</span>
                    </TableCell>
                    <TableCell>{role.permissions.length}</TableCell>
                    <TableCell>{assignedCount}</TableCell>
                    <TableCell>{role.built_in ? 'Built in' : 'Custom'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <DialogTrigger
                          isOpen={editingRoleId === role.id}
                          onOpenChange={(open) => {
                            setEditingRoleId(open ? role.id : null);
                          }}
                        >
                          <Button isDisabled={pendingAction !== null} size="small" tone="secondary">
                            {role.built_in ? 'Inspect' : 'Manage'}
                          </Button>
                          <Dialog
                            description={
                              role.built_in ? 'Built-in roles are managed by Kitsune.' : undefined
                            }
                            title={role.name}
                          >
                            {role.built_in ? (
                              <RolePermissions role={role} />
                            ) : (
                              <EditRoleForm
                                canPlatformManage={canPlatformManage}
                                grants={grants}
                                onUpdated={async () => {
                                  await refresh();
                                  setEditingRoleId(null);
                                }}
                                permissions={permissions}
                                role={role}
                                roles={roles}
                                users={users}
                              />
                            )}
                          </Dialog>
                        </DialogTrigger>
                        {!role.built_in && assignedCount === 0 ? (
                          <DialogTrigger>
                            <Button isDisabled={pendingAction !== null} size="small" tone="danger">
                              Delete
                            </Button>
                            <AlertDialog
                              actions={
                                <>
                                  <Button slot="close" tone="quiet">
                                    Keep role
                                  </Button>
                                  <Button
                                    onPress={() => {
                                      void deleteRole(role);
                                    }}
                                    slot="close"
                                    tone="danger"
                                  >
                                    Delete role
                                  </Button>
                                </>
                              }
                              description={`${role.name} will be removed. This cannot be undone.`}
                              title="Delete role?"
                            />
                          </DialogTrigger>
                        ) : !role.built_in ? (
                          <span className="text-sm text-text-muted">
                            Revoke {assignedCount} {assignedCount === 1 ? 'grant' : 'grants'} to
                            delete
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
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
                canPlatformManage={canPlatformManage}
                grants={grants}
                isTeamsLoading={isTeamsLoading}
                onCreated={async () => {
                  await refresh();
                  setGrantOpen(false);
                }}
                roles={roles}
                teamError={teamError}
                teams={teams}
                users={users}
              />
            </Dialog>
          </DialogTrigger>
        </div>
        {grants.length > 0 ? (
          <SearchField
            label="Filter role grants"
            onChange={setGrantQuery}
            placeholder="Account, role, event, or team"
            value={grantQuery}
          />
        ) : null}
        {grants.length === 0 ? (
          <EmptyState description="Assign a role to a managed account." title="No role grants" />
        ) : visibleGrants.length === 0 ? (
          <EmptyState
            description="Change or clear the role grant filter."
            title="No matching role grants"
          />
        ) : (
          <Table aria-label="Role grants">
            <TableHeader>
              <TableColumn isRowHeader>Account</TableColumn>
              <TableColumn>Role</TableColumn>
              <TableColumn>Scope</TableColumn>
              <TableColumn>Actions</TableColumn>
            </TableHeader>
            <TableBody emptyState="No role grants.">
              {visibleGrants.map((grant) => {
                const platformGrant = grantHasPlatformAuthority(grant, roles);
                const removesLastManager = revokingGrantWouldRemoveLastPlatformManager(
                  grant,
                  users,
                  grants,
                  roles
                );
                const scopeSummary = grantScopeSummary(grant, eventNames, teamNames);

                return (
                  <TableRow id={grant.id} key={grant.id}>
                    <TableCell>{userNames.get(grant.user_id) ?? grant.user_id}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{grant.role_name}</span>
                        {platformGrant ? <Badge tone="warning">Platform authority</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>{scopeSummary}</TableCell>
                    <TableCell>
                      {platformGrant && !canPlatformManage ? (
                        <span className="text-sm text-text-muted">
                          Platform permission required
                        </span>
                      ) : removesLastManager ? (
                        <span className="text-sm text-text-muted">Last active manager</span>
                      ) : (
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
                            description={`${grant.role_name} access at ${scopeSummary.toLocaleLowerCase()} scope will be removed from ${userNames.get(grant.user_id) ?? 'this account'}.`}
                            title="Revoke role?"
                          />
                        </DialogTrigger>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
