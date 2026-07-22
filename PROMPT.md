# BUILD PROMPT — “Kitsune” CTF Platform (one-shot, autonomous)

> Paste this entire file as the task prompt for Codex. It is intentionally exhaustive: every decision has already been made so you never have to guess or ask. Read it fully **once**, then begin the autonomous execution loop described in §0 and §15 and do not stop until every acceptance gate in §14 passes.

---

## §0 — OPERATING CONTRACT (READ FIRST, OBEY ALWAYS)

You are building a complete, production-grade product in a **single continuous autonomous run**. The following rules are absolute and override any default behavior:

1. **NEVER STOP** until every item in the Definition of Done (§14) is satisfied and verified green. Finishing a file, a milestone, or “a lot of progress” is **not** done. Only the §14 checklist being fully green is done.
2. **NEVER ASK THE USER A QUESTION.** No clarifying questions, no “should I…”, no pausing for confirmation, no requesting another prompt. Everything you need is in this document.
3. **NEVER GUESS BY ASKING.** If you hit an unspecified micro-decision, choose the option most consistent with the Philosophy (§2) and the blessed stack (§5), record it in `docs/decisions/DECISIONS.md` with a one-line rationale, and continue immediately.
4. **NO SUBAGENTS.** Do all work yourself in one continuous process. Do not spawn, delegate to, or simulate sub-agents. One mind, one loop, start to finish.
5. **NO STUBS PASSED OFF AS DONE. NO CORNER-CUTTING. NO SLOP.** Every feature you claim to deliver must actually work, be wired end-to-end, and be covered by a passing test. `todo!()`, `unimplemented!()`, mock data standing in for real logic, commented-out failing tests, or “this would work in production” hand-waving all count as **incomplete** and block done.
6. **SELF-MANAGE VIA A LEDGER.** Maintain the planning/state files in §15 and update them at the end of every execution cycle so the run is resumable and auditable. If context is compacted or the run is resumed, reload the ledger and continue exactly where you left off — never restart from scratch.
7. **VERIFY EVERYTHING YOU BUILD.** After each unit of work, run the relevant checks (compile, lint, typecheck, the tests you just wrote). A feature is not complete until it compiles, passes lint/format/typecheck, and its tests pass.
8. **BUILD THE FULL PRODUCT.** Not an MVP, not a demo, not a “foundation.” The full scope in §6–§13, to the quality bar in §11–§12.

If you ever feel the urge to stop and report progress or ask something — don’t. Record it in the ledger and keep building.

---

## §1 — MISSION

Build **Kitsune** — a modern, blazingly fast, ruthlessly robust, infinitely extensible **CTF (Capture The Flag) platform** that is a strict superset of everything [CTFd](https://github.com/CTFd/CTFd) does well, minus its cruft, and far beyond it. Kitsune must be the single most comprehensive CTF platform in existence — open or commercial — and support **Jeopardy**, **King of the Hill (KotH)**, and **Attack/Defense (A&D)** natively and fully, plus be genuinely extensible to *arbitrary* custom game modes (including non-competition modes like workshops/lessons).

### The reference repo — READ THIS CAREFULLY
A copy of the CTFd source is in the project folder. It is a **REFERENCE ONLY**, used for two things:
- **Feature-floor discovery:** enumerate every user-facing and admin feature CTFd has, so Kitsune matches or exceeds the *good* ones. Produce `docs/reference/ctfd-feature-parity.md` — a checklist of CTFd features, each marked `[replicate] / [improve] / [drop-because-<reason>]`. Kitsune must implement 100% of the `[replicate]` and `[improve]` items.
- **Data-model & migration learning:** understand CTFd’s schema well enough to build a flawless **CTFd → Kitsune importer** (§9).

**DO NOT copy CTFd code.** Kitsune is a **clean-room reimplementation** in a different language and architecture, under a proprietary license (§13). Study CTFd for *what* to build and *what mistakes to avoid*; write **100% original code**. Never reproduce CTFd source, structure-for-structure, or its assets. Treat it as documentation, not a codebase to fork.

---

## §2 — PHILOSOPHY (the spine — every decision must serve this)

These are not vibes; they are constraints. When any micro-decision is ambiguous, the answer is whatever best honors this list.

1. **Paved road, not a buffet.** Kitsune has ONE blessed, opinionated way to do everything (the blessed stack in §5), and it is confident, coherent, and correct out of the box. New users are never confronted with “pick something, lol.” There is a strong, clear, central message about how Kitsune is meant to be run.
2. **…with real escape hatches.** Every blessed subsystem sits behind a clean adapter trait so a power user who knows why can swap it (orchestrator, storage, event bus, auth provider, notifier, cache, etc.). The escape hatch is *there*, documented, and first-class — just not the default anyone trips over.
3. **Batteries included, every battery removable.** Everything ships working. Nothing is mandatory. If a user doesn’t want a feature, it opts out cleanly and disappears from the UI and the mental model.
4. **Progressive disclosure of complexity.** Two runtime profiles:
   - **Lean mode** — a drop-in CTFd replacement, but better. Boots with **zero mandatory configuration**, no external services required beyond the bundled Postgres, no SMTP setup, no S3, nothing. `docker compose up` → a working CTF in under a minute.
   - **Full mode** — everything (orchestration, A&D, automation builder, SSO, marketplace, etc.) available, each independently opt-out-able.
   Switching profiles is one config value; individual features toggle independently regardless of profile.
5. **Zero forced setup — this is a hard rule.** Nothing external is ever *required* to run. No mandatory SMTP, no mandatory object storage, no mandatory OIDC. Sane in-process/local defaults for everything (local disk storage, in-app notifications, auto-generated secrets on first boot). Every external integration is **off by default** and enabled on demand. Do not repeat the industry mistake of making people configure five services before they can see a login page.
6. **Apple-grade UX.** Powerful yet sophisticated. Calm, precise, fast, tasteful motion, obvious affordances, no clutter. It should feel *nice*. Not a feature-dense Windows-utility grid; a considered product.
7. **Minecraft-grade extensibility & fun.** Infinitely moddable, customizable, and genuinely fun to use. Plugins/themes/modes/marketplace. Delight in the details.
8. **Blazingly fast, efficient, robust, bug-free.** No slow loads, no jank, no fragile paths that fall apart under inspection. Performance budgets in §11 are enforced. Robustness is a feature.
9. **Integration- and automation-first.** Nothing feels closed. A fat, typed, documented API; a first-class event bus; outbound webhooks; AND a native visual automation builder. Built by and for an IFTTT/n8n/Zapier/Terraform power user.

---

## §3 — BRAND / IDENTITY (confident & quirky, delivered with Apple restraint — the “Anubis energy”)

Design north star: Kitsune must have a **distinct personality and unshakable confidence** — the way Xe Iaso’s *Anubis* firewall does (a named, characterful mascot; a cohesive myth threaded through the product; witty, self-assured microcopy) — but delivered with **Apple-grade restraint**: poised, not loud. Personality is a feature; noise is not. Study Anubis for the *attitude*, not the assets.

> **Build order:** the mascot’s *artwork and flourish* is done **last** (milestone 16, §15) — after the entire functional platform is complete. Build the branding *plumbing* (slots, toggle, entitlement, i18n, tokens) in place with neutral placeholders during normal milestones; produce and wire Kon’s actual art only at the end. Do not spend early cycles on the mascot.

- **Name:** **Kitsune.** CLI binary and command namespace: `kit`.
- **Myth (the throughline — Kitsune’s answer to Anubis “weighing the soul”):** the *kitsune*, the fox spirit — cunning, cleverness, shapeshifting, misdirection. That *is* CTF. Thread the lore consistently and lightly across copy and visuals: **kitsunebi (foxfire)** for sparks/energy (loading, flag-accepted, first-blood), **nine tails** as a mastery/progression motif, **torii-gate / Inari-shrine** cues for the “home”/event surfaces, and **“outfox the challenge”** as the core verb. One myth, every touchpoint, never heavy-handed.
- **Mascot — a *character* with a job, not a logo. Kon is a fox girl.** Ship an **original anime fox-girl (kitsune-mimi) mascot named “Kon”** (from *kon-kon*, a fox’s cry) — the same *kind* of character energy as Anubis’s jackal-eared anime girl, but a wholly original design that is unmistakably Kitsune’s own. Kon is a cute, sharp-eyed fox girl with **fox ears and tail(s)** (lean into the **nine-tails** motif — she can gain/show more tails as a mastery/progression flourish), a distinct signature outfit and palette, and a real personality: clever, a little smug, playful — a trickster who **inspects and appraises your submissions** (Kitsune’s parallel to Anubis’s magnifying-glass soul-weigher; give her a fitting prop/gesture, e.g. a lantern of foxfire or an appraiser’s glance). Deliver a small, expressive SVG/Lottie set with these states: idle; **kitsunebi spark on flag-accepted**; **celebrating on first-blood**; curious/sniffing on empty states; tilted-head/unimpressed on wrong-flag; dozing on “nothing here yet”; lost-at-a-torii on 404/500. **Original artwork only — no third-party IP, no resemblance to existing characters, and no AI-generated final art** (Anubis took public flak for launching on AI art and had to re-commission a real artist; skip that mistake — commission-quality, human-made look from the start; treat the placeholder art in-repo as clearly-temporary and swappable). Keep Kon tasteful and restrained — a brief, charming beat, then out of the way (Apple-grade poise, cute-not-otaku-loud).
- **Voice — confident & quirky by default, one switch to neutral-pro (tone only).** Default copy is warm, witty, and self-assured. A single org-level setting flips the product’s **copy tone** to **neutral-professional** (plain wording, dialed-down playful moments). This changes *words*, not the fox. All strings live in an i18n catalog (§8) so both tones — and future languages — stay clean. Always free, independent of the branding setting below.
- **Identity — present by default, free to remove, but we ask you to support (the faithful Anubis model).** Anubis does **not** hard-force its branding: it’s MIT, so anyone *can* strip the mascot, but Iaso *asks* (doesn’t demand) that you not do so unless you’ve financially supported the project, and offers a polished official de-brand as a paid tier. **Kitsune mirrors this social model, not a hard lock.** Rules:
  - **Default = present.** Kon appears at her delight-moments across the app, plus a small, tasteful identity mark (wordmark + Kon) on the **auth / loading / interstitial** surfaces. Restrained, never plastered everywhere.
  - **A free de-brand toggle exists — nobody is walled out.** Any operator can turn branding off themselves for free. But the toggle is **framed with a warm, confident nudge**, not hidden and not guilt-trippy: directly beside it, copy in Kitsune’s voice along the lines of *“Kon’s happy here — but if you’re running Kitsune unbranded, please consider supporting the project so it keeps getting better 🦊”* with a sponsor/support link. A request, in good spirit — exactly Anubis’s tone.
  - **An official one-click white-label is the supporter/enterprise convenience.** Supporters get the polished path: custom logo/theme, no nudge, fully supported. This is the *paid ergonomics* layer on top of the free DIY toggle — again mirroring Anubis (free-but-asked vs official-paid).
  - Implement an `Entitlements` hook with a `white_label` capability that toggles the nudge off and unlocks the official white-label UX. **The free toggle still works without it.** Ship the entitlement off by default; the owner grants it.
  - *(Owner’s lever: because Kitsune is proprietary under KCL (§13) rather than MIT, you technically **could** make de-branding a hard entitlement-gated wall later if you ever want to. The chosen default is deliberately the softer, friendlier Anubis-style social ask. Flipping to hard-enforcement is a one-setting change; DECISIONS.md should note this is intentionally soft.)*

> Prior-decision note for the owner: mascot on by default; the **tone** toggle is free (words only). De-branding is **free and available to anyone**, but framed with a warm “please support if you run unbranded” nudge, plus an official one-click white-label for supporters — faithfully the Anubis social model (free-but-asked, with a paid official path), *not* a hard wall. The license (§13) means you could harden it later if you choose; the default is intentionally soft.

---

## §5 — BLESSED TECH STACK (exact; do not deviate for the blessed path)

Every item below is the **paved road**. Where noted, an adapter trait exists so power users can swap it — but you implement the blessed choice fully and make it the default.

### Backend (core)
- **Language:** Rust (stable, latest). Edition 2021+.
- **HTTP/framework:** `axum` on `tokio`, `tower`/`tower-http` middleware.
- **DB:** **PostgreSQL** (blessed and only first-party datastore). Access via **`sqlx`** with compile-time-checked queries and `sqlx::migrate!` migrations. No heavy ORM. `DataStore` trait abstracts persistence for the escape hatch.
- **Cache / ephemeral / rate-limit / sessions store:** **Redis** (optional; in lean mode falls back to in-process). `Cache` trait.
- **Event bus / cross-node fanout:** internal **`EventBus` trait**. Default impl = in-process (`tokio::sync::broadcast`) for lean mode. Blessed at-scale impl = **NATS (JetStream)** for durable, cross-node event distribution. Every domain state change publishes a typed event here (this feeds realtime, webhooks, automation, Discord, plugins).
- **Realtime transport:** WebSockets via `axum`, with SSE fallback. Cross-node fanout through the `EventBus`. Stateless nodes; no sticky sessions required.
- **AuthN:** blessed = **OIDC/OAuth2 SSO** (`openidconnect`) **+ passkeys/WebAuthn** (`webauthn-rs`). Also fully implemented and pluggable: local accounts (Argon2id via `argon2`), **SAML**, **TOTP/MFA**, email verification. Sessions = signed+encrypted cookies (`tower-sessions`) backed by Redis (or in-proc in lean mode); programmatic access = scoped API tokens (PASETO v4) + OAuth2 client-credentials.
- **AuthZ:** first-class RBAC (roles + fine-grained permissions), org/event scoping, full audit log.
- **WASM plugin runtime:** **Wasmtime + the Component Model + WIT** interfaces. Capability-based (no ambient authority); epoch/fuel-based timeouts; memory limits; async host functions. (Details §7.9.)
- **Container orchestration:** blessed = **Kubernetes** via `kube-rs`. `Orchestrator` trait with additional first-party adapters: **Docker/Podman** (`bollard` / Podman REST) and a **Nomad** adapter. (Details §7.7.)
- **Object storage:** `ObjectStore` trait. Default = **local disk** (lean, zero-config). Adapter = **S3-compatible**. Never required.
- **Email:** `Notifier`/`Mailer` trait. Default = **in-app notifications only, no SMTP required**. SMTP adapter available, off by default.
- **Observability:** OpenTelemetry (traces + metrics + logs) via `tracing` + `opentelemetry`; Prometheus `/metrics`; structured JSON logs; health/readiness endpoints. Ship Grafana dashboards.
- **API docs:** OpenAPI 3.1 generated from code (e.g. `utoipa`), served with a browsable UI. REST + WebSocket are the blessed API surfaces. **No GraphQL in core** (available as a plugin later); do not add it to the paved road.

### Frontend
- **Framework:** **SvelteKit** (Svelte 5 with runes), **TypeScript strict**, Vite.
- **Styling/design system:** **Tailwind (latest)** + a custom **“Kitsune” design-token layer** (color, type scale, spacing, radius, motion) on top of a headless primitive library (**Bits UI / Melt UI**). Build a real, documented component library, not ad-hoc markup. Dark + light themes; CSS-variable theming; view transitions and tasteful, restrained motion.
- **Data layer:** typed API client **generated from the OpenAPI spec** (single source of truth). Realtime via a WebSocket store.
- **Accessibility:** WCAG 2.1 AA across the app; verified by automated axe tests.
- **Mascot & voice** per §3, driven by the i18n catalog and a runtime voice toggle.

### CLI & tooling
- **`kit`** — a single Rust binary CLI (see §10).
- **Monorepo:** Cargo workspace for Rust crates + pnpm workspace for the frontend, unified with a top-level task runner (`just` + npm scripts). Reproducible builds.

### Repo layout (create exactly this shape; expand as needed)
```
kitsune/
  Cargo.toml                # workspace
  crates/
    kitsune-core/           # domain model, traits, events, scoring engine, game-mode engine
    kitsune-api/            # axum HTTP + WS, OpenAPI, middleware, auth
    kitsune-db/             # sqlx, migrations, DataStore impl
    kitsune-orchestrator/   # Orchestrator trait + k8s/docker/podman/nomad adapters
    kitsune-plugins/        # Wasmtime host, WIT bindings, capability system
    kitsune-automation/     # event bus, automation engine, webhook dispatcher
    kitsune-integrations/   # discord, ctfd-import, ctfcli/challenge.yml, s3, smtp, prometheus
    kitsune-cli/            # `kit`
    kitsune-server/         # binary that wires everything (lean+full profiles)
  web/                      # SvelteKit app + design system
  wit/                      # WIT interface definitions for plugins
  plugins/                  # first-party example plugins + theme(s)
  deploy/
    compose/                # docker-compose golden path
    helm/                   # Helm chart
    terraform/              # Terraform module
    k8s/                    # raw manifests / kustomize
  docs/                     # Starlight docs site (see §12)
  tests/                    # cross-cutting e2e (Playwright), load (Goose), contract
  .github/workflows/        # CI
  LICENSE  CLA.md  NOTICE  README.md
```

---

## §6 — ARCHITECTURE OVERVIEW

- **Stateless API nodes** behind a load balancer; all shared state in Postgres/Redis/NATS so the system scales **horizontally to 10k+ concurrent users** from day one. No node-local state that breaks under multiple replicas. WebSocket fanout is cross-node via the `EventBus`.
- **Event-sourced-ish domain events:** every meaningful state change (submission, solve, first-blood, score change, instance lifecycle, config change, auth event, KotH tick, A&D tick, etc.) emits a typed event onto the `EventBus`. Realtime UI, webhooks, the automation engine, Discord, plugins, and the audit log all consume from there. This is the backbone of the integration-first philosophy.
- **Scoring is a pure, deterministic engine** in `kitsune-core`, independent of transport, so it’s trivially testable and pluggable (dynamic-decay, static, and custom/WASM scoring all implement a `ScoringStrategy` trait).
- **Game modes are pluggable** via a `GameMode` trait (§7.3); Jeopardy/KotH/A&D are first-party impls; third parties can ship arbitrary modes.
- **Everything expensive is bounded** by budgets (§11) and guarded by rate limits, backpressure, and timeouts.

---

## §7 — SUBSYSTEMS (build all of these, fully)

### 7.1 Identity
Individuals, **teams**, **divisions**, and **brackets** are **all first-class**, natively and out of the box, and independently configurable per event. Support: user profiles, team creation/join (invite codes + captain controls + size limits), team merges/transfers (admin), divisions (e.g. student/pro/internal) with separate scoreboards, brackets/tournaments. Roles: player, team captain, author, organizer/admin, super-admin — via the RBAC system. Everything extensible (custom fields, custom roles/permissions).

### 7.2 Auth
Implement the full set from §5. Blessed onboarding = OIDC SSO + passkeys, with local accounts always available. Zero external auth config required to boot (local accounts work out of the box; first super-admin created via first-run setup or `kit`). MFA/TOTP, email verification (only if a mailer is configured — never blocks boot), account recovery, session management, per-token scopes, brute-force protection, full audit trail.

### 7.3 Game-mode engine
Define a `GameMode` trait covering: challenge/objective lifecycle, event/tick handling, scoring hooks, state exposure to the scoreboard, and admin controls. Ship three complete first-party modes:

- **Jeopardy (blessed default):** categories, challenges, dynamic-decay scoring by default (fully supports static and custom), unlock chains/prerequisites, hints (with hint “cost”/economy), first-blood, hidden/scheduled challenges, per-challenge visibility rules, file attachments, remote (`nc host port` / URL) challenges, dynamic per-team instanced challenges (§7.7), writeup submission + review, surveys.
- **King of the Hill:** one or more objectives; tick-based continuous scoring for holding an objective; claim/defend mechanics; per-objective live state; configurable tick interval and point accrual; realtime KotH board.
- **Attack/Defense:** full round/tick game loop; per-team vulnerable-service instances orchestrated by Kitsune (§7.7); flag IDs + **automatic flag rotation each tick**; **checker/SLA framework** (checkers packaged as containers or WASM) computing SLA/uptime, attack, and defense points; flag submission endpoint with validation, dedup, own-flag rejection, expiry windows, and anti-abuse; live A&D scoreboard with attack/defense/SLA breakdown.

Modes must be independently enable/disable-able and combinable within one event where sensible. The engine must be general enough that a **workshop/lesson mode** (non-competitive, guided content, no scoring) is implementable purely as another `GameMode` — build a minimal workshop mode as proof.

### 7.4 Challenges
Types: static-flag, regex/multiple-answer flags, case-insensitive options, multiple-choice, dynamic (per-team instanced), file-backed, remote-service, manual-verification. Features: dynamic-decay scoring, static scoring, custom/WASM scoring; unlock prerequisites/chains; hints + hint economy; tags/categories; visibility windows/scheduling; max-attempts + per-challenge and global rate limits; challenge templates; bulk import/export; `challenge.yml`/ctfcli compatibility (§9). Authoring via a polished admin UI **and** file-based flow.

### 7.5 Scoring & scoreboard
Deterministic engine (§6). Dynamic-decay default; first-blood bonuses; tie-break rules (earliest-to-reach); **score freeze/unfreeze** windows; hidden scoreboard mode; per-division/bracket boards; historical score graphs; realtime updates over WS with cross-node fanout; anti-thrash update batching to hit latency budgets at 10k+ users.

### 7.6 Integrity / anti-cheat
Per-team/unique flags where applicable; flag-sharing/collusion detection heuristics; submission rate limiting; IP/session anomaly signals; full immutable audit log; brute-force protection; SSRF protection on all outbound (webhooks/automation/remote challenges); admin review tools. All opt-out-able but on by sensible default.

### 7.7 Orchestration & dynamic instances
`Orchestrator` trait: `provision`, `deprovision`, `status`, `exec`, `healthcheck`, `rotate_flag`, resource quotas, network isolation. **Kubernetes is the blessed impl** (`kube-rs`); ship Docker/Podman and Nomad adapters too. Provide: on-demand **per-team/per-player challenge instances** for Jeopardy; **per-team vulnbox instances** for A&D; TTL reaper; concurrency + resource caps; network policies isolating teams; flag injection + rotation; instance status in the UI; graceful degradation if no orchestrator is configured (feature simply hides — never blocks boot). Everything here is **opt-in** and invisible in lean mode.

### 7.8 Automation & integration layer (build BOTH)
- **Event bus + outbound webhooks + fat typed API:** every domain event is subscribable; outbound webhooks are user-configurable, signed (HMAC), retried with backoff, and logged. The public REST+WS API exposes essentially everything an organizer or integration could want, documented via OpenAPI, with generated client SDKs (at minimum a TS SDK from the OpenAPI spec).
- **Native visual automation builder (n8n-lite):** a SvelteKit DAG editor where organizers wire **triggers** (any event type) → **conditions/filters** → **actions** (send webhook, post Discord message, send email, award/deduct points, unlock challenge, provision/deprovision instance, toggle challenge, call a plugin action, HTTP request). Server-side execution engine with versioned flows, dry-run/test, execution history/logs, and safe sandboxing (rate limits, SSRF guards, timeouts). Typed against the event schema so it can’t be misconfigured into nonsense.

### 7.9 Plugin system (WASM Component Model)
Wasmtime + Component Model + WIT. Define WIT interfaces in `wit/` so a plugin can, at minimum: register **challenge types**, **scoring strategies**, **game modes**, **auth providers**, **automation nodes**, **event handlers/subscribers**, **integrations/notifiers**, and **UI panels** (via declared extension slots the frontend renders). **Capability-based security:** plugins get only the host capabilities they declare and are granted (DB scope, HTTP egress allow-list, event subscriptions, storage namespace) — no ambient authority. Enforce epoch/fuel timeouts and memory limits. Provide a plugin SDK + `cargo`-based template + docs. **Themes** are declarative packs (token overrides + assets + optional component slot overrides), hot-swappable. **Distribution:** local install + Git-based install **and** a hosted **registry/marketplace seam** (`kit plugin add <name|git|path>`, signed manifests, version pinning, an in-app browse/install UI backed by a registry client the org can point at Kitsune’s registry or their own). Ship at least two real first-party example plugins and one alternate theme to prove the whole path.

### 7.10 Admin / organizer experience
A calm, powerful admin surface: event setup wizard (progressive, nothing mandatory), challenge authoring, live-ops dashboard (real-time submissions/first-bloods/instance health/system health), user/team/division/bracket management, scoreboard controls (freeze/unfreeze/hide), automation builder, plugin/theme manager, integration toggles, config editor (with the layered config model), audit-log viewer, notifications/announcements broadcaster.

### 7.11 Notifications
In-app real-time notifications + announcements by default (no external dep). Optional channels: email (if SMTP configured), Discord, webhooks. First-blood/solve/announcement/instance events all flow through the notifier abstraction.

---

## §8 — FRONTEND SPEC

SvelteKit + TS strict + Tailwind + Kitsune design tokens + Bits/Melt primitives. Deliver: auth flows (SSO/passkey/local/MFA), player challenge board (per mode), team/profile pages, live scoreboards (Jeopardy/KotH/A&D variants) with graphs, dynamic-instance controls, hints/writeups, the full admin surface (§7.10), the automation DAG editor, plugin/theme manager, and a docs-quality component library page. Realtime everywhere via the WS store. Full dark/light + CSS-variable theming + view transitions + restrained motion. WCAG AA, verified by axe. Cute-by-default voice + mascot, one-toggle to neutral-pro. All strings in an i18n catalog.

---

## §9 — LEAN vs FULL, ZERO-CONFIG BOOTSTRAP, MIGRATION

- **Lean mode:** default for `docker compose up`. Boots with bundled Postgres, in-process cache/event bus, local-disk storage, in-app notifications, local accounts. **Zero required external config.** Auto-generate secrets on first boot; guide the operator to create the first admin via first-run setup or `kit admin create`. Feature set ≈ “CTFd but better”: Jeopardy, teams, scoreboard, challenges, API, admin. Everything heavy (orchestration, A&D, automation builder, SSO, marketplace, NATS, S3, SMTP) is **present but off**, one toggle away.
- **Full mode:** flips the defaults toward everything-on, but each feature remains independently opt-out-able.
- **Config model:** layered — built-in sane defaults → `kit.toml`/`config.yaml` → env var overrides → live admin UI. Never require a value to boot.
- **CTFd → Kitsune importer:** a first-class, tested importer (`kit import ctfd <dump|url>`) that maps CTFd users/teams/challenges/flags/hints/solves/config into Kitsune with a clear compatibility report. Also support **ctfcli/`challenge.yml`** authoring in and out.

---

## §10 — DEPLOYMENT & `kit` CLI (ship ALL four targets)

All four must work and be documented:
1. **`docker compose up` golden path** (`deploy/compose/`) — the lean, one-command experience.
2. **Single OCI image / rootless Podman** path.
3. **Helm chart** (`deploy/helm/`) for Kubernetes (the blessed scale target).
4. **Terraform module** (`deploy/terraform/`).

**`kit` CLI** subcommands (all functional): `init`, `up`/`serve`, `migrate`, `seed`, `admin create`, `config`, `import ctfd`, `challenge` (new/validate/import/export via `challenge.yml`), `plugin` (add/remove/list/registry), `theme`, `deploy` (compose/helm/terraform helpers), `backup`/`restore`, `doctor` (env/health diagnostics), `version`.

---

## §11 — PERFORMANCE, SECURITY, OBSERVABILITY (non-negotiable)

- **Performance budgets (enforced by load tests):** p99 read-API latency < 100 ms and p99 write-API < 250 ms under sustained load representative of a live event; scoreboard/realtime update end-to-end latency < 1 s at 10k+ concurrent connected clients; cold home-page/board load fast and jank-free. Batch/backpressure realtime updates to hold these. If a budget can’t be met, fix the design — do not lower the bar.
- **Security:** Argon2id password hashing; CSRF protection; strict input validation; RBAC on every endpoint; signed webhooks; **SSRF protection** on all outbound requests (webhooks, automation HTTP nodes, remote challenges); rate limiting (`tower-governor`); container/network isolation for instances; WASM sandbox limits; secrets auto-generated and never logged; dependency and container image scanning in CI; sensible security headers; audit logging.
- **Observability:** OpenTelemetry traces/metrics/logs; Prometheus `/metrics`; health + readiness; shipped Grafana dashboards; structured logs.

---

## §12 — DOCS & DX

- **Docs site** in `docs/` using **Starlight** (Astro): getting started (lean path first), full-mode guide, every feature, all three game modes, deployment (all four targets), CTFd migration guide, plugin/theme developer guide (with the WIT interfaces + SDK + a walkthrough), automation-builder guide, API reference (rendered from the OpenAPI spec), architecture overview, and a configuration reference. Docs must be accurate to the shipped code.
- **DX:** `just` tasks for everything (`just dev`, `just test`, `just lint`, `just e2e`, `just load`, `just build`), a smooth `dev` experience, seed/demo data (`kit seed`) that produces a rich, believable demo event for screenshots/tests.

---

## §13 — LICENSE (proprietary source-available; owner keeps everything)

Kitsune is **NOT open source.** It is **source-available and proprietary.** Generate a bespoke license, `LICENSE` (name it the **“Kitsune Community License 1.0” / KCL-1.0**), that grants exactly and only these rights, and reserves all others to the copyright holder:

- ✅ **View** the source.
- ✅ **Self-host and run** unmodified Kitsune for the operator’s own events / internal use (including running events for others *at no charge as a non-commercial activity* — but see prohibitions).
- ❌ **No** distribution of the software or of **modified/derivative versions**.
- ❌ **No** creating forks, derivatives, or repackaged/rebranded products.
- ❌ **No commercial use**, including offering Kitsune (modified or not) as a **paid or managed hosting service** to third parties.
- ❌ **No** removing/altering notices or the license.
- All rights reserved to the copyright holder; the holder may relicense/sell/commercialize at will.

Practical instructions:
- Base the drafting conceptually on **PolyForm Strict 1.0.0** (non-commercial, no distributed derivatives) and add explicit clauses for **no managed/hosted-service offering** and **no repackaging/rebranding**.
- Add a **`CLA.md`** (contributor license agreement) assigning copyright of all contributions to the owner, so the owner remains **sole owner** and can relicense.
- Set every crate/package license field to `LicenseRef-KCL-1.0` (or `SEE LICENSE IN LICENSE`), add a `NOTICE`, and state the license clearly in `README.md` with a short licensing FAQ.
- Use a single fill-once placeholder **`[COPYRIGHT HOLDER]`** (and year) in `LICENSE`/`CLA.md`/`NOTICE`; do not invent a name.
- Add a visible note in the licensing FAQ: *“This is a source-available proprietary license, not an OSI-approved open-source license; have it reviewed by a lawyer before relying on it.”*
- Since the reference CTFd code is Apache-2.0, the clean-room rule in §1 also keeps Kitsune’s ownership and licensing clean — **do not** copy CTFd code into this proprietary codebase.

---

## §14 — DEFINITION OF DONE (acceptance gates — ALL must be green)

You may only consider the task complete when **every** box below is objectively true and verified:

- [ ] `docs/reference/ctfd-feature-parity.md` exists and every `[replicate]`/`[improve]` feature is implemented.
- [ ] **Jeopardy, KotH, and A&D** are each fully implemented and working, plus a minimal **workshop mode** proving mode-extensibility.
- [ ] Identity (individuals + teams + divisions + brackets), full auth set (blessed OIDC+passkeys + local + SAML + TOTP/MFA + email verify), RBAC, and audit log all work.
- [ ] Challenges (all types), dynamic-decay + static + custom scoring, hints/economy, unlock chains, first-blood, freeze/unfreeze, hidden/scheduled, writeups, surveys — all work.
- [ ] Orchestration works on the **Kubernetes** blessed path, with Docker/Podman and Nomad adapters present; per-team instances + A&D vulnboxes + flag rotation + SLA checkers function.
- [ ] Automation: event bus + signed outbound webhooks + full REST/WS API (OpenAPI) + **native visual automation builder** all work.
- [ ] Integrations shipped and working, all off-by-default and opt-out-able: **Discord bot** (first-bloods/notifs/account linking), **CTFd importer**, **ctfcli/`challenge.yml`** in/out, **S3** storage adapter, **SMTP** mailer, **Prometheus/OTel**.
- [ ] Plugin system (Wasmtime + Component Model + WIT, capability-based) works: ≥2 first-party example plugins + 1 alternate theme install and function; local + Git install work; registry/marketplace seam + in-app browse/install present.
- [ ] Frontend: full SvelteKit app + documented design system, realtime everywhere, dark/light + theming, i18n catalog.
- [ ] Branding (§3): original **Kon** mascot — an **anime fox-girl (kitsune-mimi)**, human-made/commission-quality (no AI final art, no third-party likeness) — with all required states; kitsunebi/foxfire + kitsune-lore microcopy woven through; **free tone-only** voice toggle; mascot **on by default**; a **free de-brand toggle** that works for anyone, framed with a warm “please support if unbranded” nudge + sponsor link; an **official one-click white-label** unlocked by the off-by-default `Entitlements.white_label` capability (nudge removed, custom logo/theme). Faithful to Anubis’s free-but-asked model — not a hard wall.
- [ ] **Lean mode** boots via `docker compose up` with **zero mandatory config** in under a minute; **full mode** works; every feature independently opt-out-able.
- [ ] All four deploy targets work and are documented: **compose, OCI/rootless Podman, Helm, Terraform**. `kit` CLI subcommands all function.
- [ ] **Tests all green:** Rust unit + integration (with `testcontainers` for PG/Redis/NATS), frontend component tests (Vitest), **e2e (Playwright)**, contract tests against OpenAPI, **a11y (axe) passes AA**, **load tests (Goose)** demonstrate the §11 budgets at 10k+ concurrency.
- [ ] **CI green:** GitHub Actions runs fmt + clippy (deny warnings) + eslint/prettier + `svelte-check` + typecheck + the full test suite + builds all OCI images + dependency/image scan — all passing. Coverage gates met.
- [ ] **Observability:** OTel tracing, Prometheus metrics, health/readiness, and shipped Grafana dashboards all present and working.
- [ ] **Docs site** complete, accurate, and building; API reference generated from OpenAPI; seed/demo data produces a rich demo event.
- [ ] **License:** `LICENSE` (KCL-1.0), `CLA.md`, `NOTICE`, README licensing FAQ present and consistent; no CTFd code copied; clean-room verified.
- [ ] **No** `todo!()`/`unimplemented!()`/placeholder logic/mock-standing-in-for-real/skipped or ignored tests anywhere in shipped paths.
- [ ] `docs/decisions/DECISIONS.md` records every non-obvious micro-decision you made.

If any box is not green, you are **not done** — return to the loop (§15) and finish it.

---

## §15 — AUTONOMOUS EXECUTION FRAMEWORK (how you run this to completion)

Run a single continuous **plan → execute → verify → update-ledger → repeat** loop with no pauses, no questions, no subagents, until §14 is fully green.

**First, create and maintain these ledger files** (keep them updated at the end of every cycle so the run is resumable and auditable):
- `docs/plan/PLAN.md` — the overall build plan and phase breakdown.
- `docs/plan/ARCHITECTURE.md` — the concrete architecture you’re implementing (keep in sync with reality).
- `docs/plan/MILESTONES.md` — ordered milestones, each with crisp, testable exit criteria derived from §14.
- `docs/plan/STATE.md` — current cursor: what’s done, in-progress, and next; updated every cycle.
- `docs/plan/TODO.md` — the live task ledger (granular, checkable).
- `docs/decisions/DECISIONS.md` — every micro-decision + one-line rationale.

**Suggested milestone order** (adjust as needed, but never skip scope): (1) workspace + CI skeleton + ledger + license + CTFd feature-parity doc; (2) core domain model, events, `EventBus`, scoring engine, `GameMode` trait, DB + migrations; (3) API + auth + RBAC + OpenAPI + realtime; (4) Jeopardy end-to-end + admin + scoreboard + frontend shell + design system; (5) integrations (Discord, CTFd import, ctfcli, S3, SMTP, Prometheus/OTel), all off-by-default; (6) orchestration (K8s blessed + adapters) + dynamic instances; (7) KotH; (8) A&D (game loop, vulnboxes, flag rotation, checkers/SLA); (9) automation builder + webhooks + SDK; (10) WASM plugin system + WIT + example plugins + theme + registry seam; (11) lean/full profiles + zero-config bootstrap polish; (12) full frontend polish + a11y (structure, layout, motion, empty/error states as neutral placeholders — **no Kon art yet**); (13) all four deploy targets + `kit` CLI; (14) test suites (unit/integration/e2e/contract/a11y/load) to green + performance-budget tuning; (15) docs site complete; (16) **mascot & branding pass (DO THIS LAST — see rule below)**: Kon artwork + all expressive states, foxfire/lore microcopy flourishes, delight-moment animations, identity-mark placement, final brand polish; (17) final §14 audit pass.

**MASCOT SEQUENCING RULE (do the mascot/branding-art LAST).** All of Kon’s *artwork* and visual flourish — the fox-girl illustrations/SVG/Lottie, the animated delight-moments, foxfire effects, lore microcopy polish, identity-mark styling — is deferred to milestone 16, executed **only after the entire functional product is built and milestones 1–15 are complete.** Do **not** spend cycles designing or animating the mascot early; it is polish, not plumbing. The distinction:
- **Branding *plumbing* is NOT deferred** — build it in place during the normal milestones because other systems depend on it: the i18n string catalog + free tone toggle (§3), the theming tokens (§8), a `<BrandMark>`/mascot **slot component** rendered with a neutral placeholder, the free de-brand toggle logic, and the `Entitlements.white_label` capability. These ship as working machinery with tasteful **neutral placeholders** (a simple wordmark, a plain silhouette in the Kon slot) so nothing is blocked and no rework is needed later.
- **Mascot *art & flourish* IS deferred to milestone 16** — only then do you produce Kon’s actual fox-girl artwork and wire it into the already-existing slots/states. Because the plumbing already exists, this milestone is drop-in: replace placeholders with Kon assets, add the delight-moment animations, and apply the lore microcopy. No architectural changes should be required at this stage — if they are, the plumbing in earlier milestones was done wrong; fix that.

This keeps the build focused on a real, fast, robust product first, with Kon as the final charming layer on top.

**Each cycle:**
1. Read `STATE.md`/`TODO.md`; pick the next task toward the current milestone.
2. Implement it fully and correctly (no stubs, no shortcuts).
3. Verify: compile, `fmt`, `clippy -D warnings`, eslint/prettier/`svelte-check`, and run the tests covering what you just built.
4. If red, fix before moving on. If a design flaw surfaces, fix the design.
5. Update the ledger files. Continue immediately to the next task.

**Hard rules during the loop (restating §0):** never stop, never ask, no subagents, no slop, no unmet gates. When a milestone’s exit criteria are met, move to the next. When ALL milestones and the entire §14 checklist are green, run one final full-suite + full-app smoke pass, update the ledger to “COMPLETE,” and only then finish. Anything short of that means keep going.

Begin now: create the ledger, write `PLAN.md` and the CTFd feature-parity doc, scaffold the workspace and CI, and start the loop. Do not stop until Kitsune is real, complete, fast, robust, delightful, and every gate in §14 is green.
