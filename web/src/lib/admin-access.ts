import type { CreateGrantInput, ManagedGrant, ManagedRole, ManagedUser } from './api/client';

export type GrantScopeKind = 'event' | 'event_team' | 'organization' | 'team';

export interface GrantScopeSelection {
  eventId: string | null;
  kind: GrantScopeKind;
  teamId: string | null;
}

export interface NamedAccessResource {
  id: string;
  name: string;
}

export type CustomFieldsParseResult =
  | {
      data: Record<string, unknown>;
      success: true;
    }
  | {
      error: string;
      success: false;
    };

const customFieldsByteLimit = 16 * 1024;
const customFieldsCountLimit = 32;
const customFieldKeyByteLimit = 64;

function normalizedQuery(query: string): string {
  return query.trim().toLocaleLowerCase();
}

function includesQuery(values: Array<boolean | null | number | string | undefined>, query: string) {
  const normalized = normalizedQuery(query);

  if (!normalized) {
    return true;
  }

  return values.some((value) =>
    String(value ?? '')
      .toLocaleLowerCase()
      .includes(normalized)
  );
}

export function filterManagedUsers(users: ManagedUser[], query: string): ManagedUser[] {
  return users.filter((user) =>
    includesQuery(
      [
        user.display_name,
        user.email,
        user.email_verified ? 'verified' : 'unverified',
        user.disabled ? 'disabled' : 'active'
      ],
      query
    )
  );
}

export function filterManagedRoles(roles: ManagedRole[], query: string): ManagedRole[] {
  return roles.filter((role) =>
    includesQuery(
      [role.name, role.key, role.built_in ? 'built in' : 'custom', ...role.permissions],
      query
    )
  );
}

export function filterManagedGrants(
  grants: ManagedGrant[],
  query: string,
  userNames: ReadonlyMap<string, string>,
  eventNames: ReadonlyMap<string, string>,
  teamNames: ReadonlyMap<string, string>
): ManagedGrant[] {
  return grants.filter((grant) =>
    includesQuery(
      [
        userNames.get(grant.user_id),
        grant.role_name,
        grant.role_key,
        grantScopeSummary(grant, eventNames, teamNames)
      ],
      query
    )
  );
}

export function formatCustomFields(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

export function parseCustomFields(value: string): CustomFieldsParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return {
      error: 'Enter a valid JSON object.',
      success: false
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      error: 'Custom fields must be a JSON object.',
      success: false
    };
  }

  const object = parsed as Record<string, unknown>;
  const keys = Object.keys(object);
  const encoder = new TextEncoder();

  if (
    keys.length > customFieldsCountLimit ||
    keys.some(
      (key) =>
        key.length === 0 ||
        encoder.encode(key).length > customFieldKeyByteLimit ||
        /\p{Cc}/u.test(key)
    ) ||
    encoder.encode(JSON.stringify(object)).length > customFieldsByteLimit
  ) {
    return {
      error: 'Use at most 32 fields, 64 bytes per key, and 16 KiB total.',
      success: false
    };
  }

  return {
    data: object,
    success: true
  };
}

export function roleHasPlatformAuthority(role: ManagedRole | undefined): boolean {
  return role?.permissions.includes('platform_manage') ?? false;
}

export function grantHasPlatformAuthority(grant: ManagedGrant, roles: ManagedRole[]): boolean {
  return roleHasPlatformAuthority(roles.find((role) => role.id === grant.role_id));
}

export function userHasPlatformAuthority(
  userId: string,
  grants: ManagedGrant[],
  roles: ManagedRole[]
): boolean {
  return grants.some(
    (grant) =>
      grant.user_id === userId &&
      !grant.event_id &&
      !grant.team_id &&
      grantHasPlatformAuthority(grant, roles)
  );
}

export function activePlatformManagerIds(
  users: ManagedUser[],
  grants: ManagedGrant[],
  roles: ManagedRole[]
): Set<string> {
  const activeUsers = new Set(users.filter((user) => !user.disabled).map((user) => user.id));

  return new Set(
    grants
      .filter(
        (grant) =>
          activeUsers.has(grant.user_id) &&
          !grant.event_id &&
          !grant.team_id &&
          grantHasPlatformAuthority(grant, roles)
      )
      .map((grant) => grant.user_id)
  );
}

export function disablingUserWouldRemoveLastPlatformManager(
  user: ManagedUser,
  users: ManagedUser[],
  grants: ManagedGrant[],
  roles: ManagedRole[]
): boolean {
  const activeManagerIds = activePlatformManagerIds(users, grants, roles);

  return !user.disabled && activeManagerIds.size === 1 && activeManagerIds.has(user.id);
}

export function revokingGrantWouldRemoveLastPlatformManager(
  grant: ManagedGrant,
  users: ManagedUser[],
  grants: ManagedGrant[],
  roles: ManagedRole[]
): boolean {
  const target = users.find((user) => user.id === grant.user_id);

  if (
    !target ||
    target.disabled ||
    grant.event_id ||
    grant.team_id ||
    !grantHasPlatformAuthority(grant, roles)
  ) {
    return false;
  }

  const hasAnotherPlatformGrant = grants.some(
    (candidate) =>
      candidate.id !== grant.id &&
      candidate.user_id === grant.user_id &&
      !candidate.event_id &&
      !candidate.team_id &&
      grantHasPlatformAuthority(candidate, roles)
  );

  return !hasAnotherPlatformGrant && activePlatformManagerIds(users, grants, roles).size === 1;
}

export function removingRolePlatformAuthorityWouldRemoveLastManager(
  role: ManagedRole,
  users: ManagedUser[],
  grants: ManagedGrant[],
  roles: ManagedRole[]
): boolean {
  if (!roleHasPlatformAuthority(role)) {
    return false;
  }

  const rolesWithoutPlatformPermission = roles.map((candidate) =>
    candidate.id === role.id
      ? {
          ...candidate,
          permissions: candidate.permissions.filter(
            (permission) => permission !== 'platform_manage'
          )
        }
      : candidate
  );

  return (
    activePlatformManagerIds(users, grants, roles).size > 0 &&
    activePlatformManagerIds(users, grants, rolesWithoutPlatformPermission).size === 0
  );
}

export function roleGrantCount(roleId: string, grants: ManagedGrant[]): number {
  return grants.filter((grant) => grant.role_id === roleId).length;
}

export function grantScopeSelection(
  kind: GrantScopeKind,
  eventId: string,
  teamId: string
): GrantScopeSelection {
  return {
    eventId: kind === 'event' || kind === 'event_team' ? eventId || null : null,
    kind,
    teamId: kind === 'team' || kind === 'event_team' ? teamId || null : null
  };
}

export function createGrantInput(
  userId: string,
  roleId: string,
  scope: GrantScopeSelection
): CreateGrantInput {
  return {
    event_id: scope.eventId,
    role_id: roleId,
    team_id: scope.teamId,
    user_id: userId
  };
}

export function grantScopeSummary(
  grant: Pick<ManagedGrant, 'event_id' | 'team_id'>,
  eventNames: ReadonlyMap<string, string>,
  teamNames: ReadonlyMap<string, string>
): string {
  const eventName = grant.event_id ? (eventNames.get(grant.event_id) ?? 'Unavailable event') : null;
  const teamName = grant.team_id ? (teamNames.get(grant.team_id) ?? 'Unavailable team') : null;

  if (eventName && teamName) {
    return `Event: ${eventName}, team: ${teamName}`;
  }

  if (eventName) {
    return `Event: ${eventName}`;
  }

  if (teamName) {
    return `Team: ${teamName}`;
  }

  return 'Organization';
}

export function selectedScopeSummary(
  scope: GrantScopeSelection,
  events: NamedAccessResource[],
  teams: NamedAccessResource[]
): string {
  return grantScopeSummary(
    {
      event_id: scope.eventId,
      team_id: scope.teamId
    },
    new Map(events.map((event) => [event.id, event.name])),
    new Map(teams.map((team) => [team.id, team.name]))
  );
}

export function grantAlreadyExists(
  grants: ManagedGrant[],
  userId: string,
  roleId: string,
  scope: GrantScopeSelection
): boolean {
  return grants.some(
    (grant) =>
      grant.user_id === userId &&
      grant.role_id === roleId &&
      (grant.event_id ?? null) === scope.eventId &&
      (grant.team_id ?? null) === scope.teamId
  );
}
