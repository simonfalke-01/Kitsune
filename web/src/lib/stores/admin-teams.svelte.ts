import {
  api,
  errorMessage,
  type AdminMemberTransferInput,
  type AdminTeamMergeInput,
  type TeamSummary
} from '$lib/api/client';
import { session } from '$lib/stores/session.svelte';

class AdminTeamsStore {
  teams = $state<TeamSummary[]>([]);
  loading = $state(false);
  saving = $state(false);
  error = $state<string | null>(null);

  async load(): Promise<void> {
    await session.bootstrap();
    if (!session.can('team_manage')) {
      return;
    }
    this.loading = true;
    this.error = null;
    const { data, error } = await api.GET('/api/v1/admin/teams');
    this.loading = false;
    if (!data) {
      this.error = errorMessage(error, 'Team operations could not be loaded.');
      return;
    }
    this.teams = data;
  }

  async transferMember(
    sourceTeamId: string,
    userId: string,
    input: AdminMemberTransferInput
  ): Promise<boolean> {
    const csrf = session.current?.csrf_token;
    if (!csrf) {
      return this.authenticationFailure();
    }
    this.saving = true;
    this.error = null;
    const { data, error } = await api.POST(
      '/api/v1/admin/teams/{source_team_id}/members/{user_id}/transfer',
      {
        params: { path: { source_team_id: sourceTeamId, user_id: userId } },
        headers: { 'x-csrf-token': csrf },
        body: input
      }
    );
    this.saving = false;
    if (!data) {
      this.error = errorMessage(error, 'The member could not be transferred.');
      return false;
    }
    this.replace(data.source);
    this.replace(data.target);
    return true;
  }

  async merge(sourceTeamId: string, input: AdminTeamMergeInput): Promise<boolean> {
    const csrf = session.current?.csrf_token;
    if (!csrf) {
      return this.authenticationFailure();
    }
    this.saving = true;
    this.error = null;
    const { data, error } = await api.POST('/api/v1/admin/teams/{source_team_id}/merge', {
      params: { path: { source_team_id: sourceTeamId } },
      headers: { 'x-csrf-token': csrf },
      body: input
    });
    this.saving = false;
    if (!data) {
      this.error = errorMessage(error, 'The teams could not be merged.');
      return false;
    }
    this.teams = this.teams
      .filter((team) => team.id !== sourceTeamId && team.id !== data.id)
      .concat(data)
      .sort((left, right) => left.name.localeCompare(right.name));
    return true;
  }

  private replace(team: TeamSummary): void {
    this.teams = this.teams
      .filter((candidate) => candidate.id !== team.id)
      .concat(team)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private authenticationFailure(): false {
    this.error = 'Your session expired. Sign in again before changing team ownership.';
    return false;
  }
}

export const adminTeams = new AdminTeamsStore();
