# Current State

Updated: 2026-07-23 (Asia/Singapore)

## Cursor

- Current milestone: frontend reset — explicit owner-directed replacement of
  the Svelte application with React 19 and React Aria Components.
- Completed: the two-tier semantic token contract, locked React build stack,
  required React Aria primitive wrappers, and expanded CTF/admin control layer
  all pass strict TypeScript and a production build.
- In progress: visually inspect the dual-theme `/_kitchen` drift detector at
  desktop and 390px, then compose the application shell and domain surfaces.
- Design authority: repository-root `AGENTS.md` records the locked stack,
  mechanical constraints, quality gate, references, and filled project brief.
- Customization boundary: theme packs, white-label configuration, first-party
  screens, and plugin panels must share one versioned semantic token and
  extension-slot contract. No component fork may be required to rebrand.
- Preserved work: the interrupted notification vertical slice is stored in
  `stash@{0}` and must not resume until the frontend reset is green.
- Visual review: desktop and 390px full-page Chromium captures confirm aligned
  control heights, responsive single-column collapse, deliberate semantic
  color, flat card hierarchy, and explicit loading/empty/error treatments.
- Next: add product-level CTF composites, port every application route, and run
  the full interaction/a11y regression suite.

## Verified

- `PROMPT.md` read and treated as the source specification.
- CTFd reference inspected only for externally visible features and schema
  concepts; no source or assets copied.
- Local toolchain: Rust 1.93.1 default plus Rust 1.97.0 CI-parity
  validation, Node 24.13.0, Corepack 0.34.5, Docker 29.4.0.
- Core workspace format, 17 domain tests, and strict workspace Clippy pass.
- PostgreSQL 17 migration applies from empty state; SQLx compile-time query
  metadata is checked in; transactional audit/outbox/idempotency test passes.
- Lean cache/EventBus, typed automation DAG validation/execution, centralized
  public-network egress policy, and signed redirect-safe webhook delivery pass 7
  focused tests and strict Clippy.
- Live Axum server smoke passes schema migration, auto-generated 0600 cookie key,
  `/health`, `/ready`, OpenAPI 3.1, first-run admin creation, encrypted cookies,
  session recovery, 18-permission super-admin grant, CSRF rejection, logout, and
  graceful shutdown.
- Local self-registration, email-verification and recovery token persistence,
  XChaCha20-Poly1305-sealed TOTP secrets, replay-resistant authenticator login,
  single-use recovery codes, and account-owned session revocation pass a second
  PostgreSQL-backed API journey.
- Optional SMTP delivery is wired end to end without becoming a lean-mode boot
  dependency. The TLS-first pooled adapter validates authentication pairs,
  permits plaintext only on loopback, redacts secrets, bounds retries/timeouts,
  and renders escaped multipart verification/recovery messages. The API derives
  action URLs only from the canonical public origin, keeps unknown recovery
  responses invariant, and treats relay failure as an optional-channel failure.
  Real local-relay and PostgreSQL-backed recording-notifier tests cover delivery,
  token consumption, and the no-enumeration boundary.
- SvelteKit production build passes strict TypeScript/Svelte diagnostics,
  ESLint/Prettier, and 9 Vitest assertions. The generated TypeScript client is
  derived from the code-generated OpenAPI 3.1 document.
- Tenant-scoped event and challenge create/list APIs now enforce explicit RBAC
  and CSRF, hash exact answers before persistence, filter player visibility by
  lifecycle/time/division/prerequisites, and atomically emit audit/outbox rows.
  Ten API tests, strict Clippy, SQLx offline compilation, and the regenerated
  OpenAPI/TypeScript contract are green.
- Repository-wide Rustfmt, Prettier, and EditorConfig policy is executable from
  the root; dense pre-existing Svelte markup was expanded and all format checks
  are enforced by the lint gate.
- Neutral Kon slots, separate tone/branding controls, the free de-brand path and
  support nudge, disabled-by-default white-label entitlement UX, dark/light
  tokens, responsive player shell, organizer shell, automation canvas, and
  component catalog are wired without introducing final mascot artwork early.
- Event setup, active-event selection, challenge authoring, and the categorized
  player board now call the generated API client and react to domain-event
  fanout. Active selection survives hard navigation and is cleared on logout.
- A real Playwright journey starts PostgreSQL-backed Kitsune plus the Svelte dev
  proxy, creates an event and published challenge, verifies the player board on
  desktop and mobile Chromium, and passes axe with no violations.
- Organizer lifecycle controls now move events through domain-validated
  draft/scheduled/live/paused/ended/archive transitions; invalid historical
  reopen attempts return conflicts, while successful changes are audited,
  outboxed, published in realtime, and exercised through the browser journey.
- Tenant-scoped teams now support self-service creation, digest-only one-time
  invite codes, player joining, and atomic captain transfer. PostgreSQL enforces
  one team per user per organization and unique invite lookup under races;
  managed role upgrades keep existing installations authorized. The real
  desktop/mobile browser journey now verifies the team surface too.
- Jeopardy submissions now validate exact, case-insensitive, regex, choice, and
  manual-review answers inside a challenge-scoped transaction; enforce global,
  per-challenge, and authored attempt budgets; persist answer digests only; and
  replay immutable receipts for idempotent retries. Accepted solves append
  deterministic score and first-blood bonus entries with audit/outbox events.
- The live responsive scoreboard ranks individual or team competitors, supports
  division filtering at the API, honors hidden and frozen public views, and
  refreshes from cross-node-ready score events. Organizer freeze/unfreeze and
  hide/reveal controls are API-backed, audited, and browser-tested. The full
  event → challenge → flag → first blood → scoreboard journey passes desktop,
  mobile, and axe checks.
- Hint authoring and one-time unlock economics are now end-to-end. Locked hint
  content never enters player responses, user/team unlock identity is resolved
  with the same event policy as scoring, positive costs append negative score
  entries, repeated unlocks are free idempotent reads, and teammates receive the
  reveal through realtime refresh. API integration and both browser profiles
  exercise the sealed-content and 10-point deduction path.
- Post-solve writeups now support competitor-owned drafts, review submission,
  changes-requested feedback, explicit approval, and publication. Survey
  responses are schema/range validated and organizer analytics expose aggregate
  counts and statistics only. The PostgreSQL-backed API journey exercises every
  transition with matching audit/outbox events. Player writeup/survey forms and
  the organizer review/analytics surface update from realtime events and pass
  the full desktop/mobile browser journey with axe.
- Manual-verification evidence is now XChaCha20-Poly1305 encrypted at rest,
  isolated behind submission-management RBAC, and accepted or discarded in a
  challenge-locked review transaction. Acceptance reuses automatic solve,
  first-blood, frozen-ledger, audit, outbox, and realtime semantics; the API
  journey verifies decryption, player denial, and scoring. The realtime
  organizer queue and player pending state are exercised on desktop/mobile.
- Historical score trails are now derived from the append-only ledger through a
  typed REST/OpenAPI resource that honors division, hidden, frozen, and reversal
  rules. The responsive SVG compares the five leading competitors, exposes a
  keyboard skip path for horizontal mobile overflow, and coalesces realtime
  browser refreshes within 150 ms. API regression tests and desktop/mobile axe
  journeys cover the graph and final totals.
- Main-branch CI now compiles SQLx from committed offline metadata, runs the real
  Playwright journey against a prebuilt server, and grants the RustSec action
  only check-write permission. The narrow RSA decryption advisory exception is
  documented; SAML encrypted-assertion decryption remains disabled.
- Scoped PASETO v4.local API tokens now use a domain-separated installation key,
  digest-only persistence, mandatory expiry, coarse last-use telemetry, event
  allow-lists, live-RBAC intersection, immediate revocation, and atomic audit/
  outbox events. The generated client drives a full account-security manager
  with one-time reveal, permission/event selection, history, and revocation.
  PostgreSQL-backed API tests plus desktop/mobile Playwright and axe verify the
  credential boundary end to end.
- Main CI run 29918383516 is green across Rust, Web, dependency audit, and real
  Browser E2E after reproducing and removing the setup-navigation race locally.
- OAuth2 client credentials now provide account-owned confidential clients with
  digest-only one-time secrets, live-RBAC permission ceilings, event allow-lists,
  RFC-style Basic/form token exchange, 15-minute PASETO access tokens, durable
  exchange audit/outbox events, coarse use telemetry, and immediate client
  revocation. OpenAPI, the generated client, a dedicated account manager, real
  API integration coverage, desktop/mobile Playwright, and axe are green.
- Frontend control flow now requires explicit braces through ESLint, and the
  formatter expands every such body into readable multiline code. The policy
  was applied across the Svelte and TypeScript application before verification.
- Tenant-scoped OIDC provider persistence now seals confidential configuration,
  stores digest-only state/browser bindings and sealed PKCE/nonce flow material,
  enforces one-time expiry and provider-disable races, provisions canonical
  player grants, applies explicit-only verified-email linking, and commits login
  audit/outbox events atomically. Its PostgreSQL journey and strict Clippy pass.
- OIDC Authorization Code + PKCE is now complete through the protocol and
  product boundaries: trusted discovery, signed ID-token/issuer/audience/expiry/
  nonce/access-token-hash verification, exact-origin and DNS-pinned egress,
  canonical callbacks, encrypted path-scoped flow cookies, organizer management,
  public provider discovery, generated API client, and responsive admin/login
  surfaces. A real locally signed identity-provider integration covers success,
  replay, nonce substitution, secret rotation, CSRF, session issuance, and
  durable audit/outbox behavior. The desktop/mobile Playwright journey also
  verifies provider authoring, login discovery, and axe-clean settings.
- Mobile navigation now positions independently from the blurred sticky header,
  reserves scroll space for its fixed control bar, and completes the full
  browser journey without pointer interception. Disabled setting descriptions
  retain AA contrast while only their unavailable switch is visually muted.
- WebAuthn passkeys are now complete end to end. The server derives an exact RP
  ID and origin from canonical public configuration, requires user verification,
  encrypts serialized verifier state server-side, binds each five-minute
  ceremony to an HttpOnly cookie digest, consumes successful ceremonies exactly
  once, updates signature state, and prevents revoking a final login method.
  Registration, passwordless login, safe credential management, audit/outbox
  events, generated OpenAPI/TypeScript types, and the account/login UI are
  covered by PostgreSQL tests plus desktop/mobile WebAuthn emulator and axe
  journeys.
- Passkey verification is green with Rust 1.97 CI-parity format/Clippy/tests,
  regenerated OpenAPI and TypeScript contracts, frontend lint/typecheck/Vitest/
  production build, and the full Playwright desktop/mobile suite.
- SAML 2.0 federation is complete through the protocol, persistence, API, and
  product surfaces. AuthnRequests are signed; assertions require signatures and
  issuer/audience/destination/recipient/time/InResponseTo validation; browser
  flows use sealed RelayState plus independently digested cookies; response and
  assertion IDs are reserved transactionally in PostgreSQL. Metadata supports
  bounded paste or SSRF-safe URL ingestion with optional pinned XML-signature
  trust. Stable 0600 first-boot SP credentials, metadata/ACS endpoints, explicit
  provisioning/link policy, organizer management, public login discovery,
  generated OpenAPI types, and responsive axe-clean UI are exercised by a real
  signed IdP integration plus the complete desktop/mobile browser journey.
- Dynamic-instance submission verification now binds the authored dynamic-only
  policy to the exact unexpired user/team lease, compares only fixed-length flag
  digests in constant time, and reuses the existing challenge lock, idempotent
  receipt, solve, first-blood, score, audit, and outbox transaction. Core policy
  tests and the PostgreSQL-backed API journey cover mixed-policy rejection,
  missing leases, wrong flags, accepted flags, and plaintext non-persistence.
- Instance-ready issuance and flag rotation now use an audited PostgreSQL
  repository shared by provider adapters and submission verification. It
  validates tenant/template ownership, bounds TTL and connection data, rejects
  connection secrets, enforces one active competitor lease, replays exact
  provisioning retries, and protects rotations with a monotonic generation
  compare-and-swap. Six database tests, the core lifecycle test, and strict
  Clippy are green.
- Plugin Jeopardy answers now execute through a zero-import Wasmtime Component
  Model world after Ed25519 manifest, artifact digest, declared-kind, and
  capability checks. Memory, fuel, relative epoch deadlines, and concurrency
  budgets fail closed. A read-only gameplay preflight prevents hidden,
  inactive, solved, or exhausted challenges from invoking untrusted code; the
  locked transaction rechecks a revision- and answer-bound verifier decision.
  Exact-answer idempotent replays bypass the component safely. Core contracts,
  signed component tests, the PostgreSQL scoring journey, strict Clippy,
  generated API client, and the admin authoring form are green.
- Team lifecycle now includes digest-only one-time invite rotation, captain
  transfer-before-leave, captain removal of non-captains, self-service leave,
  explicit event registration/status/withdrawal, and division/bracket tenant
  validation. Registration and later joins serialize on the team row and enforce
  every active registered event's size limit. Generated REST/UI surfaces, the
  PostgreSQL journey, strict workspace Clippy/tests, responsive production build,
  and the complete desktop/mobile Playwright plus axe journey are green.
- Organizer team operations now provide tenant-scoped roster discovery,
  captain-safe member transfers, and complete historical team merges through
  RBAC/CSRF-guarded OpenAPI resources and a dedicated responsive admin surface.
  Mutations lock teams deterministically, block live competitors and active
  instances, enforce pending-event size limits, reassign every persisted
  `team_id` owner, resolve uniqueness collisions deterministically, and commit
  audit/outbox events atomically. PostgreSQL collision tests, API RBAC/CSRF
  integration, generated TypeScript contracts, strict frontend checks, and the
  browser admin/axe journey cover the slice.
- Main CI run 29970291645 is green across Rust, Web, dependency audit, and the
  complete desktop/mobile Browser E2E journey. The local browser gate also now
  selects the pinned Rust 1.97 toolchain automatically and covers the
  responsive, axe-clean organizer team-operations surface.
- Ranked and historical score projections now use tenant/event/division/
  audience/revision-scoped snapshots through the shared cache adapter. Score
  bursts coalesce into one cross-node revision increment every 100 milliseconds,
  scoreboard controls invalidate synchronously, and cache failures fall back to
  PostgreSQL with a 750-millisecond stale-read ceiling. Focused cache tests,
  strict Clippy, and the full PostgreSQL-backed scoring journey are green.
- Public competitor profiles now combine revision-cached standings with
  tenant-scoped identity, event registration, team relationships, and indexed
  recent solves. Hidden/frozen controls cannot be bypassed by direct profile
  URLs; arbitrary custom fields and email remain private. Generated OpenAPI and
  TypeScript contracts, user/team API coverage, strict workspace Clippy,
  responsive production builds, and desktop/mobile profile journeys with axe
  are green.
- The protected route audit now resolves organization and canonical event-scoped
  grants through the shared actor extractor. Scoped credentials remain denied on
  non-event and sibling-event resources. Realtime WS/SSE requires `event_read`,
  drops cross-organization and platform envelopes before serialization, and
  gates sensitive auth, submission, instance, automation, plugin, configuration,
  notification, and integrity events by explicit permissions. Focused policy,
  path parsing, and PostgreSQL grant-scope tests plus strict Clippy are green.
- Redis now implements the shared cache contract through a reconnecting,
  TLS-capable connection manager with two-second command bounds, safe installation
  namespaces, binary values, idempotent delete, and an atomic Lua increment that
  applies TTL only when a window begins. Explicit `redis_url` configuration
  selects it in the server; lean and full profiles remain bootable on the bounded
  local adapter when absent. A real Redis 8.2 Testcontainer proves cross-client
  visibility, namespace isolation, 24-way atomicity, expiry reset, and removal;
  full workspace tests and strict Clippy are green.
- NATS JetStream now implements durable, deduplicated event publication and
  live broadcast fanout across stateless API nodes. The adapter bounds connect,
  stream-management, publish, and acknowledgement operations; caps event and
  stream storage; validates installation namespaces and subjects; and discards
  malformed or subject-mismatched envelopes without logging payloads. Explicit
  `nats_url` configuration selects it while zero-config profiles retain the
  bounded local bus. A real NATS 2.12 Testcontainer proves cross-client fanout,
  filtering, malformed-message rejection, and namespace isolation; strict
  workspace Clippy and the all-feature workspace suite are green.
- Event divisions and tournament brackets now have complete tenant/event-scoped
  REST and OpenAPI resources for list, create, update, and delete. Mutations use
  explicit command objects, event-management RBAC, CSRF, bounded Unicode-safe
  names and numeric limits, database uniqueness, and atomic audit/outbox events.
  Deletion locks the classification and rejects assigned entrants instead of
  silently nulling historical placement. A fresh-database API journey covers
  organizer lifecycle, player read/denied-write access, registration linkage,
  conflict-safe deletion, withdrawal, and all six audit actions. Generated SQLx
  metadata/TypeScript contracts, 18 API tests, the full all-feature workspace,
  strict Clippy, and every frontend check/build are green.
- Audit history is now exposed through an organization-scoped, RBAC-protected
  REST/OpenAPI resource with descending keyset pagination and bounded exact
  event, actor, action, resource, and time filters. PostgreSQL rejects ordinary
  audit-row updates and deletes through an append-only trigger. The polished
  organizer timeline uses the generated client, retains filters while paging,
  and handles empty/loading/error states. API integration covers pagination,
  filtering, malformed cursors, player denial, and direct SQL mutation rejection;
  frontend checks, strict Clippy, the production build, and a real Chromium/axe
  investigation journey are green.
- Main CI run 29975439643 passed Browser E2E, Web, dependency audit, strict Rust
  Clippy, OpenAPI drift, and the full all-feature Rust suite. Its Rust job was
  marked failed only when the cache post-job exhausted runner disk after those
  gates; repository-wide no-debug/non-incremental development and test profiles
  now bound artifact storage without requiring privileged workflow-file access.
- Main CI run 29976305868 is fully green across Rust, Web, Browser E2E, and
  dependency audit; the bounded Cargo profiles eliminated the cache post-job
  disk exhaustion while preserving every substantive gate.
- Organizer identity administration now exposes tenant-scoped users, the
  supported permission catalog, custom roles, and organization/event/team role
  grants through RBAC/CSRF-guarded REST/OpenAPI resources. Custom roles cannot
  acquire platform authority, built-ins cannot be mutated, assigned roles cannot
  be deleted, and a uniqueness constraint rejects duplicate scoped grants under
  races. Disabling an account revokes its sessions and API tokens, while self
  disable and removal of the final active platform manager fail closed. A real
  PostgreSQL API journey covers player denial, Argon2id-only account creation,
  role/grant lifecycle, session revocation, protected invariants, and immutable
  audit/outbox events; SQLx metadata and strict workspace Clippy are green.
- Delegated identity operators now require independent `platform_manage`
  authority before editing a platform manager or assigning/revoking a
  platform-authority grant. The responsive access workspace uses the generated
  client for local account lifecycle, custom-role composition, permission
  discovery, and organization/event/team-scoped grants. The complete real
  browser journey creates and scopes an account role on desktop and mobile,
  passes axe with no violations, and the shared disabled-button treatment keeps
  its contrast during asynchronous state transitions.
- Main CI run 29974725515 exposed GitHub runner storage admission when two test
  JetStreams each reserved the one-gigabyte production limit. Stream retention
  is now an explicit validated adapter configuration; production retains its
  bounded default while integration tests reserve 16 MiB per namespace. Three
  repeated real-container runs and the full workspace suite pass locally.
- Cache-commit CI exposed one team-merge assertion comparing Rust nanoseconds
  to PostgreSQL microseconds. The assertion now matches the storage contract;
  five repeated focused runs and the full all-feature workspace suite pass.

## Risks being actively retired

- The acceptance surface is broad; each milestone is split into independently
  testable vertical slices so claims remain evidence-based.
- Final mascot artwork must be human-authored: art is deliberately blocked until
  milestone 16 and will carry provenance documentation.
- Recovery initiation and optional SMTP delivery are enumeration-safe end to
  end; SMTP remains absent by default and a missing full-profile configuration
  degrades to an explicit warning instead of blocking boot.
- SAML assertion encryption is intentionally disabled while its RustCrypto RSA
  key-transport backend remains subject to RUSTSEC-2023-0071; signed plaintext
  assertions are the supported profile and the audit exception is documented.
