# Decisions

Format: `YYYY-MM-DD — decision — rationale`.

- 2026-07-22 — Treat the current repository root as the `kitsune/` root shown in
  the prompt — the directory name in the layout is descriptive, while nesting
  another repository would separate `PROMPT.md` and the clean-room reference
  from the audit trail.
- 2026-07-22 — Use Rust edition 2024 — it is stable, satisfies “2021+,” and is
  the coherent paved road for a new Rust 1.93 codebase.
- 2026-07-22 — Persist commands and domain events transactionally using an
  outbox — it prevents integrations from observing changes that did not commit.
- 2026-07-22 — Model divisions as event-scoped membership classifications and
  brackets as tournament containers — this keeps both first-class without
  conflating scoreboard filtering and elimination structure.
- 2026-07-22 — Use UUIDv7 for persisted IDs — sortable identifiers improve
  index locality while remaining safe to generate across stateless nodes.
- 2026-07-22 — Keep de-branding socially encouraged rather than entitlement
  enforced — this intentionally implements the prompt’s free-but-asked model;
  `white_label` only unlocks the supported one-click customization flow.
- 2026-07-22 — Do not initialize the Sites plugin’s Vinext starter — the user’s
  explicit SvelteKit 5 stack overrides that generic starter while its capability
  and validation guidance still applies.
- 2026-07-22 — Draft KCL-1.0 as bespoke terms rather than copying PolyForm text —
  the requested permissions/prohibitions differ and the repo must clearly warn
  that counsel should review the license.
- 2026-07-22 — Exclude the local CTFd reference checkout from Kitsune history —
  it is third-party audit input, not a distributable part of the proprietary
  product, and this keeps the clean-room boundary visible.
- 2026-07-22 — Check SQLx offline metadata into `.sqlx/` — compile-time query
  checking remains enforceable in CI without making a live database a Rust
  compilation prerequisite.
- 2026-07-22 — Store rotating A&D flag digests and issue HMAC-authenticated
  opaque values — plaintext flags never enter logs or general event payloads.
- 2026-07-22 — Treat an empty egress host allow-list as “any public host,” not
  “any address” — integrations remain zero-config while loopback, private,
  carrier-grade NAT, metadata, link-local, documentation, and multicast ranges
  stay blocked after every DNS resolution and redirect.
- 2026-07-22 — Keep the lean EventBus intentionally non-durable and pair it with
  the PostgreSQL outbox — zero-config fanout stays fast while durable consumers
  can resume independently of process-local broadcast buffers.
- 2026-07-22 — Use encrypted private cookies containing random opaque session
  tokens whose SHA-256 digests are stored server-side — cookie confidentiality,
  immediate revocation, and database session management all hold without putting
  account claims in browser-controlled state.
- 2026-07-22 — Represent pre-tenant security events with an absent organization
  scope — inventing a tenant ID for a login against an unknown slug would corrupt
  audit semantics and violate the outbox foreign key.
- 2026-07-22 — Default Secure cookies off only in the direct lean HTTP topology
  and make the layered setting authoritative — TLS deployments and shipped scale
  manifests enable it, while localhost remains usable without hidden setup.
- 2026-07-22 — Use static root-relative navigation in the Svelte application —
  every blessed deployment serves the UI at the origin root, so the base-path
  lint rule would add indirection without protecting a supported topology.
- 2026-07-22 — Keep Kon artwork as a neutral CSS silhouette until milestone 16 —
  this delivers every branding, entitlement, and copy seam now while honoring
  the required human-made-art sequencing and provenance constraint.
- 2026-07-22 — Derive the at-rest authentication data key from the installation
  cookie master using SHA-256, then seal each TOTP secret with a fresh XChaCha20
  nonce — lean mode gains restart-stable encrypted secrets without another
  mandatory configuration value.
- 2026-07-22 — Keep recovery initiation responses invariant even without SMTP —
  this prevents account enumeration; the token is persisted for the optional
  mailer to deliver, and the UI clearly says delivery requires a configured
  channel rather than exposing secrets in responses or logs.
- 2026-07-22 — Make readable formatting a repository contract through Rustfmt,
  Prettier, EditorConfig, and the root `format` task — deterministic tooling plus
  deliberately expanded component markup prevents compressed one-line code from
  returning during feature work.
- 2026-07-22 — Resolve authenticated actors through one deny-by-default extractor
  and require named permissions inside each resource handler — tenant identity
  cannot be supplied by clients and authorization remains locally auditable.
- 2026-07-22 — Commit resource mutations, immutable audit records, and outbox
  envelopes in one PostgreSQL transaction before in-process publication — the
  durable record stays authoritative if immediate fanout is interrupted.
- 2026-07-22 — Persist only the selected event ID in browser local storage — a
  refresh keeps organizer/player context without caching tenant data or making
  node-local state authoritative, and logout removes it.
- 2026-07-22 — Run browser E2E against the real Rust server through Vite’s same-
  origin proxy — this covers encrypted cookies, CSRF, PostgreSQL, generated API
  types, UI state, responsive layout, and accessibility in one honest journey.
- 2026-07-22 — Make event lifecycle transitions explicit and forward-only after
  competition end — pause/resume remains operationally safe while historical
  results cannot silently become writable again.
- 2026-07-22 — Enforce at most one team membership per user and organization in
  PostgreSQL — event participation can project that stable identity while the
  uniqueness constraint closes create/join races across stateless API nodes.
- 2026-07-22 — Return team invite codes only at creation and persist SHA-256
  digests behind a tenant-scoped unique index — captains get a convenient opaque
  credential without turning database disclosure into immediate team access.
- 2026-07-22 — Treat built-in role permissions as Kitsune-managed upgrade data —
  forward migrations add new capabilities to existing installations and player
  registration refreshes the canonical role rather than preserving stale grants.
- 2026-07-22 — Serialize solve decisions with a challenge-row lock but allocate
  score-entry IDs from a PostgreSQL sequence — first blood remains race-proof
  without turning every submission in a large event into one counter bottleneck.
- 2026-07-22 — Default first blood to a 50-point append-only bonus configurable
  through event config — the distinction stays visible in history and operators
  can set it to zero without changing solve semantics.
- 2026-07-22 — Prefer the current team identity in hybrid events and fall back
  to the user identity when teamless — one deterministic rule prevents a player
  from choosing a different scoring identity on each submission.
- 2026-07-22 — Implement score freeze by marking new ledger entries concealed
  while frozen, never by mutating totals — organizer views stay live, the public
  snapshot stays stable, and unfreeze is an auditable reveal rather than replay.
- 2026-07-22 — Extend the root Prettier contract to cross-cutting Playwright
  sources — browser tests now follow the same readable width, quote, and trailing
  comma policy as the Svelte application instead of relying on editor defaults.
- 2026-07-22 — Charge hints as one-time negative score-ledger entries for the
  event's resolved competitor, including team-wide unlocks — this keeps the
  economy deterministic, historically explainable, and naturally freeze-aware.
- 2026-07-22 — Permit a hint charge to make a score negative — organizers can
  deliberately price information above a current balance, and silently refusing
  an authored cost would make the stated economy misleading.
- 2026-07-22 — Own writeups by the solved competitor rather than only the
  submitting user — a team shares one draft and review lifecycle without
  exposing it to unrelated identities.
- 2026-07-22 — Expose only aggregate survey analytics to organizers — validated
  difficulty feedback remains useful without creating a competitor-level
  response surveillance surface.
- 2026-07-22 — Require an explicit approve-then-publish writeup sequence — one
  accidental review action cannot immediately disclose player-authored content.
- 2026-07-22 — Encrypt manual-verification evidence with the installation data
  key and persist plaintext only as a digest — reviewers can inspect the proof
  while database disclosure does not reveal player-submitted evidence.
- 2026-07-22 — Compile SQLx queries from checked-in offline metadata in CI while
  retaining PostgreSQL-backed tests — linting no longer races an unmigrated
  service, and each SQLx test still creates and migrates an isolated database.
- 2026-07-22 — Ignore RUSTSEC-2023-0071 only for SQLx's lockfile-only optional
  MySQL driver — `cargo tree --workspace --all-features --target all -i rsa`
  proves the vulnerable RSA crate is absent from every Kitsune build graph;
  PostgreSQL remains the only first-party datastore.
