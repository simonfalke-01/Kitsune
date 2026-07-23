# Live Task Ledger

## Immediate frontend reset

- [x] Preserve the interrupted notification vertical slice in `stash@{0}`.
- [x] Complete the owner-directed framework migration from the temporary React
      Vite shell to React 19 on Next.js App Router with SSR; retain TanStack
      Table as the only TanStack dependency.
- [x] Record the project-specific interface contract, including the hard ban on
      redundant explanatory captions and implementation-narrating copy.
- [x] Step 1: review and lock the two-tier semantic token contract in `app.css`.
- [ ] Make deep customization first-class: version the theme contract; expose
      semantic color, typography, radius, density, motion, asset, brand, and
      extension-slot overrides; verify theme packs without component forks.
- [x] Use React Aria Components as the sole interaction-primitive foundation.
- [x] Step 2: build Button, Link, TextField, TextArea, Select, ComboBox,
      Checkbox, Radio, Switch, Dialog, Popover, Menu, Tooltip, Tabs, Table, and
      Toast as thin React Aria wrappers with small variant maps.
- [x] Expand the primitive set with alert, badge, breadcrumbs, cards, code,
      disclosures, empty state, file drop zone, number field, pagination,
      progress/meter, search, sheet, skeleton, spinner, status, and tags.
- [x] Step 3: build the non-production `/_kitchen` drift detector with every
      implemented component, variant, async state, and both themes.
- [x] Capture and inspect desktop and 390px Chromium screenshots of the kitchen;
      verify no horizontal overflow and consistent responsive collapse.
- [ ] Rebuild the global shell and every player, auth, account, and organizer
      route without retaining Svelte markup.
  - [x] Add a server-authenticated platform layout and shared responsive shell.
  - [x] Add the staged local sign-in surface with accessible password reveal and
        MFA continuation.
  - [x] Add the SSR-backed challenge board with search, recovery states,
        challenge details, and idempotent answer submission.
  - [x] Add the SSR first-run setup route with organization, owner, password
        confirmation, completion, and API-unavailable states.
  - [x] Add the SSR-ranked scoreboard with division filters, hidden/frozen
        states, realtime refresh, compact metrics, and accessible score history.
  - [x] Add the SSR team membership route with create/join flows, one-time invite
        handling, roster state, captain controls, and realtime refresh.
  - [x] Add selected-event registration with division/bracket placement,
        idempotent updates, withdrawal safeguards, and realtime refresh.
  - [x] Add the SSR account security route with active-session and passkey
        inventory, enrollment, and guarded revocation.
  - [x] Add authenticator setup, one-time recovery codes, scoped API-token
        creation, one-time token reveal, and guarded token revocation.
  - [x] Add the SSR live-operations route with platform health, event lifecycle,
        and scoreboard visibility controls.
  - [x] Add organizer event inventory, selection, and creation.
  - [ ] Complete organizer challenge, automation, access, audit, and settings
        routes.
- [ ] Port generated OpenAPI access and preserve authenticated realtime
      invalidation without introducing an unapproved dependency.
  - [x] Bootstrap the authenticated session, event catalog, selected event, and
        challenge collection on the server without a client data framework.
  - [ ] Complete server bootstraps and mutation invalidation for remaining
        routes.
- [x] Rebuild score history from approved primitives with a bounded accessible
      fallback and no chart dependency.
- [ ] Rebuild the automation DAG from approved primitives; stop before adding
      any dependency outside the locked stack.
- [ ] Keep the mascot slot visually empty; do not ship generated or placeholder
      character artwork.
- [ ] Pass token-policy lint, formatting, ESLint, strict typecheck, Vitest,
      production build, keyboard review, desktop/mobile Playwright, screenshots,
      and axe.
  - [x] First auth/challenge slice passes formatting, ESLint, strict typecheck,
        Vitest, and the Next production build.
  - [x] Setup/challenge browser journey and toast-motion checks pass Chromium and
        mobile Playwright with axe on Linux; Node 26 uses Next's webpack dev mode
        because Next 16 Turbopack panics while emitting the challenge route.
  - [x] Scoreboard passes the token scan, formatting, ESLint, strict typecheck,
        five Vitest assertions, production build, and authenticated SSR smoke.
- [ ] Commit and push the completed frontend rewrite in reviewable atomic units;
      repair every GitHub Actions regression before resuming backend work.
- [ ] Restore the preserved notification vertical slice only after every
      frontend gate is green, then resume the pre-reset milestone.

## Milestone 01

- [x] Read `PROMPT.md` and establish autonomous goal.
- [x] Inspect the CTFd feature/schema surface without copying implementation.
- [x] Create plan, architecture, milestones, state, todo, and decisions ledgers.
- [x] Draft KCL-1.0, CLA, NOTICE, and package license policy.
- [x] Complete and cross-check CTFd feature-parity matrix.
- [x] Scaffold all Cargo crates and pnpm workspaces.
- [x] Add baseline CI and dependency-update policy.
- [x] Run format, metadata, compile, lint, and base tests green.

## Subsequent work

The canonical ordered exit criteria are in `MILESTONES.md`. Expand the current
milestone here before implementation; never mark a later milestone from prose
or scaffolding alone.

## Milestone 02

- [x] Strongly typed organization/event/identity/team/division/bracket model.
- [x] Scoped RBAC permission evaluation.
- [x] Challenge types, visibility, answer validation, prerequisite graph, hints,
      writeup/survey schema, static/dynamic/plugin score rules.
- [x] Append-only score replay, freeze filtering, deterministic tie break.
- [x] Typed domain event and infrastructure port contracts.
- [x] Jeopardy, KotH, A&D, and workshop core engines with focused tests.
- [x] Initial PostgreSQL schema for all specified subsystems applies cleanly.
- [x] Compile-time checked SQLx transaction/outbox/audit/idempotency store.
- [ ] Feature repositories and mode-state optimistic concurrency.
- [x] Bounded in-process cache and filtered EventBus.
- [x] Automation DAG validation, branching, dry-run, execution trace, and action
      registry seam.
- [x] HMAC-signed retrying webhooks and shared DNS/IP/redirect SSRF defense.
- [x] NATS/Redis scaled adapters.
  - [x] Reconnecting TLS-capable Redis cache with bounded commands, atomic
        first-write TTL counters, namespace isolation, server composition, and a
        real concurrent Testcontainers regression.
  - [x] JetStream-backed durable cross-node event fanout and server composition.
- [ ] Milestone-wide format, strict Clippy, unit, and integration gate.

## Milestone 03

- [x] Zero-input first-run organization/super-admin transaction.
- [x] Argon2id local authentication with timing-shaped unknown-user checks.
- [x] Encrypted opaque cookies, server-side session digests, expiry, revocation,
      and constant-time CSRF validation.
- [x] Login/setup rate budgets on the shared Cache contract.
- [x] Scoped permission query and full first-admin role grant.
- [x] Axum health/readiness, security headers, tracing, OpenAPI 3.1/Swagger.
- [x] Authenticated WebSocket with SSE fallback over EventBus.
- [x] API+PostgreSQL setup/session/CSRF/logout integration test.
- [x] Local registration/recovery/email verification/session management UI/API
      persistence and security boundaries.
- [x] Local registration and account-owned active-session UI/API.
- [x] Email-verification and recovery one-time token persistence/API.
- [x] Deliver verification and recovery messages through configured SMTP with
      TLS-first transport, bounded retries, escaped multipart templates, secret
      redaction, canonical action URLs, and enumeration-safe API behavior.
- [x] TOTP setup, encrypted secret storage, replay protection, recovery codes,
      MFA login challenge, and account security UI.
- [x] Passkeys/WebAuthn: exact-origin relying party, required user verification,
      encrypted one-time server ceremony state, browser binding, credential counter
      updates, safe self-service revocation, generated API/UI, and desktop/mobile
      WebAuthn emulator coverage.
- [x] SAML federation with signed assertions, metadata ingestion, safe ACS
      routing, tenant/provider policy, provisioning/linking, audit/outbox, and
      organizer/login UI.
- [x] OIDC provider/flow/identity PostgreSQL boundary with encrypted secrets,
      PKCE/nonce material, digest-only state/browser binding, tenant constraints,
      auto-provisioning policy, explicit email-link policy, and durable audit/outbox.
- [x] OIDC discovery, authorization-code exchange, ID-token validation, public
      start/callback routes, organizer management API/UI, and browser coverage.
- [x] PASETO v4.local API tokens with digest-only persistence, mandatory expiry,
      live-RBAC/event scoping, revocation, audit/outbox, OpenAPI, UI, and browser
      coverage.
- [x] OAuth2 confidential-client management and client-credentials exchange with
      digest-only secrets, short-lived PASETO access, live RBAC/event scoping,
      immediate revocation, durable auth audit/outbox, OpenAPI, UI, and browser
      coverage.
- [x] Deny-by-default RBAC extractor on every protected endpoint, including
      tenant/permission-projected WS/SSE and canonical event-scoped grants.
- [x] Deny-by-default actor extraction plus permission/CSRF enforcement on the
      event and challenge resource endpoints.
- [x] Tenant-scoped event and challenge create/list APIs with player-safe
      projections, visibility evaluation, hashed exact answers, audit, and outbox.
- [x] Domain-validated event lifecycle transition API and organizer live/pause/
      resume/end controls with audit, outbox, realtime, and browser coverage.
- [x] Team create/join/list and captain-transfer REST/UI slice with one-time
      digest-only invite codes, upgrade-safe role grants, tenant isolation, audit,
      outbox, PostgreSQL constraints, and desktop/mobile browser coverage.
- [x] Team invite rotation, leave/removal, merge/transfer administration,
      event registration, and event-specific size-limit enforcement.
  - [x] Captain-only digest invite rotation with one-time reveal.
  - [x] Captain transfer-before-leave, member removal, and self-service leave.
  - [x] Explicit event registration/status/withdrawal with division/bracket
        ownership and race-safe event size-limit enforcement.
  - [x] Administrator merge and cross-team transfer with historical competitor
        reassignment.
- [x] Division and bracket list/create/update/delete REST/OpenAPI resources with
      event-scoped authorization, assignment-safe removal, audit/outbox events,
      generated TypeScript contracts, and PostgreSQL API coverage.
- [x] Exact/regex/choice/manual submission validation, digest-only receipts,
      client idempotency, immutable score ledger, solves, first blood, authored and
      runtime attempt limits, and individual/team competitor resolution.
- [x] Ranked REST/web scoreboard with division filter, realtime refresh,
      audited freeze/unfreeze and hide/reveal controls, and frozen-ledger visibility
      regression coverage.
- [x] Multi-hint organizer authoring, sealed player projections, idempotent
      user/team unlocks, one-time score deductions, freeze-aware ledger entries,
      audit/outbox/realtime events, and browser coverage.
- [x] Competitor-owned writeup persistence/review state machine and validated,
      aggregate-only post-solve survey API.
- [x] Player writeup/survey forms and organizer review/analytics surface with
      browser coverage.
- [x] Append-only historical score REST/OpenAPI projection, responsive graph,
      hidden/freeze/division parity, and bounded browser realtime coalescing.
- [x] Dynamic-instance and plugin answer verifiers, server-side cross-node score
      batching/cache, and competitor profile links.
  - [x] Dynamic-instance answers bind to the exact user/team lease, verify only
        digest material in constant time, reject expired/unready leases, and
        preserve transactional solve/score semantics.
  - [x] Audited instance lease issuance and monotonic flag rotation repository.
  - [x] Capability-bound plugin answer verifier with signed manifest, bounded
        zero-import Wasmtime execution, gameplay preflight, locked attestation
        recheck, idempotent replay, and admin authoring.
  - [x] Revision-scoped ranked/history snapshots with bounded cross-node score
        invalidation, immediate control consistency, and fail-open cache access.
  - [x] Competitor profile REST/OpenAPI projections and ranking/roster links.
- [x] Encrypted manual-verification persistence, RBAC review API, duplicate
      pending protection, and transactional accept/discard scoring.
- [x] Wire the organizer manual-verification queue and player pending outcome
      through desktop/mobile browser coverage.
- [x] Immutable audit-history REST/OpenAPI resource with organization RBAC,
      exact bounded filters, descending keyset pagination, database mutation
      rejection, generated client, and an axe-covered organizer viewer.
- [x] Tenant user, custom-role, permission-catalog, and scoped-grant REST/OpenAPI
      resources with built-in/last-admin protection, credential revocation,
      race-safe uniqueness, audit/outbox events, and PostgreSQL API coverage.
- [x] Wire the organizer user, role, and grant administration surface through
      the generated client and desktop/mobile axe journey.
- [ ] Complete versioned REST resources and OpenAPI contracts.

## Frontend vertical slice

- [x] Svelte 5 strict shell and Kitsune CSS-token system.
- [x] OpenAPI-generated TypeScript schema and typed fetch seam.
- [x] Session and reconnecting authenticated realtime stores.
- [x] Responsive player navigation, login, first-run setup, board, scoreboard,
      and team states.
- [x] Organizer live-ops, challenge-authoring, automation-canvas, and settings
      surfaces with working local interactions.
- [x] Bits UI headless switch primitive and docs-quality component catalog.
- [x] Dark/light preference, i18n tone catalog, neutral mascot slot, free
      de-brand support nudge, and white-label entitlement state.
- [x] Strict Svelte check, ESLint/Prettier, component tests, and production build.
- [ ] Wire player and organizer resources to the complete domain REST API.
- [x] Wire event setup, selection, challenge authoring, and player challenge
      board to the generated REST client and realtime invalidation.
- [x] Exercise the event-to-published-challenge journey with PostgreSQL-backed
      Playwright on desktop/mobile and axe.
- [x] Wire the player team page to create/join/list/captain APIs and cover team
      creation through the real desktop/mobile browser journey.
- [x] Wire inline flag submission, solved state, first-blood feedback, live
      ranked standings, and organizer scoreboard controls through the generated API
      and exercise them on desktop/mobile with axe.
- [ ] Complete all mode-specific, auth-provider, plugin, integration, and
      administrative surfaces.

## Milestone 05 observability and integration detail

- [ ] Expose bounded Prometheus metrics for API, realtime, game ticks,
      submissions, automation, and orchestration without tenant-cardinality leaks.
- [ ] Export traces and logs through configurable OpenTelemetry endpoints while
      preserving a zero-configuration local default.
- [ ] Ship Grafana provisioning definitions for Prometheus and an OTLP-capable
      observability backend, maintained dashboards, and documented direct data-source
      connection steps.
- [ ] Surface event, submission, instance, automation, and system health in the
      organizer live-ops interface with actionable degraded-state explanations.

## Milestone 06 orchestration detail

- [ ] Provision isolated per-team or per-player Jeopardy instances on demand and
      per-team A&D vulnboxes before their required rounds.
- [ ] Implement idempotent provisioning, health-aware readiness, configurable
      warm capacity, event/team concurrency quotas, resource caps, and admission
      backpressure across Kubernetes, Docker/Podman, and Nomad adapters.
- [ ] Implement Kubernetes-native demand and capacity signals suitable for HPA/
      KEDA deployment, while keeping instance ownership and lifecycle decisions in
      Kitsune's orchestrator service.
- [ ] Reap expired or abandoned instances, rotate flags without cross-team
      exposure, and report lifecycle/capacity state in realtime to players and
      organizers.

## Repository quality

- [x] Root formatter command covers Rust and pnpm workspaces.
- [x] Rustfmt, Prettier, EditorConfig, and CI format enforcement agree.
- [x] Dense one-line Svelte markup expanded into readable component blocks.
