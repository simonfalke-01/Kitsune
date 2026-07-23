import { api, errorMessage } from '$lib/api/client';
import type { CreateTeamInput, JoinTeamInput, TeamSummary } from '$lib/api/client';
import { session } from '$lib/stores/session.svelte';

export function captainId(team: TeamSummary | null): string | null {
  return team?.members.find((member) => member.captain)?.user_id ?? null;
}

class TeamStore {
  teams = $state<TeamSummary[]>([]);
  inviteCode = $state<string | null>(null);
  loading = $state(false);
  saving = $state(false);
  error = $state<string | null>(null);

  get current(): TeamSummary | null {
    return this.teams[0] ?? null;
  }

  get isCaptain(): boolean {
    return captainId(this.current) === session.current?.user.id;
  }

  async load(): Promise<void> {
    if (!session.authenticated) {
      return;
    }
    this.loading = true;
    this.error = null;
    const { data, error } = await api.GET('/api/v1/teams');
    this.loading = false;
    if (!data) {
      this.error = errorMessage(error, 'Your team could not be loaded.');
      return;
    }
    this.teams = data;
  }

  async create(input: CreateTeamInput): Promise<boolean> {
    const csrf = session.current?.csrf_token;
    if (!csrf) {
      return this.authenticationFailure();
    }
    this.saving = true;
    this.error = null;
    const { data, error } = await api.POST('/api/v1/teams', {
      headers: { 'x-csrf-token': csrf },
      body: input
    });
    this.saving = false;
    if (!data) {
      this.error = errorMessage(error, 'The team could not be created.');
      return false;
    }
    this.teams = [data.team];
    this.inviteCode = data.invite_code;
    return true;
  }

  async join(input: JoinTeamInput): Promise<boolean> {
    const csrf = session.current?.csrf_token;
    if (!csrf) {
      return this.authenticationFailure();
    }
    this.saving = true;
    this.error = null;
    const { data, error } = await api.POST('/api/v1/teams/join', {
      headers: { 'x-csrf-token': csrf },
      body: input
    });
    this.saving = false;
    if (!data) {
      this.error = errorMessage(error, 'The invite code was not accepted.');
      return false;
    }
    this.teams = [data];
    this.inviteCode = null;
    return true;
  }

  async transferCaptain(userId: string): Promise<boolean> {
    const csrf = session.current?.csrf_token;
    const teamId = this.current?.id;
    if (!csrf || !teamId) {
      return this.authenticationFailure();
    }
    this.saving = true;
    this.error = null;
    const { data, error } = await api.POST('/api/v1/teams/{team_id}/captain', {
      params: { path: { team_id: teamId } },
      headers: { 'x-csrf-token': csrf },
      body: { user_id: userId }
    });
    this.saving = false;
    if (!data) {
      this.error = errorMessage(error, 'Captaincy could not be transferred.');
      return false;
    }
    this.teams = [data];
    return true;
  }

  async rotateInvite(): Promise<boolean> {
    const csrf = session.current?.csrf_token;
    const teamId = this.current?.id;
    if (!csrf || !teamId) {
      return this.authenticationFailure();
    }
    this.saving = true;
    this.error = null;
    const { data, error } = await api.POST('/api/v1/teams/{team_id}/invite', {
      params: { path: { team_id: teamId } },
      headers: { 'x-csrf-token': csrf }
    });
    this.saving = false;
    if (!data) {
      this.error = errorMessage(error, 'A replacement invite could not be created.');
      return false;
    }
    this.inviteCode = data.invite_code;
    return true;
  }

  async removeMember(userId: string): Promise<boolean> {
    const csrf = session.current?.csrf_token;
    const teamId = this.current?.id;
    if (!csrf || !teamId) {
      return this.authenticationFailure();
    }
    this.saving = true;
    this.error = null;
    const { data, error } = await api.DELETE('/api/v1/teams/{team_id}/members/{user_id}', {
      params: { path: { team_id: teamId, user_id: userId } },
      headers: { 'x-csrf-token': csrf }
    });
    this.saving = false;
    if (!data) {
      this.error = errorMessage(error, 'The member could not be removed.');
      return false;
    }
    this.teams = [data];
    return true;
  }

  async leave(): Promise<boolean> {
    const csrf = session.current?.csrf_token;
    const teamId = this.current?.id;
    if (!csrf || !teamId) {
      return this.authenticationFailure();
    }
    this.saving = true;
    this.error = null;
    const { response, error } = await api.DELETE('/api/v1/teams/{team_id}/membership', {
      params: { path: { team_id: teamId } },
      headers: { 'x-csrf-token': csrf }
    });
    this.saving = false;
    if (!response.ok) {
      this.error = errorMessage(error, 'The team could not be left.');
      return false;
    }
    this.teams = [];
    this.inviteCode = null;
    return true;
  }

  clear(): void {
    this.teams = [];
    this.inviteCode = null;
    this.error = null;
  }

  private authenticationFailure(): false {
    this.error = 'Your session expired. Sign in again before changing teams.';
    return false;
  }
}

export const team = new TeamStore();
