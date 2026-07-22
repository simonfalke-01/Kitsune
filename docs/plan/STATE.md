# Current State

Updated: 2026-07-22 (Asia/Singapore)

## Cursor

- Current milestone: 02 — deterministic core and persistence.
- Current milestone: 03 — secured API, authentication, and realtime.
- In progress: complete provider/MFA/token suite and domain REST resources.
- Parallel vertical slice: Svelte 5 product shell, generated OpenAPI client,
  organizer navigation, design primitives, and branding plumbing are green.
- Next: OIDC/passkey/SAML/TOTP adapters, RBAC extractor, and event/challenge API.

## Verified

- `PROMPT.md` read and treated as the source specification.
- CTFd reference inspected only for externally visible features and schema
  concepts; no source or assets copied.
- Local toolchain: Rust 1.93.1, Node 24.13.0, Corepack 0.34.5, Docker 29.4.0.
- Core workspace format, 12 domain tests, and strict workspace Clippy pass.
- PostgreSQL 17 migration applies from empty state; SQLx compile-time query
  metadata is checked in; transactional audit/outbox/idempotency test passes.
- Lean cache/EventBus, typed automation DAG validation/execution, centralized
  public-network egress policy, and signed redirect-safe webhook delivery pass 7
  focused tests and strict Clippy.
- Live Axum server smoke passes schema migration, auto-generated 0600 cookie key,
  `/health`, `/ready`, OpenAPI 3.1, first-run admin creation, encrypted cookies,
  session recovery, 15-permission super-admin grant, CSRF rejection, logout, and
  graceful shutdown.
- SvelteKit production build passes strict TypeScript/Svelte diagnostics,
  ESLint/Prettier, and 4 Vitest assertions. The generated TypeScript client is
  derived from the code-generated OpenAPI 3.1 document.
- Neutral Kon slots, separate tone/branding controls, the free de-brand path and
  support nudge, disabled-by-default white-label entitlement UX, dark/light
  tokens, responsive player shell, organizer shell, automation canvas, and
  component catalog are wired without introducing final mascot artwork early.

## Risks being actively retired

- The acceptance surface is broad; each milestone is split into independently
  testable vertical slices so claims remain evidence-based.
- Final mascot artwork must be human-authored: art is deliberately blocked until
  milestone 16 and will carry provenance documentation.
