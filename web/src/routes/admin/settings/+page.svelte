<script lang="ts">
  import { ExternalLink, LockKeyhole } from '@lucide/svelte';
  import Badge from '$lib/components/Badge.svelte';
  import Card from '$lib/components/Card.svelte';
  import OidcProviderManager from '$lib/components/OidcProviderManager.svelte';
  import Toggle from '$lib/components/Toggle.svelte';
  import { preferences } from '$lib/i18n/index.svelte';
  import { en } from '$lib/i18n/en';

  let neutralTone = $derived(preferences.tone === 'professional');
  let branding = $derived(preferences.branding);
  let whiteLabel = $state(false);

  function setNeutral(value: boolean) {
    preferences.setTone(value ? 'professional' : 'kitsune');
  }
  function setBranding(value: boolean) {
    preferences.branding = value;
  }
</script>

<section class="page admin-page">
  <div class="split-header">
    <div>
      <p class="eyebrow">Organization settings</p>
      <h1 class="title">Make Kitsune yours.</h1>
      <p class="lede">
        Features disappear cleanly when switched off. Sensible defaults remain until you choose
        otherwise.
      </p>
    </div>
    <Badge>Lean profile</Badge>
  </div>

  <div class="settings-grid">
    <OidcProviderManager />

    <Card>
      <div class="section-head">
        <div>
          <h2>Voice & identity</h2>
          <p>Copy tone and visual branding are separate controls.</p>
        </div>
      </div>
      <div class="rows">
        <Toggle
          checked={neutralTone}
          onchange={setNeutral}
          label="Neutral-professional copy"
          description="Use plain wording throughout the product. The fox stays unless branding is disabled separately."
        />
        <Toggle
          checked={branding}
          onchange={setBranding}
          label="Show Kitsune identity"
          description="Show the wordmark and restrained mascot moments on authentication, loading, and result surfaces."
        />
      </div>
      {#if !preferences.branding}
        <div class="nudge">
          <span>🦊</span>
          <p>
            {en.branding.nudge}
            <a href="https://github.com/sponsors/simonfalke-01" target="_blank" rel="noreferrer">
              Support Kitsune
              <ExternalLink size={13} />
            </a>
          </p>
        </div>
      {/if}
    </Card>

    <Card>
      <div class="section-head">
        <div>
          <h2>Official white-label</h2>
          <p>One-click custom identity for supporter and enterprise installations.</p>
        </div>
        <Badge tone="accent">
          <LockKeyhole size={12} />
          Entitlement
        </Badge>
      </div>
      <Toggle
        bind:checked={whiteLabel}
        label="Enable white-label"
        description="Upload a custom logo, tune brand tokens, and remove the support nudge with the white_label capability."
        disabled
      />
      <p class="entitlement-note">
        This organization does not have the <code>white_label</code> entitlement. The free de-brand control
        above still works.
      </p>
    </Card>

    <Card>
      <div class="section-head">
        <div>
          <h2>Runtime profile</h2>
          <p>
            Lean keeps external services off. Full exposes each advanced subsystem independently.
          </p>
        </div>
      </div>
      <label class="field">
        <span>Profile</span>
        <select>
          <option>Lean — zero configuration</option>
          <option>Full — advanced defaults</option>
        </select>
      </label>
    </Card>
  </div>
</section>

<style>
  .admin-page {
    width: 100%;
  }
  .settings-grid {
    display: grid;
    gap: 1rem;
  }
  .section-head {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.1rem;
  }
  h2 {
    margin: 0;
    font-size: 1rem;
  }
  .section-head p {
    margin: 0.35rem 0 0;
    color: var(--ink-secondary);
    font-size: 0.78rem;
  }
  .rows {
    display: grid;
    gap: 1rem;
  }
  .rows :global(label + label) {
    padding-top: 1rem;
    border-top: 1px solid var(--line);
  }
  .nudge {
    display: flex;
    gap: 0.7rem;
    margin-top: 1rem;
    padding: 0.85rem;
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
  }
  .nudge p {
    margin: 0;
    color: var(--ink-secondary);
    font-size: 0.79rem;
    line-height: 1.5;
  }
  .nudge a {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    color: var(--accent);
    font-weight: 700;
  }
  .entitlement-note {
    margin: 0.85rem 0 0;
    color: var(--ink-faint);
    font-size: 0.72rem;
  }
  code {
    font-family: var(--font-mono);
  }
</style>
