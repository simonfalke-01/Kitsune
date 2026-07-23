import {
  api,
  errorMessage,
  type CreateGrantInput,
  type CreateManagedUserInput,
  type ManagedGrant,
  type ManagedPermission,
  type ManagedRole,
  type ManagedUser,
  type RoleMutationInput,
  type UpdateManagedUserInput
} from '$lib/api/client';
import { session } from '$lib/stores/session.svelte';

class IdentityAdminStore {
  users = $state<ManagedUser[]>([]);
  roles = $state<ManagedRole[]>([]);
  grants = $state<ManagedGrant[]>([]);
  permissions = $state<ManagedPermission[]>([]);
  loading = $state(false);
  saving = $state(false);
  error = $state<string | null>(null);

  async load(): Promise<void> {
    await session.bootstrap();
    if (!session.can('identity_manage')) {
      this.error = 'Your role does not include identity administration.';
      return;
    }
    this.loading = true;
    this.error = null;
    const [users, roles, grants, permissions] = await Promise.all([
      api.GET('/api/v1/admin/users'),
      api.GET('/api/v1/admin/roles'),
      api.GET('/api/v1/admin/role-grants'),
      api.GET('/api/v1/admin/permissions')
    ]);
    this.loading = false;
    if (!users.data || !roles.data || !grants.data || !permissions.data) {
      this.error =
        errorMessage(users.error, '') ||
        errorMessage(roles.error, '') ||
        errorMessage(grants.error, '') ||
        errorMessage(permissions.error, 'Identity administration could not be loaded.');
      return;
    }
    this.users = users.data;
    this.roles = roles.data;
    this.grants = grants.data;
    this.permissions = permissions.data;
  }

  async createUser(input: CreateManagedUserInput): Promise<boolean> {
    const csrf = this.csrf();
    if (!csrf) {
      return false;
    }
    this.beginSave();
    const { data, error } = await api.POST('/api/v1/admin/users', {
      headers: { 'x-csrf-token': csrf },
      body: input
    });
    this.saving = false;
    if (!data) {
      this.error = errorMessage(error, 'The account could not be created.');
      return false;
    }
    this.users = [data, ...this.users];
    await this.reloadGrants();
    return true;
  }

  async updateUser(userId: string, input: UpdateManagedUserInput): Promise<boolean> {
    const csrf = this.csrf();
    if (!csrf) {
      return false;
    }
    this.beginSave();
    const { data, error } = await api.PATCH('/api/v1/admin/users/{user_id}', {
      params: { path: { user_id: userId } },
      headers: { 'x-csrf-token': csrf },
      body: input
    });
    this.saving = false;
    if (!data) {
      this.error = errorMessage(error, 'The account could not be updated.');
      return false;
    }
    this.users = this.users.map((user) => (user.id === data.id ? data : user));
    return true;
  }

  async createRole(input: RoleMutationInput): Promise<boolean> {
    const csrf = this.csrf();
    if (!csrf) {
      return false;
    }
    this.beginSave();
    const { data, error } = await api.POST('/api/v1/admin/roles', {
      headers: { 'x-csrf-token': csrf },
      body: input
    });
    this.saving = false;
    if (!data) {
      this.error = errorMessage(error, 'The role could not be created.');
      return false;
    }
    this.roles = sortRoles(this.roles.concat(data));
    return true;
  }

  async updateRole(roleId: string, input: RoleMutationInput): Promise<boolean> {
    const csrf = this.csrf();
    if (!csrf) {
      return false;
    }
    this.beginSave();
    const { data, error } = await api.PUT('/api/v1/admin/roles/{role_id}', {
      params: { path: { role_id: roleId } },
      headers: { 'x-csrf-token': csrf },
      body: input
    });
    this.saving = false;
    if (!data) {
      this.error = errorMessage(error, 'The role could not be updated.');
      return false;
    }
    this.roles = sortRoles(this.roles.map((role) => (role.id === data.id ? data : role)));
    return true;
  }

  async deleteRole(roleId: string): Promise<boolean> {
    const csrf = this.csrf();
    if (!csrf) {
      return false;
    }
    this.beginSave();
    const { error, response } = await api.DELETE('/api/v1/admin/roles/{role_id}', {
      params: { path: { role_id: roleId } },
      headers: { 'x-csrf-token': csrf }
    });
    this.saving = false;
    if (!response.ok) {
      this.error = errorMessage(error, 'The role could not be deleted.');
      return false;
    }
    this.roles = this.roles.filter((role) => role.id !== roleId);
    return true;
  }

  async createGrant(input: CreateGrantInput): Promise<boolean> {
    const csrf = this.csrf();
    if (!csrf) {
      return false;
    }
    this.beginSave();
    const { data, error } = await api.POST('/api/v1/admin/role-grants', {
      headers: { 'x-csrf-token': csrf },
      body: input
    });
    this.saving = false;
    if (!data) {
      this.error = errorMessage(error, 'The role assignment could not be created.');
      return false;
    }
    this.grants = [data, ...this.grants];
    return true;
  }

  async revokeGrant(grantId: string): Promise<boolean> {
    const csrf = this.csrf();
    if (!csrf) {
      return false;
    }
    this.beginSave();
    const { error, response } = await api.DELETE('/api/v1/admin/role-grants/{grant_id}', {
      params: { path: { grant_id: grantId } },
      headers: { 'x-csrf-token': csrf }
    });
    this.saving = false;
    if (!response.ok) {
      this.error = errorMessage(error, 'The role assignment could not be revoked.');
      return false;
    }
    this.grants = this.grants.filter((grant) => grant.id !== grantId);
    return true;
  }

  grantsForUser(userId: string): ManagedGrant[] {
    return this.grants.filter((grant) => grant.user_id === userId);
  }

  private async reloadGrants(): Promise<void> {
    const { data } = await api.GET('/api/v1/admin/role-grants');
    if (data) {
      this.grants = data;
    }
  }

  private beginSave(): void {
    this.saving = true;
    this.error = null;
  }

  private csrf(): string | null {
    const csrf = session.current?.csrf_token ?? null;
    if (!csrf) {
      this.error = 'Your session expired. Sign in again before changing access.';
    }
    return csrf;
  }
}

function sortRoles(roles: ManagedRole[]): ManagedRole[] {
  return roles.toSorted(
    (left, right) =>
      Number(right.built_in) - Number(left.built_in) || left.name.localeCompare(right.name)
  );
}

export const identityAdmin = new IdentityAdminStore();
