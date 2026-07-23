# Kitsune engineering handoff

Updated: 2026-07-23, Asia/Singapore

This is the complete working handoff for the next agent. Treat it as a precise
snapshot rather than a claim that the product is finished. The owner asked for
continuous autonomous delivery, but this handoff request supersedes the active
implementation loop until the next agent resumes it.

## Start here

Read these files in this order before editing anything:

1. [`../../AGENTS.md`](../../AGENTS.md) — binding frontend stack and mechanical
   design-system rules.
2. [`../design/INTERFACE_CONTRACT.md`](../design/INTERFACE_CONTRACT.md) —
   binding product-interface contract. It takes precedence over a generic UI
   pattern or component example.
3. [`../../PROMPT.md`](../../PROMPT.md) — the complete original build prompt.
   It is the canonical, exhaustive product specification; read it in full rather
   than relying only on this summary.
4. [`PLAN.md`](PLAN.md), [`TODO.md`](TODO.md), [`STATE.md`](STATE.md),
   [`MILESTONES.md`](MILESTONES.md), and [`ARCHITECTURE.md`](ARCHITECTURE.md)
   — the live product ledger and implementation sequence.
5. [`../decisions/DECISIONS.md`](../decisions/DECISIONS.md) — retained product
   decisions and exceptions.
6. [`../reference/ctfd-feature-parity.md`](../reference/ctfd-feature-parity.md)
   — the clean-room CTFd feature floor. The local `CTFd-reference-repo/` is for
   behavior/schema research only: do not copy its implementation, layout, or
   assets.
7. [`../../README.md`](../../README.md), root `package.json`, `Cargo.toml`, and
   `web/package.json` — commands, workspace boundaries, and current tooling.

### Ledger reconciliation note

The historical ledgers accurately record many backend and former Svelte-browser
journeys as completed, but they are **not** evidence that their old frontend
markup or route model can remain. The owner ordered a full frontend replacement:
Next.js App Router + SSR + React Aria is now the sole supported web runtime.
Treat old Svelte completion statements as domain/API evidence only. Rebuild each
visible route against the current shell and re-establish browser/a11y coverage
before marking it complete again. Similarly, `STATE.md` contains the phrase
“production-visible `/_kitchen`”; the binding design rules require the kitchen
sink to be development-only and absent from production navigation. Follow
`AGENTS.md`, not that stale wording.

## Owner directives that remain binding

These are the high-priority decisions supplied after the master prompt. They
are also encoded in `AGENTS.md` and the interface contract, but are repeated
here so they are not lost during handoff.

- Continue autonomously and persistently until the owner explicitly stops the
  work. Do not declare the project complete merely because a visible slice is
  working. After full functionality is built, continue auditing security,
  correctness, UI/UX, missing features, and test coverage.
- Do **not** use subagents. Do not use goal tools. Keep work tracked in the
  repository ledgers and the active task plan.
- Use frequent, small, reviewable Git commits. Push verified commits to
  `origin` (`git@github.com:simonfalke-01/Kitsune.git`). Check GitHub Actions
  after relevant pushes and fix real failures rather than weakening CI.
- Do not touch unrelated dirty worktree changes. In particular,
  `.github/workflows/ci.yml` was already dirty when this frontend slice began;
  preserve it unless the owner explicitly asks to change it. Do not stage it
  incidentally.
- Write readable, formatted code. Do not collapse components or control flow
  into one-line/minified-looking code. Run the formatter on every changed
  frontend slice.
- The data layer is intentionally SQLx with compile-time-checked SQL and
  migrations. Do not introduce an ORM merely to remove SQL. The owner asked
  about raw SQL; the chosen architecture in `PROMPT.md` explicitly requires
  SQLx and rejects a heavy ORM.
- The frontend is **Next.js App Router with SSR**, not SvelteKit and not a
  TanStack application. Keep existing TanStack Table usage; do not add
  TanStack Router, Query, DB, Store, Virtual, Pacer, Form, Start, or another
  TanStack package.
- React Aria Components are the only behavior/accessibility primitive layer.
  The project owns its design system under `web/src/components/ui/`. Do not
  install shadcn. The current shadcn React Aria Nova source may be consulted
  for behavioral/composition reference only.
- Tailwind v4 semantic tokens in `web/src/app.css` are the only visual source
  of truth. No arbitrary values, raw component colors, `!important`, or
  static inline styles. The narrow dynamic transform in `Progress` is an
  intentional allowed exception.
- Dark mode must be near-achromatic charcoal, not blue-black. Accent and
  status colors should be solid and restrained, never radioactive/neon.
- Do not overuse icons. Lucide only, one set, used only when it changes
  comprehension or supports an unlabeled control. No invented icon mark, no
  decorative icons beside ordinary labels, no icon-heavy navigation.
- Monospace is reserved for flags and actual code/commands/logs/code input.
  IDs, badges, labels, navigation, ordinary data, and operational metrics use
  the sans family; numeric tables use tabular figures.
- Do not write AI-slop copy. Delete redundant captions, subtitles, component
  documentation blurbs, and architecture narration. Descriptions are permitted
  only for genuine ambiguity or useful live state.
- Deep customization is first-class product architecture. Theme packs,
  white-label configuration, extension slots, plugins, and first-party screens
  must consume the same versioned semantic token contract. Never fork
  components for a theme.
- Do not ship generated mascot/placeholder art. Keep the mascot slot empty
  until human-authored approved artwork exists.
- Build test code after implementation, but drive all current work through real
  type, unit, integration, browser, visual, accessibility, security, and CI
  gates. The owner expects substantial test coverage.

### Concrete visual regressions the owner already rejected

Use this as a regression checklist during every visual pass. These are direct
product decisions, not optional aesthetic suggestions.

- Matched controls must have matched heights. Selects, comboboxes, text fields,
  and their button affordances cannot vary by a pixel because of inconsistent
  wrapper padding or line-height.
- Inputs must work as normal native editing controls. In particular, the
  passphrase/password field must support select-all, delete, retype, validation
  clearing, and accessible show/hide without stale error text.
- Field and label spacing must be compact and intentional. A one-line canonical
  event ID must not occupy a giant textarea-like box or be separated from its
  label by unexplained vertical space.
- Toasts remain bottom-left unless the owner changes that direction. They need
  shadcn-like, restrained translate/opacity entry and exit motion, immediate
  feedback, accessible labels, and no content shift. Verify intermediate frames
  rather than assuming CSS exists because a transition class was written.
- Async error states must size to their content. Do not make a short connector
  failure into a large empty red card. Expected unavailable-provider states are
  calm and compact with a recovery action when one exists.
- Disclosures/accordions must have identical outer insets whether open or
  closed. Hover/selected backgrounds stay inside the intended interactive row;
  they must not spill to full container width, steal summary padding, or create
  a broken gray slab.
- Event card title and category/tag share one aligned title row with a visible,
  deliberate gap. Tags cannot collide with, float above, or optically misalign
  with title text. Keep related health/progress/action information compact and
  remove unused vertical card space.
- Do not solve grouping by nesting rounded cards. Avoid giant blank regions,
  stacks of containers, oversize padding, and cards used as page wallpaper.
  Prefer compact rows, dividers, or a single discrete object card when the data
  truly needs an object boundary.
- Dark mode is warm/neutral charcoal rather than blue-black. It is not a neon
  terminal: status color is restrained and semantic, with strong text contrast.
- Do not use monospace for categories, event labels, IDs, badges, metrics, or
  navigation. Restrict it to flags and real code/command/log input/output.
- Do not add lock, shield, or generic Lucide icons beside obvious text labels.
  Use an icon only for an unlabeled compact action or when it changes
  comprehension. Empty imagery slots stay empty rather than receiving generated
  SVG art.
- Remove design-library narration such as “Development-only drift detector. It
  is excluded from production navigation.” from visible product UI. That fact
  belongs in documentation, not on the screen.
- Do not make a title plus a generic descriptive sentence the default pattern.
  Keep factual live state, real ambiguity resolution, and action consequences;
  remove all other explanatory copy.

## Current repository and Git state

- Working directory: `/Users/brandonli/Documents/Repositories/forgectf`
- Branch: `main`
- Remote: `origin git@github.com:simonfalke-01/Kitsune.git`
- Last pushed commit: `6fbf0ba feat(web): add SSR sign-in and challenge flow`
- Other recent pushed frontend commits:
  - `8205445 fix(web): harden React Aria component boundaries`
  - `a6270f4 feat(web): migrate React frontend to Next.js SSR`
  - `1bb6b1e feat(web): rebuild design system on React Aria`
  - `1c157f0 docs(frontend): record React Aria reset`
- Preserved pre-reset notification work is intentionally stored at
  `stash@{0}: wip: notification vertical slice before frontend reset`. Do not
  restore it until the frontend reset has all gates green.
- `.omc/` is untracked agent/runtime state. Do not stage it.

### Deliberately uncommitted files at handoff

These changes belong to the active, unfinished setup/E2E/a11y slice. Keep them
together, finish verification, then make one atomic commit. Do not stage the
unrelated workflow file unless its author explicitly asks.

| Path | Purpose / important detail |
| --- | --- |
| `.github/workflows/ci.yml` | **Pre-existing unrelated dirty change. Preserve, do not stage.** It adjusts the written justification for the existing RustSec advisory exception. |
| `web/src/app/setup/page.tsx` | New SSR first-run setup page: setup form, setup-complete sign-in link, designed API-unavailable state. |
| `web/src/app/setup/setup-form.tsx` | New RHF + Zod first-run organization/owner/password-confirmation form. Passwords use the shared accessible reveal primitive. |
| `web/src/lib/api/server.ts` | Adds server-side `getServerSetupRequired()` against `GET /api/v1/setup`. |
| `web/src/app/login/page.tsx` | Redirects to `/setup` while setup is required; leaves sign-in visible if setup-status lookup is temporarily unavailable. |
| `web/src/components/ui/toast.tsx` | Correct React Aria toast title/description slots and view-transition animation behavior. `Text slot="title"` and `Text slot="description"` are required for an accessible toast name/description. |
| `web/src/components/ui/navigation-link.tsx` | Fixes a React Aria render-prop misuse that made navigation labels disappear. It now renders direct children. |
| `web/src/components/ui/dialog.tsx` | Replaces unscoped `header`/`footer` with `div` in dialogs so dialogs do not create duplicate banner/contentinfo landmarks. |
| `web/src/components/ui/progress.tsx` | Changes the visual `Meter` wrapper to React Aria `ProgressBar` semantics. RAC's fallback `role="meter progressbar"` triggered Axe's invalid ARIA rule in this environment. |
| `web/src/components/layout/app-shell.tsx` | Raises small nav group labels from `text-subtle` to WCAG-compliant `text-muted`. |
| `web/src/components/layout/page-header.tsx` | Removes an unscoped `header` landmark from ordinary page headers. |
| `web/src/app.css` | Uses the darker semantic `*-12` text roles on light semantic backgrounds, improving status/toast/badge contrast. |
| `web/playwright.config.ts` | Lets local E2E reuse a user-visible server via `KITSUNE_E2E_URL`; CI still defaults to its own port 4173. This avoids Next 16's one-dev-server-per-build-directory lock. |
| `web/next-env.d.ts` | Generated by active Next dev/typegen; it now imports `.next/dev/types/routes.d.ts`. Treat this as generated output and verify whether it should be committed after the final type/build pass. |
| `tests/e2e/event-authoring.spec.ts` | Replaces stale Svelte-era browser journey with a real Next/React Aria setup → API-created live event → published challenge → flag submission → toast → Axe journey plus kitchen toast-motion test. |

## What was completed before this handoff

### React/Next frontend reset

- The legacy temporary frontend direction was replaced with React 19, Next.js
  App Router, SSR-compatible route composition, generated OpenAPI client use,
  and React Aria Components.
- `/_kitchen` exists as the development-only design-system drift detector. It
  renders both themes and the current primitive surface. It must stay excluded
  from production navigation, but it may be routable in development.
- The custom UI library contains React Aria wrappers for buttons, fields,
  password fields, select/combobox, checkboxes/radio/switch, dialog/popover/
  menu/tooltip/tabs/table/toast, and CTF/admin patterns such as alert, badge,
  breadcrumbs, card, disclosure, empty state, file drop zone, pagination,
  progress, sheet, skeleton, status, and tags.
- Every module importing React Aria Components is a Client Component. This
  fixed the prior Next RSC `createContext` runtime failure.
- The shared `PasswordField` has a working show/hide button. The implementation
  was specifically tested around select-all/delete/retype behavior because the
  owner reported deletion failure.
- Toasts have bottom-left placement currently (`ToastRegion`); the owner asked
  for shadcn-like entry/exit motion. The implementation uses CSS opacity/
  translate and a `ViewTransition` queue wrapper. Preserve the tested React
  Aria accessible slots rather than replacing it with a handmade toast.
- The current visual system uses Archivo display, Instrument Sans body, and
  IBM Plex Mono only for code/flags. It has light and near-neutral charcoal
  dark themes, semantic status tones, no gradients, restrained borders, and
  small radius/elevation.

### First SSR product slice

- `/` checks the server session and redirects to `/login` when unauthenticated
  or the API is unavailable.
- `/(platform)/layout.tsx` reads session and event/challenge bootstrap on the
  server, then gives that data to narrow client providers and the shared shell.
- `/login` is staged local sign-in with MFA continuation through the existing
  client form. It redirects to first-run setup if the server says setup is
  required.
- `/setup` is newly implemented but not committed yet.
- `/challenges` is SSR-backed with search, loading/empty/error states, compact
  challenge cards, a React Aria dialog, monospaced flag input only, idempotent
  submission, in-place solved state, and success toast.
- The platform `EventProvider` persists selected event in a cookie and
  localStorage, performs typed client refreshes, and retains SSR initial state.
- The app shell handles logout without navigating away when logout fails.

### Important UI/a11y fixes made during the current slice

- Use React Aria toast `Text` elements with `slot="title"` and
  `slot="description"`; `strong`/`span` alone left `alertdialog` unnamed.
- Never use bare `<header>` or `<footer>` inside a dialog or page body unless it
  is deliberately scoped by sectioning content. Axe treated them as duplicate
  landmarks.
- React Aria `TextFieldProps` are props for the field root, not a generic input
  prop bag. If a new browser-input attribute is needed, extend the wrapper to
  pass it to `Input`; do not blindly spread it onto `TextField`.
- Wait for React Aria overlay exit before a full-page Axe assertion. Auditing
  during the 180ms fade makes text appear low-contrast due to compositing.
- Avoid duplicate test locators in the two-theme kitchen; scope them to one
  preview or intentionally use `.first()`.

## Current local runtime state

Do not blindly kill these processes: the owner explicitly asked to keep the
visible dev server available.

- Next development server is listening on port `5173` (currently started from
  `web` with `next dev --port 5173`). Verify with:

  ```sh
  lsof -nP -iTCP:5173 -sTCP:LISTEN
  curl -I http://127.0.0.1:5173/_kitchen
  ```

- The normal command to start a fresh visible server after intentionally
  stopping an old one is:

  ```sh
  pnpm --dir web dev --hostname 0.0.0.0 --port 5173
  ```

- A local Docker PostgreSQL container named `kitsune-dev-pg` is exposed on
  `127.0.0.1:54329`. The dedicated E2E database is `kitsune_e2e`.
- A `kitsune-server` process currently listens on port `3000`. It was spawned
  by the most recent local E2E attempt and may be safely inspected with
  `lsof -nP -iTCP:3000 -sTCP:LISTEN`; do not assume it is a durable developer
  server. Keep the frontend dev server alive unless the owner says otherwise.
- The E2E database was recreated once because its previous schema recorded a
  removed migration `17`. That destructive action was strictly limited to the
  disposable `kitsune_e2e` database, never the normal development database.
- `web/next.config.ts` contains `allowedDevOrigins: ['127.0.0.1',
  'dev.vortq.com']`, which resolves the prior Next development HMR warning for
  the owner’s `dev.vortq.com` preview host. Retain this unless the preview host
  is deliberately changed, then update it explicitly and restart Next.

## Verification status at handoff

### Confirmed green before the latest a11y refinements

These ran successfully after adding setup flow and before the final semantic
and dialog refinements:

```sh
pnpm --dir web format
pnpm --dir web check
pnpm --dir web lint
pnpm --dir web test
pnpm --dir web build
```

Result: strict TypeScript, lint, two Vitest tests, and Next production build
were green. The production route manifest showed `/challenges`, `/login`, and
`/setup` as request-time server-rendered routes and `/_kitchen` as static.

### Browser E2E progress

The new browser suite is deliberately narrower than the obsolete Svelte-wide
test. It validates a real product vertical slice rather than stale markup:

1. first-run setup or sign-in;
2. authenticated session and CSRF retrieval;
3. typed API creation of a draft event;
4. transition to live;
5. typed API creation of a published static-flag challenge;
6. SSR event-cookie selection;
7. player challenge dialog and correct flag submission;
8. solved state and success toast;
9. full-page Axe audit after overlay exit;
10. kitchen toast entry animation and toast-scoped Axe audit.

Use the following local command while the owner-visible server is running:

```sh
KITSUNE_E2E_URL='http://127.0.0.1:5173' \
KITSUNE_E2E_DATABASE_URL='postgres://kitsune:kitsune@127.0.0.1:54329/kitsune_e2e' \
pnpm --dir web test:e2e
```

The full local browser suite was rerun after the final a11y patches and passed
on 2026-07-23: all four tests (Chromium and mobile challenge journeys plus
Chromium and mobile toast-motion/Axe checks) passed in 7.5 seconds. Re-run the
exact command after any subsequent change to the setup, session, event,
challenge, toast, token, or overlay paths.

Earlier failures and their intended fixes:

| Failure | Fix already present |
| --- | --- |
| Old GitHub E2E expected removed Svelte copy such as “Raise your first torii.” | Replaced test with actual Next/React Aria setup and challenge journey. |
| Backend refused stale `kitsune_e2e` migration history | Recreated only the disposable E2E DB. |
| Next 16 refused a second dev server due `.next/dev/lock` | E2E config supports reusing `KITSUNE_E2E_URL=5173` locally; CI defaults to isolated port 4173. |
| Toast lacked accessible name | Uses official RAC `Text` title/description slots. |
| Full-page Axe saw duplicate banner landmarks | Dialog and page header no longer create unscoped header/footer landmarks. |
| Mobile Axe saw a dialog mid-exit and failed contrast | Test waits for dialog hidden; semantic light status text now uses darker `*-12` roles. |

### GitHub Actions status

At handoff, latest pushed main CI run is:

- `29984914222` for `6fbf0ba` — **failed** only in Browser E2E because CI still
  ran the old Svelte-era test before the uncommitted replacement existed.
- The Rust, Web, and dependency-audit jobs were reported green in the prior
  inspection.
- The prior failure `29984030406` has the same root cause.

After committing the current slice, immediately push and inspect:

```sh
git push origin main
gh run list --repo simonfalke-01/Kitsune --limit 5
gh run view <run-id> --repo simonfalke-01/Kitsune --log-failed
```

The current E2E configuration's CI default remains `localhost:4173`; CI does
not have the developer's 5173 server, so Playwright will start its own server.

## Exact next actions, in order

1. Preserve all currently dirty files and read this handoff plus `AGENTS.md`.
2. The local frontend and browser gates have passed for the current slice;
   rerun them after any change. The frontend sequence is:

   ```sh
   pnpm --dir web format
   pnpm --dir web check
   pnpm --dir web lint
   pnpm --dir web test
   pnpm --dir web build
   ```

3. Run the exact local browser command above after changes. Fix the test or
   product if either Chromium or mobile fails. Do not mask Axe rules or relax
   accessibility assertions without a real accessibility rationale.
4. Run the mechanical token scan from `AGENTS.md`, inspect both themes at wide
   and 360/390px widths, and take/inspect screenshots. Watch specifically for:
   field height alignment, card title/tag alignment, hover inset, toast entry/
   exit, no pointless empty vertical regions, and no stray monospace/icon use.
5. Determine whether `web/next-env.d.ts`'s generated `.next/dev` reference is
   the expected current Next 16 generated output. Do not hand-edit it merely to
   quiet a diff; regenerate through the normal Next command and commit it only
   if the generated project state requires it.
6. Update `docs/plan/TODO.md` and `docs/plan/STATE.md` with the final verified
   result. This handoff file should remain as a historical continuation note.
7. Stage only the active slice (explicit file list; exclude `.github/workflows/
   ci.yml` and `.omc/`), commit with GPG signing disabled if necessary, and
   push. Suggested commit split:
   - `feat(web): add SSR first-run setup and browser journey`
   - `fix(web): harden React Aria accessibility semantics`

   If both rely on each other for green CI, one atomic commit is preferable to
   a broken intermediate commit.
8. Inspect the resulting GitHub Actions run and repair all real failures before
   beginning the next route.
9. Resume product work with the next user-facing SSR slice:
   - scoreboard (ranked board, filters, freeze/hidden/public state, history);
   - team (roster, invitations, membership, event registration);
   - account/security;
   - organizer event/challenge/automation/access/audit/settings surfaces using
     compact TanStack Table + React Aria data-table composition and dialogs.
10. Only after the frontend reset gates are genuinely green, restore the
    notification vertical slice from `stash@{0}` and continue the pre-reset
    milestone.

## Product backlog after the immediate frontend slice

The full master prompt is much larger than this list. The next agent must use
`MILESTONES.md` and `TODO.md` as the detailed source. The largest unfinished
areas explicitly recorded there are:

- Complete every player, account, and organizer route on the React/Next shell.
- Complete remaining server bootstraps, mutation invalidation, authenticated
  realtime behavior, data tables, dialogs, and route-specific empty/loading/
  error states.
- Make versioned theme packs, white-label settings, assets, density, motion,
  typography, semantic colors, and plugin extension slots truly first-class.
- Rebuild score/history visualizations and automation DAG from approved
  primitives without adding dependencies.
- Finish versioned REST/OpenAPI resources and all mode-specific, auth-provider,
  plugin, integration, and administrator surfaces.
- Implement Prometheus metrics, OpenTelemetry, Grafana-ready direct data
  sources/provisioning/dashboards, and a calm organizer live-ops observability
  surface.
- Implement demand-aware per-team/per-player instance provisioning, quotas,
  warm capacity, readiness, lifecycle reaping, K8s/Docker/Podman/Nomad adapters,
  HPA/KEDA-compatible capacity signals, and visible instance state.
- Finish automation, signed webhooks, plugin Component Model host/WIT SDK,
  marketplace seam, declarative themes, and example extensions.
- Finish lean/full bootstrap, CLI coverage, compose/Podman/Helm/Terraform
  deployment paths, documentation, performance/security hardening, and all
  `PROMPT.md` §14 acceptance gates.
- After functional completion, continue auditing bugs, missing behavior,
  security holes, a11y, visual quality, and test coverage until explicitly
  stopped by the owner.

### Full current open-ledger snapshot

Keep `TODO.md` and `MILESTONES.md` authoritative and update them as work lands.
At handoff their unchecked work falls into the following explicit groups:

1. **Frontend reset and customization:** versioned theme/white-label/extension
   contract; every player/auth/account/organizer screen rebuilt on Next;
   remaining SSR bootstraps and realtime mutation invalidation; scoring chart
   and automation DAG reconstruction; full visual/a11y/browser gate; commit,
   push, and restore the notification stash only after reset gates pass.
2. **Core/API completion:** feature repositories and mode-state optimistic
   concurrency; milestone-wide format/Clippy/unit/integration validation;
   remaining versioned REST/OpenAPI resources; all mode-specific,
   auth-provider, plugin, integration, and administrative surfaces.
3. **Observability:** bounded Prometheus metrics; configurable OTel logs/traces;
   Grafana data source/provisioning/dashboard artifacts; useful organizer
   event/submission/instance/automation/system-health explanations.
4. **Instance orchestration:** isolated per-team/per-player Jeopardy and A&D
   instances; idempotent health-aware provisioning, warm capacity, quotas,
   resource caps, and backpressure; Kubernetes HPA/KEDA-capable signals; lease
   reaping and cross-team-safe flag rotation with live state.
5. **Remaining audited milestone exit criteria:** the ledger deliberately still
   leaves Milestones 01–17 unchecked until each full acceptance criterion is
   independently evidenced. The required end-state includes integrations,
   KotH, A&D, automation, plugins/WIT/marketplace, lean/full profiles,
   deployment targets and CLI, all UX, tests/10k load/security/coverage/perf,
   docs/seed data, approved original Kon art, and every `PROMPT.md` §14 gate.

## Design and implementation checklist for every new screen

Before a screen is called complete, verify all of these rather than treating
visual code as done at first render:

- It starts from the real player/captain/author/operator task, not database
  entity fields.
- It uses the shared page shell, header, UI primitives, and semantic tokens.
- It has no redundant caption/description/eyebrow, no decorative icon, and no
  non-code monospace.
- It has a designed loading, empty, error, and recovery state for every async
  region.
- It keeps related object state, controls, and actions together; no stack of
  empty cards or excessive whitespace.
- It works in light/dark, keyboard-only, desktop and 360px mobile; focus is
  always visible; dialogs trap/restore focus and Escape closes them.
- It meets contrast and reduced-motion requirements.
- It receives a visual screenshot review, including hover and overlay states.
- Its mutations are idempotent where needed, preserve scroll/context, show a
  busy state immediately, update the local object, and use the shared toast.
- It receives typed API tests and a real browser journey where it crosses a
  meaningful user workflow.

## Useful commands

```sh
# Frontend quality gates
pnpm --dir web format
pnpm --dir web check
pnpm --dir web lint
pnpm --dir web test
pnpm --dir web build

# Root workspace gates (inspect package scripts before broad runs)
pnpm lint
pnpm check
pnpm test
pnpm build

# Rust quality gates
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features

# Regenerate generated API contract; never hand-edit schema client output
pnpm --dir web generate:api

# Inspect current Git state before every commit
git status --short
git diff --check
git diff --name-only

# Inspect GitHub CI
gh run list --repo simonfalke-01/Kitsune --limit 8
gh run view <run-id> --repo simonfalke-01/Kitsune --log-failed
```

## Final cautions

- Do not call the project "complete" until the full original `PROMPT.md` §14
  acceptance matrix is green. There is substantial backend, orchestration,
  observability, automation, marketplace, deployment, and UX work remaining.
- Do not overwrite the user’s unrelated changes, especially the dirty workflow
  file. Use explicit staging lists.
- Do not resurrect Svelte components, routing, data stores, or stale E2E copy.
  The supported frontend path is Next.js App Router + SSR + React Aria.
- Do not restore the notification stash early; it predates this frontend reset
  and can reintroduce incompatible UI assumptions.
- This document intentionally points to `PROMPT.md` for the full original
  prompt rather than duplicating a huge specification that could drift. The
  file is in the repository and remains the authoritative verbatim source.
