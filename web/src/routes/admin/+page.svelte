<script lang="ts">
  import { Activity, Radio, Server, Trophy } from '@lucide/svelte';
  import Badge from '$lib/components/Badge.svelte';
  import Card from '$lib/components/Card.svelte';

  const stats = [
    { label: 'Active players', value: '0', detail: 'No event is live', icon: Activity },
    { label: 'Submissions', value: '0', detail: 'Last 15 minutes', icon: Radio },
    { label: 'First bloods', value: '0', detail: 'Across all modes', icon: Trophy },
    { label: 'Instances', value: '—', detail: 'Orchestration is off', icon: Server }
  ];
</script>

<section class="page admin-page">
  <div class="split-header">
    <div>
      <p class="eyebrow">Live operations</p>
      <h1 class="title">Quiet at the gate.</h1>
      <p class="lede">Event activity, submissions, instances, and system health converge here.</p>
    </div>
    <Badge tone="success">API healthy</Badge>
  </div>

  <div class="stat-grid">
    {#each stats as stat (stat.label)}
      <Card>
        <div class="stat-head"><stat.icon size={17} /><span>{stat.label}</span></div>
        <strong>{stat.value}</strong>
        <small>{stat.detail}</small>
      </Card>
    {/each}
  </div>

  <Card>
    <div class="activity-head">
      <div>
        <h2>Event stream</h2>
        <p>Meaningful domain changes appear in real time.</p>
      </div>
      <Badge>Waiting</Badge>
    </div>
    <div class="quiet">
      <span></span>No activity yet. The foxfire will stir when your event begins.
    </div>
  </Card>
</section>

<style>
  .admin-page {
    width: 100%;
  }
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.8rem;
    margin-bottom: 1rem;
  }
  .stat-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--ink-secondary);
    font-size: 0.78rem;
    font-weight: 620;
  }
  .stat-grid strong {
    display: block;
    margin-top: 1rem;
    font-size: 2rem;
    letter-spacing: -0.05em;
  }
  .stat-grid small {
    color: var(--ink-faint);
    font-size: 0.72rem;
  }
  .activity-head {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
  }
  h2 {
    margin: 0;
    font-size: 1rem;
  }
  .activity-head p {
    margin: 0.35rem 0 0;
    color: var(--ink-secondary);
    font-size: 0.8rem;
  }
  .quiet {
    display: flex;
    min-height: 14rem;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    color: var(--ink-secondary);
    font-size: 0.85rem;
  }
  .quiet span {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--foxfire);
    box-shadow: 0 0 14px var(--foxfire);
  }
  @media (max-width: 1000px) {
    .stat-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (max-width: 520px) {
    .stat-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
