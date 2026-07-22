# Current State

Updated: 2026-07-22 (Asia/Singapore)

## Cursor

- Current milestone: 03 — secured API, authentication, and realtime.
- In progress: complete the remaining Jeopardy review/content workflows, then
  finish the provider and programmatic-token authentication suite.
- Parallel vertical slice: Svelte 5 product shell, generated OpenAPI client,
  organizer navigation, design primitives, and branding plumbing are green.
- Next: ship writeup submission/review, surveys, and manual-answer review, then
  implement OIDC, passkeys, SAML, and programmatic tokens.

## Verified

- `PROMPT.md` read and treated as the source specification.
- CTFd reference inspected only for externally visible features and schema
  concepts; no source or assets copied.
- Local toolchain: Rust 1.93.1, Node 24.13.0, Corepack 0.34.5, Docker 29.4.0.
- Core workspace format, 13 domain tests, and strict workspace Clippy pass.
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
  Eight API tests, strict Clippy, SQLx offline compilation, and the regenerated
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
  journey verifies decryption, player denial, and scoring. Organizer UI is next.

## Risks being actively retired

- The acceptance surface is broad; each milestone is split into independently
  testable vertical slices so claims remain evidence-based.
- Final mascot artwork must be human-authored: art is deliberately blocked until
  milestone 16 and will carry provenance documentation.
- Recovery initiation is enumeration-safe and complete at the persistence/API
  boundary; SMTP delivery remains explicitly open, so recovery is not yet marked
  complete in the milestone ledger.
