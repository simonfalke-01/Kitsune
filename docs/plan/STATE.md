# Current State

Updated: 2026-07-23 (Asia/Singapore)

## Cursor

- Current milestone: 03 — secured API, authentication, and realtime.
- In progress: complete administrator team merge and cross-team transfer with
  historical competitor integrity.
- Parallel vertical slice: Svelte 5 product shell, generated OpenAPI client,
  organizer navigation, design primitives, and branding plumbing are green.
- Next: add audited team-management resources that migrate historical solves,
  scores, unlocks, registrations, writeups, surveys, and instance ownership
  without violating competitor uniqueness.

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
  PostgreSQL-backed API journey. Recovery delivery awaits the SMTP adapter.
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
- Main CI run 29968482559 is green across Rust, Web, dependency audit, and the
  complete desktop/mobile Browser E2E journey.

## Risks being actively retired

- The acceptance surface is broad; each milestone is split into independently
  testable vertical slices so claims remain evidence-based.
- Final mascot artwork must be human-authored: art is deliberately blocked until
  milestone 16 and will carry provenance documentation.
- Recovery initiation is enumeration-safe and complete at the persistence/API
  boundary; SMTP delivery remains explicitly open, so recovery is not yet marked
  complete in the milestone ledger.
- SAML assertion encryption is intentionally disabled while its RustCrypto RSA
  key-transport backend remains subject to RUSTSEC-2023-0071; signed plaintext
  assertions are the supported profile and the audit exception is documented.
