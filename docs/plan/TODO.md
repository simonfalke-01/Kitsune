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
- [x] Local registration/recovery/email verification/session management UI/API
  persistence and security boundaries.
- [x] Local registration and account-owned active-session UI/API.
- [x] Email-verification and recovery one-time token persistence/API.
- [ ] Deliver verification and recovery messages through configured SMTP.
- [x] TOTP setup, encrypted secret storage, replay protection, recovery codes,
  MFA login challenge, and account security UI.
- [ ] OIDC/OAuth2, passkeys/WebAuthn, and SAML.
- [ ] PASETO API tokens and OAuth2 client credentials.
- [ ] Deny-by-default RBAC extractor on every protected endpoint.
- [x] Deny-by-default actor extraction plus permission/CSRF enforcement on the
  event and challenge resource endpoints.
- [x] Tenant-scoped event and challenge create/list APIs with player-safe
  projections, visibility evaluation, hashed exact answers, audit, and outbox.
- [x] Domain-validated event lifecycle transition API and organizer live/pause/
  resume/end controls with audit, outbox, realtime, and browser coverage.
- [x] Team create/join/list and captain-transfer REST/UI slice with one-time
  digest-only invite codes, upgrade-safe role grants, tenant isolation, audit,
  outbox, PostgreSQL constraints, and desktop/mobile browser coverage.
- [ ] Team invite rotation, leave/removal, merge/transfer administration,
  event registration, and event-specific size-limit enforcement.
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
- [ ] Dynamic-instance and plugin answer verifiers, manual-review organizer
  queue, scoreboard graphs, cache batching, and competitor profile links.
- [x] Encrypted manual-verification persistence, RBAC review API, duplicate
  pending protection, and transactional accept/discard scoring.
- [ ] Wire the organizer manual-verification queue and player pending outcome
  through desktop/mobile browser coverage.
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

## Repository quality

- [x] Root formatter command covers Rust and pnpm workspaces.
- [x] Rustfmt, Prettier, EditorConfig, and CI format enforcement agree.
- [x] Dense one-line Svelte markup expanded into readable component blocks.
