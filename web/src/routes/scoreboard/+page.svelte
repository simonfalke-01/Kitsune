<script lang="ts">
  import { EyeOff, Radio, Snowflake, Trophy } from '@lucide/svelte';
  import Badge from '$lib/components/Badge.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { events } from '$lib/stores/events.svelte';
  import { game } from '$lib/stores/game.svelte';
  import { realtime } from '$lib/stores/realtime.svelte';
  import { session } from '$lib/stores/session.svelte';
  import type { ScoreHistoryPoint, ScoreHistorySeries } from '$lib/api/client';

  let loaded = $state(false);
  const chartWidth = 900;
  const chartHeight = 260;
  const chartPadding = 30;
  const seriesColors = [
    'var(--accent)',
    'var(--foxfire)',
    'var(--success)',
    'var(--warning)',
    'var(--ink-secondary)'
  ];
  let displayedSeries = $derived(game.scoreHistory?.series.slice(0, 5) ?? []);
  let chartBounds = $derived.by(() => {
    let minimumSequence = Number.POSITIVE_INFINITY;
    let maximumSequence = Number.NEGATIVE_INFINITY;
    let minimumScore = 0;
    let maximumScore = 1;
    for (const series of displayedSeries) {
      for (const point of series.points) {
        minimumSequence = Math.min(minimumSequence, point.sequence);
        maximumSequence = Math.max(maximumSequence, point.sequence);
        minimumScore = Math.min(minimumScore, point.score);
        maximumScore = Math.max(maximumScore, point.score);
      }
    }
    return {
      minimumSequence: Number.isFinite(minimumSequence) ? minimumSequence : 0,
      maximumSequence: Number.isFinite(maximumSequence) ? maximumSequence : 1,
      minimumScore,
      maximumScore
    };
  });

  $effect(() => {
    if (session.authenticated && !loaded) {
      loaded = true;
      void load();
    }
  });

  async function load(): Promise<void> {
    await events.load();
    await game.loadScoreboardData();
  }

  function pointPosition(point: ScoreHistoryPoint): [number, number] {
    const sequenceSpan = Math.max(1, chartBounds.maximumSequence - chartBounds.minimumSequence);
    const scoreSpan = Math.max(1, chartBounds.maximumScore - chartBounds.minimumScore);
    const width = chartWidth - chartPadding * 2;
    const height = chartHeight - chartPadding * 2;
    const x =
      chartPadding + ((point.sequence - chartBounds.minimumSequence) / sequenceSpan) * width;
    const y =
      chartHeight - chartPadding - ((point.score - chartBounds.minimumScore) / scoreSpan) * height;
    return [x, y];
  }

  function seriesPath(series: ScoreHistorySeries): string {
    return series.points
      .map((point, index) => {
        const [x, y] = pointPosition(point);
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }
</script>

<svelte:head><title>Scoreboard — Kitsune</title></svelte:head>

<div class="page">
  <div class="split-header">
    <div>
      <p class="eyebrow">{events.selectedEvent?.name ?? 'Standings'}</p>
      <h1 class="title">Scoreboard</h1>
      <p class="lede">Every point, in the order it was earned.</p>
    </div>
    <div class="controls">
      {#if game.scoreboard?.frozen}
        <Badge tone="warning"><Snowflake size={11} /> Frozen</Badge>
      {/if}
      <Badge tone={realtime.connected ? 'success' : 'warning'}>
        <Radio size={11} />
        {realtime.connected ? 'Live' : 'Offline'}
      </Badge>
    </div>
  </div>

  {#if game.loadingScoreboard}
    <p class="status" role="status">Recounting the tails…</p>
  {:else if game.scoreboard?.hidden}
    <EmptyState
      title="The scoreboard is veiled."
      detail="Organizers will reveal it when the time is right."
    >
      {#snippet action()}
        <div class="note">
          <EyeOff size={18} /> Scores are still being recorded.
        </div>
      {/snippet}
    </EmptyState>
  {:else if game.scoreboard?.rows.length}
    {#if game.scoreHistory?.series.length}
      <figure class="history" aria-label="Score history">
        <figcaption>
          <div>
            <strong>Score trail</strong>
            <span>Append-only totals in ledger order</span>
          </div>
          <div class="legend">
            {#each displayedSeries as series, index (series.competitor_id)}
              <span style={`--series-color: ${seriesColors[index]}`}>
                <i></i>{series.name}
              </span>
            {/each}
          </div>
        </figcaption>
        <a class="skip-chart" href="#event-standings">Skip score history</a>
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img">
          <title>Historical score totals for ranked competitors</title>
          <line
            x1={chartPadding}
            y1={chartHeight - chartPadding}
            x2={chartWidth - chartPadding}
            y2={chartHeight - chartPadding}
          ></line>
          <line
            x1={chartPadding}
            y1={chartPadding}
            x2={chartPadding}
            y2={chartHeight - chartPadding}
          ></line>
          {#each displayedSeries as series, index (series.competitor_id)}
            <path d={seriesPath(series)} style={`--series-color: ${seriesColors[index]}`}></path>
            {#each series.points as point (point.sequence)}
              {@const position = pointPosition(point)}
              <circle
                cx={position[0]}
                cy={position[1]}
                r="3.5"
                style={`--series-color: ${seriesColors[index]}`}
              >
                <title>{series.name}: {point.score} points</title>
              </circle>
            {/each}
          {/each}
          <text x={chartPadding} y={chartPadding - 8}>{chartBounds.maximumScore}</text>
          <text x={chartPadding} y={chartHeight - 8}>{chartBounds.minimumScore}</text>
        </svg>
      </figure>
    {/if}
    <div id="event-standings" class="board" aria-label="Event standings" tabindex="-1">
      <div class="board-head" aria-hidden="true">
        <span>Rank</span>
        <span>Competitor</span>
        <span>Solves</span>
        <span>Score</span>
      </div>
      {#each game.scoreboard.rows as row (row.competitor_id)}
        <article class:podium={row.rank <= 3}>
          <strong class="rank">{row.rank}</strong>
          <div class="identity">
            <a href={`/competitors/${row.competitor_kind}/${row.competitor_id}`}>{row.name}</a>
            <small>{row.competitor_kind}</small>
          </div>
          <span>{row.solves}</span>
          <strong class="score">{row.score.toLocaleString()} pts</strong>
        </article>
      {/each}
    </div>
  {:else}
    <EmptyState
      title="No standings yet."
      detail="Scores appear here after the first accepted flag."
    >
      {#snippet action()}
        <div class="note">
          <Trophy size={18} /> Earliest to reach a tied score ranks first.
        </div>
      {/snippet}
    </EmptyState>
  {/if}
</div>

<style>
  .controls,
  .note {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .note,
  .status {
    color: var(--ink-secondary);
    font-size: 0.78rem;
  }

  .board {
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }

  .history {
    position: relative;
    overflow: hidden;
    margin: 0 0 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }

  .skip-chart {
    position: absolute;
    z-index: 2;
    top: 0.5rem;
    left: 0.5rem;
    padding: 0.45rem 0.65rem;
    border-radius: var(--radius-sm);
    background: var(--accent);
    color: var(--accent-contrast);
    font-size: 0.75rem;
    font-weight: 700;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-150%);
  }

  .skip-chart:focus {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  .history figcaption,
  .legend,
  .legend span {
    display: flex;
    align-items: center;
  }

  .history figcaption {
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.1rem 0;
  }

  .history figcaption > div:first-child {
    display: grid;
    gap: 0.2rem;
  }

  .history figcaption strong {
    font-size: 0.86rem;
  }

  .history figcaption span {
    color: var(--ink-secondary);
    font-size: 0.7rem;
  }

  .legend {
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.7rem;
  }

  .legend span {
    gap: 0.3rem;
  }

  .legend i {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: var(--series-color);
  }

  .history svg {
    display: block;
    width: 100%;
    min-width: 36rem;
    height: auto;
    max-height: 19rem;
    padding: 0.4rem;
  }

  .history line {
    stroke: var(--line-strong);
    stroke-width: 1;
  }

  .history path {
    fill: none;
    stroke: var(--series-color);
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 3;
  }

  .history circle {
    fill: var(--surface);
    stroke: var(--series-color);
    stroke-width: 2;
  }

  .history text {
    fill: var(--ink-faint);
    font-size: 10px;
  }

  .board-head,
  .board article {
    display: grid;
    grid-template-columns: 4rem minmax(0, 1fr) 6rem 8rem;
    align-items: center;
    gap: 1rem;
    padding: 0 1.2rem;
  }

  .board-head {
    min-height: 2.8rem;
    border-bottom: 1px solid var(--line);
    color: var(--ink-faint);
    font-size: 0.68rem;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .board article {
    min-height: 4.6rem;
    border-bottom: 1px solid var(--line);
  }

  .board article:last-child {
    border-bottom: 0;
  }

  .board article.podium {
    background: color-mix(in srgb, var(--accent) 5%, transparent);
  }

  .rank {
    color: var(--ink-faint);
    font-variant-numeric: tabular-nums;
  }

  .identity {
    display: grid;
    gap: 0.2rem;
  }

  .identity a {
    width: fit-content;
    color: var(--ink);
    font-weight: 700;
    text-decoration: none;
  }

  .identity a:hover {
    color: var(--accent);
  }

  .identity a:focus-visible {
    border-radius: 0.25rem;
    outline: 2px solid var(--focus);
    outline-offset: 3px;
  }

  .identity small {
    color: var(--ink-faint);
    font-size: 0.67rem;
    text-transform: capitalize;
  }

  .score {
    color: var(--accent);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  @media (max-width: 620px) {
    .history {
      overflow-x: auto;
    }

    .history figcaption {
      align-items: flex-start;
      flex-direction: column;
    }

    .board-head {
      display: none;
    }

    .board article {
      grid-template-columns: 2rem minmax(0, 1fr) auto;
      gap: 0.7rem;
      padding: 0 0.85rem;
    }

    .board article > :nth-child(3) {
      display: none;
    }

    .score {
      font-size: 0.85rem;
    }
  }
</style>
