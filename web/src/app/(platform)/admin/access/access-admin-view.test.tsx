import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessAdminView } from './access-admin-view';
import type { ManagedGrant, ManagedPermission, ManagedRole, ManagedUser } from '@/lib/api/client';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  permissions: [] as string[]
}));

vi.mock('../../../event-context', () => ({
  useEvent: () => ({
    events: [
      {
        id: 'event-1',
        name: 'Finals'
      }
    ]
  })
}));

vi.mock('../../../session-context', () => ({
  useSession: () => ({
    can: (permission: string) => mocks.permissions.includes(permission),
    session: {
      csrf_token: 'csrf-token',
      user: {
        id: 'user-current'
      }
    }
  })
}));

vi.mock('@/lib/api/client', () => ({
  api: {
    DELETE: vi.fn(),
    GET: mocks.get,
    PATCH: vi.fn(),
    POST: vi.fn(),
    PUT: vi.fn()
  },
  errorMessage: (_error: unknown, fallback: string) => fallback
}));

const permissions: ManagedPermission[] = [
  {
    key: 'event_manage'
  },
  {
    key: 'identity_manage'
  },
  {
    key: 'platform_manage'
  }
];

const roles: ManagedRole[] = [
  {
    built_in: true,
    id: 'role-platform',
    key: 'super_admin',
    name: 'Super Admin',
    permissions: ['identity_manage', 'platform_manage']
  },
  {
    built_in: false,
    id: 'role-event',
    key: 'event_operator',
    name: 'Event Operator',
    permissions: ['event_manage']
  }
];

const users: ManagedUser[] = [
  {
    created_at: '2026-07-27T00:00:00Z',
    custom_fields: {},
    disabled: false,
    display_name: 'Aster',
    email: 'aster@example.com',
    email_verified: true,
    id: 'user-1',
    updated_at: '2026-07-27T00:00:00Z'
  },
  {
    created_at: '2026-07-27T00:00:00Z',
    custom_fields: {},
    disabled: false,
    display_name: 'Bramble',
    email: 'bramble@example.com',
    email_verified: false,
    id: 'user-2',
    updated_at: '2026-07-27T00:00:00Z'
  }
];

const grants: ManagedGrant[] = [
  {
    event_id: null,
    granted_at: '2026-07-27T00:00:00Z',
    granted_by: null,
    id: 'grant-platform',
    role_id: 'role-platform',
    role_key: 'super_admin',
    role_name: 'Super Admin',
    team_id: null,
    user_id: 'user-1'
  },
  {
    event_id: 'event-1',
    granted_at: '2026-07-27T00:00:00Z',
    granted_by: 'user-1',
    id: 'grant-event',
    role_id: 'role-event',
    role_key: 'event_operator',
    role_name: 'Event Operator',
    team_id: null,
    user_id: 'user-2'
  }
];

describe('AccessAdminView', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.permissions = [];
  });

  it('blocks the workspace without identity management permission', () => {
    render(
      <AccessAdminView
        initialError={null}
        initialGrants={[]}
        initialPermissions={[]}
        initialRoles={[]}
        initialUsers={[]}
      />
    );

    expect(screen.getByText('Access management is unavailable for this account.')).toBeVisible();
    expect(
      screen.getByText(
        'Identity management permission is required to inspect or change accounts, roles, and grants.'
      )
    ).toBeVisible();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('shows authority safeguards and scoped grant details', () => {
    mocks.permissions = ['identity_manage'];

    render(
      <AccessAdminView
        initialError={null}
        initialGrants={grants}
        initialPermissions={permissions}
        initialRoles={roles}
        initialUsers={users}
      />
    );

    expect(screen.getAllByText('Platform authority')).toHaveLength(2);
    expect(screen.getByText('Platform permission required')).toBeVisible();
    expect(screen.getByText('Event: Finals')).toBeVisible();
    expect(screen.getByText('Revoke 1 grant to delete')).toBeVisible();
  });

  it('reports a distinct empty state when an account filter has no matches', () => {
    mocks.permissions = ['identity_manage'];

    render(
      <AccessAdminView
        initialError={null}
        initialGrants={grants}
        initialPermissions={permissions}
        initialRoles={roles}
        initialUsers={users}
      />
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter accounts' }), {
      target: {
        value: 'no such account'
      }
    });

    expect(screen.getByText('No matching accounts')).toBeVisible();
    expect(screen.getByText('Change or clear the account filter.')).toBeVisible();
  });
});
