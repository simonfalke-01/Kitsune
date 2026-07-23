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
- 2026-07-22 — Keep the narrow RUSTSEC-2023-0071 audit exception after adding
  SAML only because it concerns RSA PKCS#1 v1.5 decryption — Kitsune uses RSA
  solely for key generation, AuthnRequest signing, and signature verification;
  encrypted assertions and the library's software-decryption escape hatch stay
  disabled, while PostgreSQL remains the only first-party datastore.
- 2026-07-22 — Pin `saml-rs` 0.3.0 and require signed assertions, signed
  AuthnRequests, audience/time/destination/recipient/InResponseTo validation,
  bounded XML, and PostgreSQL replay reservation — assertion-only signing is a
  common IdP profile, while cross-node replay must commit with flow consumption.
- 2026-07-22 — Accept unsigned IdP metadata only when an organizer explicitly
  pastes it or Kitsune retrieves it through the DNS-pinned egress policy; an
  optional pinned metadata-signing certificate upgrades ingestion to verified
  trust without making external federation configuration mandatory.
- 2026-07-22 — Generate one persistent 3072-bit RSA SAML signing identity on
  first boot with mode 0600 and expose canonical provider-specific SP metadata
  and ACS URLs — lean mode remains zero-config and operators can register or
  replace the stable certificate before enabling a provider.
- 2026-07-22 — Use `SameSite=None; Secure` for production SAML flow cookies and
  Lax only for insecure local origins — cross-site HTTP-POST ACS delivery must
  retain browser binding without weakening local zero-configuration startup.
- 2026-07-22 — Derive historical score series directly from the append-only
  ledger instead of maintaining a second mutable aggregate — freeze, division,
  reversal, and tie semantics remain explainable from one source of truth.
- 2026-07-22 — Coalesce browser score-event bursts over a 150 ms trailing window
  — repeated solves trigger one scoreboard/history fetch while staying well
  inside the one-second realtime budget; transport-level batching stays a
  separate scale concern.
- 2026-07-22 — Bound score-history responses to five leading competitors by
  default with an operator-selectable maximum of twenty — graphs stay useful
  and predictable without transferring every ledger entry for large events.
- 2026-07-22 — Issue programmatic credentials as encrypted PASETO v4.local
  tokens from a domain-separated installation key — lean mode needs no new
  secret while cookie and API-token cryptographic purposes remain isolated.
- 2026-07-22 — Return each API token value exactly once and persist only its
  SHA-256 digest with mandatory expiry — high-entropy bearer credentials remain
  immediately revocable without recoverable cleartext in PostgreSQL.
- 2026-07-22 — Intersect token scopes with the owner’s live RBAC permissions on
  every request — role removal takes effect immediately instead of surviving
  until token expiry, while the authored scope remains a permanent ceiling.
- 2026-07-22 — Deny event-scoped tokens on routes without an explicit event ID
  — ambiguous organization-wide access must not silently escape an allow-list.
- 2026-07-22 — Coalesce browser session restoration behind one in-flight
  request — nested protected pages can await authentication without racing the
  root layout or redirecting a valid hard-navigation session to sign-in.
- 2026-07-22 — Use a dedicated dark foreground token on bright fox-orange
  controls — Kitsune keeps its accent identity while meeting AA contrast in
  both themes and all interaction states.
- 2026-07-22 — Make Prometheus and OpenTelemetry the stable, vendor-neutral
  Grafana connector boundary and ship provisioning examples — operators get an
  immediately usable monitoring path without coupling Kitsune core to Grafana.
- 2026-07-22 — Autoscale dynamic challenge capacity from bounded queued demand,
  health, quota, and configurable warm-pool signals — this avoids cold-start
  storms and preserves fair resource admission while Kubernetes remains the
  blessed capacity scaler.
- 2026-07-22 — Model OAuth2 confidential clients as account-owned delegated
  principals whose registered scopes are intersected with the owner’s live RBAC
  on exchange and use — disabling an account or removing a role immediately
  narrows every service credential without creating a second authorization
  system.
- 2026-07-22 — Follow RFC 6749 client credentials with HTTP Basic authentication,
  form-encoded exchange, no refresh token, no-store responses, and 15-minute
  PASETO access — service integrations get a standard exchange while short
  lifetime and live client lookup make revocation promptly effective.
- 2026-07-22 — Persist client secrets only as SHA-256 digests and reveal each
  high-entropy value once — confidential-client authentication does not require
  recoverable secret material in PostgreSQL; digest verification happens in
  constant time against a same-length dummy for unknown client IDs.
- 2026-07-22 — Durably audit and outbox every successful client exchange before
  returning its access token — authentication history survives process failure
  and remains available to live ops, automation, and security review.
- 2026-07-22 — Require braces on all frontend control flow and let Prettier
  expand the bodies — readable source is now a failing lint contract rather than
  a convention that compressed one-line branches can silently violate.
- 2026-07-22 — Restrict API-token and OAuth-client lifecycle management to an
  interactive cookie session — bearer credentials remain fully capable on their
  granted domain APIs but cannot enumerate or mint replacement credentials
  through an unrelated or compromised token.
- 2026-07-22 — Enforce OAuth client ownership with a composite user/organization
  foreign key and rely on primary/unique lookup indexes — cross-tenant ownership
  becomes impossible at the database boundary without maintaining a redundant
  active-client index on the same primary-key prefix.
- 2026-07-22 — Use rand’s free `fill` function and track rand 0.10 — the stable
  call shape avoids extension-trait churn while keeping security-sensitive byte
  generation on the current maintained release.
- 2026-07-22 — Bind every OIDC authorization-code flow to PKCE S256, an OpenID
  nonce, one-time state, and a separate HttpOnly browser cookie — intercepted
  codes, callback CSRF, and state copied into another browser all fail closed.
- 2026-07-22 — Store OIDC client secrets, PKCE verifiers, and nonces with
  authenticated encryption while storing state and browser bindings only as
  SHA-256 digests — the callback can complete after a restart without leaving
  reusable browser credentials or provider secrets readable in PostgreSQL.
- 2026-07-22 — Never link an OIDC identity solely because its verified email
  matches by default — organizers must explicitly enable verified-email linking,
  while new accounts are provisioned with the canonical player role when that
  provider's independent auto-provision policy permits it.
- 2026-07-22 — Re-read an OIDC provider's enabled and provisioning policy inside
  the identity transaction — a provider disabled during token exchange cannot
  complete an in-flight login, and policy changes do not use stale callback
  state.
- 2026-07-22 — Derive every OIDC callback from one canonical server public
  origin instead of browser input or provider-authored text — redirect targets
  remain stable, auditable, and immune to forwarded-host manipulation.
- 2026-07-22 — Permit private OIDC discovery only through exact trusted origins
  in server configuration — a browser or organizer cannot grant arbitrary
  private-network reachability, while self-hosted identity providers remain a
  deliberate operator escape hatch.
- 2026-07-22 — Pin every DNS answer accepted by the egress policy into the
  actual HTTP client, including each webhook redirect hop — validation and
  connection cannot resolve different addresses during a rebinding attack.
- 2026-07-22 — Keep an OIDC provider key immutable and use explicit disablement
  rather than deletion — callback URLs, identity history, and audit references
  remain stable while organizers can immediately stop new authentication.
- 2026-07-22 — Return a generic login error after OIDC callback failures while
  retaining structured server diagnostics — attackers learn nothing about
  provider identities, linking policy, or token-validation branches.
- 2026-07-22 — Apply disabled styling only to an unavailable control, never its
  explanatory copy — operators still need an AA-readable reason and remediation
  path for capabilities they cannot activate.
- 2026-07-22 — Give the full browser integration journey a two-minute ceiling
  while retaining focused action assertions — desktop and emulated-mobile paths
  exercise real cryptography, PostgreSQL, API, UI, and axe without inheriting a
  unit-test-oriented thirty-second deadline.
- 2026-07-22 — Use the stable `webauthn-rs` standard-passkey flow with required
  user verification and email-first passwordless login — it supports broad
  authenticators without requiring resident/discoverable credentials, while a
  future conditional-mediation enhancement can remain additive.
- 2026-07-22 — Persist serialized WebAuthn ceremony state only as bounded,
  authenticated-encrypted server-side data and put only a random flow binding in
  an HttpOnly Strict cookie — protocol state survives a restart without becoming
  browser-controlled or replayable from a copied database row.
- 2026-07-22 — Derive the WebAuthn RP ID from the canonical configured public
  origin and never from request headers — the browser verifier, cookies, and
  deployment topology share one auditable authority boundary.
- 2026-07-22 — Keep revoked passkey records and their generic identity bindings
  for audit and ownership integrity — revocation is durable and a credential
  cannot silently migrate to another account; re-enrollment uses a new
  authenticator credential.
- 2026-07-22 — Disable account-security mutations until the deduplicated
  session bootstrap completes — protected actions must never appear available
  only to discard a real user interaction because the CSRF-bearing session is
  still loading.
- 2026-07-22 — Run browser WebAuthn tests through `localhost` with an explicit
  CDP virtual authenticator and automatic user presence — it is a trustworthy
  local RP origin and yields deterministic desktop and mobile ceremony coverage
  without weakening production origin validation.
- 2026-07-22 — Compare persisted timestamps at PostgreSQL's microsecond
  precision in repository tests — the database intentionally rounds Rust's
  nanosecond values, so tests assert the real storage contract across platforms.
- 2026-07-23 — Verify dynamic-instance answers inside the challenge transaction
  against a digest on the exact unexpired user/team lease — flag rotation,
  idempotency, first blood, and scoring remain one consistency boundary without
  holding a database lock across an orchestrator network call.
- 2026-07-23 — Require dynamic and manual challenges to use exactly one matching
  privileged verifier — an authored static or choice rule cannot bypass the
  identity-bound flag issuer or organizer-review boundary.
- 2026-07-23 — Treat ready and temporarily unhealthy instance leases as valid
  flag issuers until expiry — a player who recovered a legitimate flag is not
  denied merely because the service health probe changed after exploitation.
- 2026-07-23 — Rotate instance flags with a generation compare-and-swap after
  provider injection — overlapping ticks cannot silently overwrite a newer
  digest, and the emitted generation is safe to correlate without exposing the
  flag.
- 2026-07-23 — Persist only player-safe instance connection documents and reject
  recursively named credential, token, password, secret, or flag fields — the
  lease projection can be exposed to players without becoming a second secrets
  store.
