# CTFd → Kitsune Feature-Floor Matrix

This is a clean-room product-behavior inventory. It was derived from the names
and public surfaces of the reference application (routes, API resources, model
names, configuration labels, documentation, and UI navigation), not by copying
its implementation, templates, source structure, or assets.

Legend:

- `[replicate]`: retain the useful behavior with a native Kitsune design.
- `[improve]`: retain and materially strengthen the behavior.
- `[drop-because-*]`: intentionally exclude the behavior for the stated reason.

Implementation references are filled only after the corresponding acceptance
test passes. Every replicate/improve row is a binding product requirement.

## Installation, setup, and configuration

- [improve] Browser first-run setup → optional zero-config setup plus
  `kit admin create`; no mail, cache, or object-store prerequisite.
- [improve] Environment/file configuration → typed layered defaults, TOML/YAML,
  environment, and validated live overrides with secret redaction.
- [replicate] User or team participation mode per event.
- [improve] Public/private event visibility → explicit visibility rules scoped
  to organization, event, audience, division, bracket, role, or invite.
- [replicate] Start/end event scheduling and pre-start countdown.
- [improve] Challenge and scoreboard visibility controls → independent scheduled,
  hidden, frozen, and unfreeze states with audit entries.
- [replicate] Account visibility controls and public profiles.
- [replicate] Registration enable/disable and registration-code gating.
- [improve] Team-size limits → policy with captain controls and admin overrides.
- [replicate] Name, description, logo, favicon, theme, and custom page settings.
- [improve] Theme selection → signed declarative hot-swappable theme packs.
- [replicate] Terms of service and privacy pages.
- [improve] Custom HTML pages → safe Markdown/content pages and plugin UI slots;
  unsafe script injection is capability-gated.
- [replicate] Time zone, date, and localization settings.
- [improve] Language selection → full tone-aware i18n catalogs.
- [replicate] Legal/user consent tracking.
- [replicate] Reset/delete event data with explicit destructive confirmation.
- [improve] Health check → liveness, readiness, dependency detail, metrics, and
  operator diagnostics through `kit doctor`.

## Accounts and authentication

- [improve] Local registration/login → Argon2id, brute-force protection,
  session rotation, and breached-flow-safe recovery.
- [replicate] Logout and multi-session invalidation.
- [replicate] Email confirmation when a mailer exists.
- [improve] Password reset → optional mail path plus admin/CLI recovery; mail
  absence never prevents boot.
- [improve] OAuth login → standards-complete OIDC with discovery, PKCE, nonce,
  claim mapping, and multiple provider configuration.
- [replicate] Account settings: name, email, affiliation, website, country,
  password, and profile data.
- [improve] API access tokens → scoped, revocable PASETO v4 tokens with expiry,
  event/org scopes, and last-used audit data.
- [improve] Admin users → fine-grained RBAC roles rather than a single boolean.
- [improve] Custom user/team fields → typed, validated, visibility-scoped fields.
- [improve] Session cookies → signed and encrypted with Redis or bounded local
  storage and device/session management.
- [improve] Social share links → privacy-aware share cards and canonical links.
- [improve] IP tracking → explicit integrity signals with retention controls and
  immutable audit records.
- [improve] Account deletion/deactivation → auditable retention and anonymization
  policies.
- [improve] Additional native auth beyond CTFd: passkeys/WebAuthn, SAML, TOTP,
  backup codes, client credentials, and pluggable providers.

## Users, teams, audiences, divisions, and brackets

- [replicate] User directory, search, pagination, public/private details,
  solves, failures, awards, and standings.
- [replicate] Team creation, join by invite code, leave, disband, and captain.
- [improve] Team membership → captain transfer, join approvals, invite lifecycle,
  member limit policies, merge, split, and admin transfer.
- [replicate] Team directory, search, public/private details, members, solves,
  failures, awards, and standings.
- [improve] Brackets → first-class tournament brackets with assignment,
  advancement, separate boards, and import/export.
- [improve] Audiences → general visibility segments with bulk membership and
  rule-based assignment.
- [improve] Divisions → native event-scoped classifications and separate boards.
- [improve] Individual and team participation → independently configurable and
  usable together where an event permits it.
- [replicate] User/team administrative create, edit, ban, delete, and password
  reset controls.
- [improve] Bulk user/team import/export → validated dry-run, mapping report,
  idempotency, and row-level diagnostics.
- [replicate] Administrative notes/comments on users, teams, challenges, pages.
- [improve] Awards and manual score adjustments → append-only score ledger with
  reason, scope, actor, and reversal rather than destructive edits.

## Challenges and authoring

- [replicate] Challenge list grouped by category with value, solve count, tags,
  and solved state.
- [improve] Standard/static challenge type → static, regex, multi-answer,
  case-insensitive, multiple-choice, and manual verification in core.
- [improve] Dynamic-value challenge type → deterministic decay with explicit
  minimum, initial value, decay, and replay-safe solve ordering.
- [improve] Flag types → exact, regex, multiple answers, generated per-team,
  rotating A&D, and plugin-provided validators.
- [replicate] Multiple flags per challenge and add/edit/delete flag controls.
- [replicate] Challenge create, edit, clone, preview, delete, and bulk reorder.
- [replicate] Name, category, description, connection information, value, state,
  max attempts, and attribution fields.
- [improve] Attachments → local/S3 storage abstraction, signed downloads,
  checksums, content scanning seam, quotas, and access authorization.
- [replicate] Tags and topics with many-to-many challenge relationships.
- [replicate] Hints that may be free or cost points and record unlocks.
- [improve] Prerequisites/requirements → arbitrary acyclic unlock graphs with
  validation, visible progress, and audience/role conditions.
- [replicate] Solutions/writeups that can be revealed by policy.
- [improve] Writeups → player submission, review, feedback, publication, files,
  and scoring hooks.
- [improve] Ratings → configurable post-solve surveys with analytics rather than
  only an undifferentiated numeric rating.
- [replicate] Challenge solve/fail/attempt history and solve lists.
- [improve] Attempt limits → per-challenge plus global, identity/IP/token-aware
  rate limits and useful retry information.
- [improve] Challenge visibility state → draft, test, scheduled, hidden,
  released, archived, and targeted visibility.
- [improve] File-based authoring → ctfcli-compatible `challenge.yml`, strict
  schema, templates, validation, diff, import, and export.
- [improve] Remote service metadata → typed TCP/UDP/HTTP endpoints with safe
  display, health status, and optional dynamic instances.
- [improve] Modules/course groupings → reusable workshop lesson sequences via
  the general game-mode and objective model.
- [replicate] Module-to-audience access controls.
- [improve] Challenge share → permission-scoped deep links without leaking
  hidden challenge metadata.

## Submissions, solves, and integrity

- [replicate] Correct, incorrect, partial, discarded, and rate-limited submission
  outcomes with timestamps.
- [improve] Submission API → idempotency keys, constant-time flag comparisons,
  bounded validation, consistent error codes, and audit correlation.
- [replicate] First solve/first blood identification.
- [improve] First-blood bonus → configurable deterministic ledger entry and
  realtime event.
- [replicate] Admin submission filters by type, user/team, challenge, and time.
- [improve] Admin discard/restore → non-destructive moderation with score replay.
- [improve] Anti-cheat signals → unique flags, sharing/collusion heuristics,
  IP/session anomalies, review queues, explanations, and opt-out controls.
- [improve] Tracking data → minimized integrity telemetry with explicit purpose,
  retention, redaction, and access permissions.
- [improve] Immutable audit log for authentication, configuration, moderation,
  scoring, instances, flags, and extension activity.

## Scoring and scoreboards

- [replicate] User or team scoreboard with rank, score, and profile links.
- [replicate] Scoreboard detail and per-entry solve history.
- [replicate] Awards added to total score.
- [improve] Score freeze → explicit freeze snapshot plus live hidden ledger and
  controlled unfreeze replay.
- [replicate] Hidden scoreboard mode.
- [improve] Tie-break by earliest time reaching the final score, implemented by
  deterministic ledger replay.
- [improve] Historical score graph → realtime, division/bracket filters, stable
  sampling, accessible table fallback, and export.
- [improve] Cacheable scoreboard queries with anti-thrash batching and cross-node
  invalidation.
- [improve] Additional scoreboards: KotH objective state and A&D attack/defense/
  SLA breakdown.

## Notifications and content

- [replicate] In-app notifications with read state and realtime delivery.
- [replicate] Admin announcement broadcast.
- [improve] Notification content and audience targeting → typed templates,
  priority, scheduling, expiration, and per-channel delivery receipts.
- [improve] Email → optional SMTP adapter, never a boot requirement.
- [improve] Additional channels → Discord and signed webhooks through a notifier
  abstraction.
- [replicate] Static/content pages and navigation exposure.
- [replicate] Robots and basic metadata controls.

## Administration and statistics

- [improve] Admin dashboard → live operations stream for submissions, first
  bloods, instances, mode ticks, delivery failures, and dependency health.
- [replicate] Event statistics for users, teams, solves, submissions, and
  challenge completion.
- [improve] Analytics → mode/division/bracket breakdowns, time series, export,
  privacy controls, and fast pre-aggregates.
- [replicate] Challenge, user, team, audience, bracket, page, module, notification,
  submission, and scoreboard admin surfaces.
- [improve] Configuration editor → schema-driven form, source layer, validation,
  secret fields, diff, rollback, and audit.
- [improve] Import/export backups → versioned portable archive, integrity
  manifest, dry-run, encryption option, backup/restore CLI, and compatibility
  report.
- [drop-because-dangerous] Unscoped arbitrary server-side HTML/template override
  → replaced by sandboxed declared plugin UI slots and theme packs.
- [drop-because-destructive] Silent hard reset paths → replaced by backed-up,
  confirmation-gated, audited lifecycle operations.

## API and extensibility

- [improve] REST API coverage for config, fields, users, teams, challenges,
  attempts, solves, submissions, files, flags, hints, solutions, tags, topics,
  unlocks, awards, comments, pages, notifications, audiences, brackets, modules,
  tokens, scoreboards, shares, imports, and exports → typed OpenAPI 3.1 with
  consistent pagination/errors/idempotency and generated TypeScript SDK.
- [improve] Authentication for API → scoped PASETO and OAuth2 client credentials.
- [improve] Extension hooks → capability-secured Wasmtime Components rather than
  arbitrary in-process Python execution.
- [improve] Custom challenge and flag types → WIT registration contracts with
  bounded execution.
- [improve] Template/script/stylesheet extension → declared UI panels and theme
  assets with CSP and integrity validation.
- [improve] Plugin assets → namespaced storage and permission-checked delivery.
- [improve] Plugin migrations → namespaced, versioned state capabilities without
  direct ambient schema authority.
- [improve] Events → typed, durable-capable EventBus consumed by realtime,
  webhooks, automation, Discord, audit, and plugins.
- [improve] Distribution → signed manifests, local/Git installs, version pins,
  registry seam, management UI, two functioning plugins, and alternate theme.

## Import/export compatibility mapping

The importer must understand every first-party table family observed in the
reference dump: configurations; users/admins; teams and membership; challenges
and subtype fields; flags; hints; awards; tags/topics and joins; solutions;
files and attachment joins; submissions and each outcome subtype; unlocks;
tracking; tokens; comments and subtype targets; custom fields and entries;
brackets; audiences and membership; modules and audience access; ratings; and
notification/page content.

- [improve] Native CTFd archive import → staged extraction, archive traversal
  defense, schema/version detection, deterministic ID mapping, password/token
  safety policy, file hash verification, transactionality, dry-run, and a
  machine/human compatibility report.
- [improve] CTFd URL migration → authenticated download with the same safe staged
  importer; SSRF-safe allow policy and explicit redirect/DNS checks.
- [improve] CTFd export equivalence → Kitsune versioned backup plus documented
  outward compatibility report; no false promise of representing Kitsune-only
  game modes in CTFd.

## Kitsune superset beyond the CTFd floor

- [improve] Native Jeopardy, KotH, A&D, and workshop modes behind `GameMode`.
- [improve] Per-player/team instances and A&D vulnboxes through Kubernetes,
  Docker/Podman, and Nomad adapters.
- [improve] Automatic tick flags, checker/SLA execution, attack validation, and
  live three-part A&D scores.
- [improve] Native visual typed automation DAG with safe actions, dry-run,
  versions, execution logs, and retries.
- [improve] Full auth provider suite, MFA, passkeys, session management, and RBAC.
- [improve] Lean/full profiles with independent feature flags and zero mandatory
  external configuration.
- [improve] Horizontal stateless scaling, NATS fanout, Redis cache/session option,
  metrics, traces, structured logs, Grafana, and explicit performance budgets.

## Verification status

Inventory complete; implementation links and test evidence remain intentionally
blank until their milestones pass. A final clean-room audit will compare crate
source and assets against the reference repository for suspicious overlap and
record the result here.

