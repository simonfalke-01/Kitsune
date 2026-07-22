# Live Task Ledger

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
- [ ] NATS/Redis scaled adapters.
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
- [ ] Local registration/recovery/email verification/session management UI/API.
- [x] Local registration and account-owned active-session UI/API.
- [x] Email-verification and recovery one-time token persistence/API.
- [ ] Deliver verification and recovery messages through configured SMTP.
- [x] TOTP setup, encrypted secret storage, replay protection, recovery codes,
  MFA login challenge, and account security UI.
- [ ] OIDC/OAuth2, passkeys/WebAuthn, and SAML.
- [ ] PASETO API tokens and OAuth2 client credentials.
- [ ] Deny-by-default RBAC extractor on every protected endpoint.
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
- [ ] Complete all mode-specific, auth-provider, plugin, integration, and
  administrative surfaces.
