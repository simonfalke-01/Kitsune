import { describe, expect, it } from 'vitest';

import type { ManagedGrant, ManagedRole, ManagedUser } from './api/client';
import {
  createGrantInput,
  disablingUserWouldRemoveLastPlatformManager,
  filterManagedGrants,
  grantScopeSelection,
  grantScopeSummary,
  parseCustomFields,
  removingRolePlatformAuthorityWouldRemoveLastManager,
  revokingGrantWouldRemoveLastPlatformManager,
  roleHasPlatformAuthority,
  selectedScopeSummary,
  userHasPlatformAuthority
} from './admin-access';

const platformRole: ManagedRole = {
  built_in: true,
  id: 'role-platform',
  key: 'super_admin',
  name: 'Super Admin',
  permissions: ['identity_manage', 'platform_manage']
};

const eventRole: ManagedRole = {
  built_in: false,
  id: 'role-event',
  key: 'event_operator',
  name: 'Event Operator',
  permissions: ['event_manage']
};

const primaryUser: ManagedUser = {
  created_at: '2026-07-27T00:00:00Z',
  custom_fields: {},
  disabled: false,
  display_name: 'Aster',
  email: 'aster@example.com',
  email_verified: true,
  id: 'user-1',
  updated_at: '2026-07-27T00:00:00Z'
};

const secondaryUser: ManagedUser = {
  created_at: '2026-07-27T00:00:00Z',
  custom_fields: {},
  disabled: false,
  display_name: 'Bramble',
  email: 'bramble@example.com',
  email_verified: true,
  id: 'user-2',
  updated_at: '2026-07-27T00:00:00Z'
};

const users = [primaryUser, secondaryUser];

const platformGrant: ManagedGrant = {
  event_id: null,
  granted_at: '2026-07-27T00:00:00Z',
  granted_by: null,
  id: 'grant-platform',
  role_id: platformRole.id,
  role_key: platformRole.key,
  role_name: platformRole.name,
  team_id: null,
  user_id: primaryUser.id
};

const eventTeamGrant: ManagedGrant = {
  event_id: 'event-1',
  granted_at: '2026-07-27T00:00:00Z',
  granted_by: primaryUser.id,
  id: 'grant-event-team',
  role_id: eventRole.id,
  role_key: eventRole.key,
  role_name: eventRole.name,
  team_id: 'team-1',
  user_id: secondaryUser.id
};

const grants = [platformGrant, eventTeamGrant];

describe('admin access helpers', () => {
  it('validates custom fields against the managed-user API contract', () => {
    expect(parseCustomFields('{"division":"open"}')).toEqual({
      data: {
        division: 'open'
      },
      success: true
    });
    expect(parseCustomFields('[]')).toEqual({
      error: 'Custom fields must be a JSON object.',
      success: false
    });
    expect(parseCustomFields('{')).toEqual({
      error: 'Enter a valid JSON object.',
      success: false
    });
    expect(
      parseCustomFields(
        JSON.stringify(
          Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`key-${index}`, index]))
        )
      )
    ).toEqual({
      error: 'Use at most 32 fields, 64 bytes per key, and 16 KiB total.',
      success: false
    });
  });

  it('maps organization, event, team, and combined grant scopes', () => {
    const organizationScope = grantScopeSelection('organization', 'ignored-event', 'ignored-team');
    const eventScope = grantScopeSelection('event', 'event-1', 'ignored-team');
    const teamScope = grantScopeSelection('team', 'ignored-event', 'team-1');
    const combinedScope = grantScopeSelection('event_team', 'event-1', 'team-1');

    expect(createGrantInput('user-1', 'role-1', organizationScope)).toEqual({
      event_id: null,
      role_id: 'role-1',
      team_id: null,
      user_id: 'user-1'
    });
    expect(createGrantInput('user-1', 'role-1', eventScope)).toMatchObject({
      event_id: 'event-1',
      team_id: null
    });
    expect(createGrantInput('user-1', 'role-1', teamScope)).toMatchObject({
      event_id: null,
      team_id: 'team-1'
    });
    expect(createGrantInput('user-1', 'role-1', combinedScope)).toMatchObject({
      event_id: 'event-1',
      team_id: 'team-1'
    });
    expect(
      selectedScopeSummary(
        combinedScope,
        [{ id: 'event-1', name: 'Finals' }],
        [{ id: 'team-1', name: 'Foxfire' }]
      )
    ).toBe('Event: Finals, team: Foxfire');
  });

  it('summarizes and filters grants by account, role, event, and team', () => {
    const userNames = new Map(users.map((user) => [user.id, user.display_name]));
    const eventNames = new Map([['event-1', 'Finals']]);
    const teamNames = new Map([['team-1', 'Foxfire']]);

    expect(grantScopeSummary(platformGrant, eventNames, teamNames)).toBe('Organization');
    expect(grantScopeSummary(eventTeamGrant, eventNames, teamNames)).toBe(
      'Event: Finals, team: Foxfire'
    );
    expect(filterManagedGrants(grants, 'bramble', userNames, eventNames, teamNames)).toEqual([
      eventTeamGrant
    ]);
    expect(filterManagedGrants(grants, 'foxfire', userNames, eventNames, teamNames)).toEqual([
      eventTeamGrant
    ]);
  });

  it('identifies platform authority and protects the last active manager', () => {
    const roles = [platformRole, eventRole];

    expect(roleHasPlatformAuthority(platformRole)).toBe(true);
    expect(userHasPlatformAuthority(primaryUser.id, grants, roles)).toBe(true);
    expect(disablingUserWouldRemoveLastPlatformManager(primaryUser, users, grants, roles)).toBe(
      true
    );
    expect(revokingGrantWouldRemoveLastPlatformManager(platformGrant, users, grants, roles)).toBe(
      true
    );
    expect(
      removingRolePlatformAuthorityWouldRemoveLastManager(platformRole, users, grants, roles)
    ).toBe(true);
    expect(revokingGrantWouldRemoveLastPlatformManager(eventTeamGrant, users, grants, roles)).toBe(
      false
    );
  });
});
