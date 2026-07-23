<script lang="ts">
  import { page } from '$app/state';
  import {
    ArrowLeft,
    CalendarDays,
    Crown,
    EyeOff,
    Flag,
    Medal,
    Shield,
    Users
  } from '@lucide/svelte';
  import Badge from '$lib/components/Badge.svelte';
  import Card from '$lib/components/Card.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { api, errorMessage, type CompetitorProfile } from '$lib/api/client';
  import { events } from '$lib/stores/events.svelte';
  import { session } from '$lib/stores/session.svelte';

  let profile = $state<CompetitorProfile | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let initialized = $state(false);
  let requestKey = $state<string | null>(null);

  $effect(() => {
    if (session.authenticated && !initialized) {
      initialized = true;
      void events.load();
    }
  });

  $effect(() => {
    const eventId = events.selectedEventId;
    const kind = page.params.kind;
    const competitorId = page.params.id;
    const nextKey = eventId && kind && competitorId ? `${eventId}:${kind}:${competitorId}` : null;
    if (
      session.authenticated &&
      eventId &&
      kind &&
      competitorId &&
      nextKey &&
      requestKey !== nextKey
    ) {
      requestKey = nextKey;
      void load(eventId, kind, competitorId);
    }
  });

  async function load(eventId: string, kind: string, competitorId: string): Promise<void> {
    loading = true;
    error = null;
    profile = null;
    const result = await api.GET(
      '/api/v1/events/{event_id}/competitors/{competitor_kind}/{competitor_id}',
      {
        params: {
          path: {
            event_id: eventId,
            competitor_kind: kind,
            competitor_id: competitorId
          }
        }
      }
    );
    if (`${eventId}:${kind}:${competitorId}` !== requestKey) {
      return;
    }
    loading = false;
    if (!result.data) {
      error = errorMessage(result.error, 'This competitor profile could not be loaded.');
      return;
    }
    profile = result.data;
  }

  function joinedLabel(value: string): string {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
</script>

<svelte:head>
  <title>{profile?.name ?? 'Competitor'} — Kitsune</title>
</svelte:head>

<div class="page profile-page">
  <a class="back-link" href="/scoreboard">
    <ArrowLeft size={15} />
    Back to scoreboard
  </a>

  {#if loading}
    <p class="status" role="status">Reading the competition trail…</p>
  {:else if error}
    <EmptyState title="Profile unavailable" detail={error} />
  {:else if profile}
    <header class="profile-header">
      <div class="avatar" aria-hidden="true">
        {#if profile.competitor_kind === 'team'}
          <Users size={28} />
        {:else}
          <Shield size={28} />
        {/if}
      </div>
      <div>
        <div class="identity-line">
          <h1>{profile.name}</h1>
          <Badge>{profile.competitor_kind}</Badge>
        </div>
        <p>
          <CalendarDays size={14} />
          On the trail since {joinedLabel(profile.created_at)}
        </p>
      </div>
    </header>

    {#if profile.scoreboard_hidden}
      <Card elevated>
        <div class="concealed">
          <EyeOff size={19} />
          <div>
            <strong>The scoreboard is veiled.</strong>
            <span>Identity stays visible; standings and solve activity remain concealed.</span>
          </div>
        </div>
      </Card>
    {:else if profile.standing}
      <section class="stats" aria-label="Event standing">
        <Card elevated>
          <span>Overall rank</span>
          <strong>#{profile.standing.rank}</strong>
        </Card>
        <Card elevated>
          <span>Visible score</span>
          <strong>{profile.standing.score.toLocaleString()}</strong>
        </Card>
        <Card elevated>
          <span>Solved</span>
          <strong>{profile.standing.solves}</strong>
        </Card>
      </section>
    {:else}
      <Card>
        <div class="unranked">
          <Medal size={18} />
          <span>No visible score yet.</span>
        </div>
      </Card>
    {/if}

    <div class="profile-grid">
      <Card elevated>
        <section class="panel" aria-labelledby="profile-context">
          <div class="panel-heading">
            <div>
              <span>Event identity</span>
              <h2 id="profile-context">Competition context</h2>
            </div>
            {#if profile.registration}
              <Badge tone="success">Registered</Badge>
            {/if}
          </div>
          {#if profile.registration}
            <dl>
              <div>
                <dt>Registered</dt>
                <dd>{joinedLabel(profile.registration.registered_at)}</dd>
              </div>
              <div>
                <dt>Division</dt>
                <dd>{profile.registration.division_name ?? 'Open'}</dd>
              </div>
              <div>
                <dt>Bracket</dt>
                <dd>{profile.registration.bracket_name ?? 'Unbracketed'}</dd>
              </div>
            </dl>
          {:else}
            <p class="muted">No direct registration for this identity in the selected event.</p>
          {/if}
        </section>
      </Card>

      <Card elevated>
        <section class="panel" aria-labelledby="profile-roster">
          <div class="panel-heading">
            <div>
              <span>{profile.competitor_kind === 'team' ? 'Roster' : 'Team identity'}</span>
              <h2 id="profile-roster">
                {profile.competitor_kind === 'team' ? 'Members' : 'Teams'}
              </h2>
            </div>
          </div>
          {#if profile.members.length}
            <div class="relationships">
              {#each profile.members as member (member.user_id)}
                <a href={`/competitors/user/${member.user_id}`}>
                  <div>
                    <strong>{member.display_name}</strong>
                    <span>Joined {joinedLabel(member.joined_at)}</span>
                  </div>
                  {#if member.captain}
                    <Badge tone="accent"><Crown size={11} /> Captain</Badge>
                  {/if}
                </a>
              {/each}
            </div>
          {:else if profile.teams.length}
            <div class="relationships">
              {#each profile.teams as team (team.team_id)}
                <a href={`/competitors/team/${team.team_id}`}>
                  <div>
                    <strong>{team.team_name}</strong>
                    <span>Joined {joinedLabel(team.joined_at)}</span>
                  </div>
                  {#if team.captain}
                    <Badge tone="accent"><Crown size={11} /> Captain</Badge>
                  {/if}
                </a>
              {/each}
            </div>
          {:else}
            <p class="muted">No team relationship to show.</p>
          {/if}
        </section>
      </Card>
    </div>

    <Card elevated>
      <section class="panel" aria-labelledby="recent-solves">
        <div class="panel-heading">
          <div>
            <span>Visible activity</span>
            <h2 id="recent-solves">Recent solves</h2>
          </div>
          {#if profile.scoreboard_frozen}
            <Badge tone="warning">Frozen snapshot</Badge>
          {/if}
        </div>
        {#if profile.recent_solves.length}
          <div class="solves">
            {#each profile.recent_solves as solve (solve.challenge_id)}
              <article>
                <div class="solve-icon"><Flag size={15} /></div>
                <div>
                  <strong>{solve.challenge_name}</strong>
                  <span>{solve.category} · {joinedLabel(solve.solved_at)}</span>
                </div>
                <div class="solve-points">
                  {#if solve.first_blood}
                    <Badge tone="accent">First blood</Badge>
                  {/if}
                  <strong>+{solve.awarded_points}</strong>
                </div>
              </article>
            {/each}
          </div>
        {:else if !profile.scoreboard_hidden}
          <p class="muted">No visible solves in this event yet.</p>
        {/if}
      </section>
    </Card>
  {/if}
</div>

<style>
  .profile-page {
    display: grid;
    gap: 1rem;
  }

  .back-link,
  .profile-header,
  .profile-header p,
  .identity-line,
  .concealed,
  .unranked,
  .panel-heading,
  .relationships a,
  .solves article,
  .solve-points {
    display: flex;
    align-items: center;
  }

  .back-link {
    width: fit-content;
    gap: 0.4rem;
    color: var(--ink-secondary);
    font-size: 0.78rem;
    font-weight: 700;
    text-decoration: none;
  }

  .back-link:hover {
    color: var(--accent);
  }

  .back-link:focus-visible,
  .relationships a:focus-visible {
    border-radius: 0.35rem;
    outline: 2px solid var(--focus);
    outline-offset: 3px;
  }

  .profile-header {
    gap: 1rem;
    padding: 1rem 0 0.4rem;
  }

  .avatar {
    display: grid;
    width: 4.1rem;
    height: 4.1rem;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--line));
    border-radius: 1.25rem;
    background: color-mix(in srgb, var(--accent) 9%, var(--surface));
    color: var(--accent);
    box-shadow: var(--shadow-sm);
  }

  .identity-line {
    gap: 0.65rem;
    flex-wrap: wrap;
  }

  h1 {
    margin: 0;
    color: var(--ink);
    font-size: clamp(1.8rem, 4vw, 2.65rem);
    letter-spacing: -0.055em;
  }

  .profile-header p {
    gap: 0.4rem;
    margin: 0.35rem 0 0;
    color: var(--ink-secondary);
    font-size: 0.82rem;
  }

  .status,
  .muted {
    color: var(--ink-secondary);
    font-size: 0.85rem;
  }

  .concealed,
  .unranked {
    gap: 0.75rem;
    color: var(--ink-secondary);
  }

  .concealed > div {
    display: grid;
    gap: 0.2rem;
  }

  .concealed strong {
    color: var(--ink);
  }

  .concealed span {
    font-size: 0.8rem;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .stats :global(.card) {
    display: grid;
    gap: 0.35rem;
  }

  .stats span,
  .panel-heading span {
    color: var(--ink-faint);
    font-size: 0.67rem;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .stats strong {
    color: var(--accent);
    font-size: 1.45rem;
    font-variant-numeric: tabular-nums;
  }

  .profile-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .panel {
    display: grid;
    gap: 1rem;
  }

  .panel-heading {
    justify-content: space-between;
    gap: 1rem;
  }

  .panel-heading > div {
    display: grid;
    gap: 0.2rem;
  }

  .panel-heading h2 {
    margin: 0;
    font-size: 1.05rem;
    letter-spacing: -0.025em;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
    margin: 0;
  }

  dl div {
    display: grid;
    gap: 0.2rem;
  }

  dt {
    color: var(--ink-faint);
    font-size: 0.68rem;
  }

  dd {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 700;
  }

  .relationships,
  .solves {
    display: grid;
  }

  .relationships a,
  .solves article {
    min-height: 3.4rem;
    justify-content: space-between;
    gap: 0.8rem;
    border-top: 1px solid var(--line);
  }

  .relationships a {
    color: var(--ink);
    text-decoration: none;
  }

  .relationships a:hover strong {
    color: var(--accent);
  }

  .relationships a > div,
  .solves article > div:nth-child(2) {
    display: grid;
    gap: 0.16rem;
  }

  .relationships span,
  .solves span {
    color: var(--ink-faint);
    font-size: 0.7rem;
  }

  .solves article {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .solve-icon {
    display: grid;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 0.65rem;
    background: color-mix(in srgb, var(--success) 10%, var(--surface));
    color: var(--success);
  }

  .solve-points {
    justify-content: flex-end;
    gap: 0.6rem;
    color: var(--success);
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 760px) {
    .profile-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 560px) {
    .profile-header {
      align-items: flex-start;
    }

    .stats {
      grid-template-columns: 1fr;
    }

    dl {
      grid-template-columns: 1fr;
    }

    .solve-points {
      align-items: flex-end;
      flex-direction: column;
      gap: 0.25rem;
    }
  }
</style>
