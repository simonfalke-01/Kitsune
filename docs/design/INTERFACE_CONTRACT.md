# Kitsune interface contract

This contract is a release requirement for every Kitsune surface. It adapts
the project-wide interface review rules to Kitsune's React, React Aria, and
Next.js architecture. When review exposes a reusable failure mode, add the
general rule here before closing the issue.

## 1. Model the real task

- Competitors need to find a challenge, understand it, submit a flag, and see
  the result without losing their place.
- Captains need to manage a roster, registration, and team instances without
  leaving the current event context.
- Authors need to draft, validate, preview, publish, and revise a challenge.
- Operators need to assess live state, find the affected object, and take one
  bounded action with an auditable result.
- Administrators need compact collections, safe editing, explicit authority,
  and complete destructive-action safeguards.
- Build each route around one of these sequences, not around database entities
  or API endpoints.
- Remove steps that do not change a decision. Use progressive disclosure for
  advanced policy, orchestration, and integration controls.
- Keep the current event, object status, and relevant action beside the
  decision they affect.
- Preserve values, filters, scroll position, and open context during in-place
  changes. Repeated actions must work repeatedly.

## 2. Copy is interface

- Prefer deleting copy over rewriting it.
- Do not add a subtitle, caption, or helper sentence merely because a component
  has a slot for one.
- Subtitles may report live state. They must not explain the page, narrate the
  architecture, advertise a feature, repeat the heading, or describe visible
  controls.
- Do not use eyebrow labels unless they are actual breadcrumbs or necessary
  taxonomy.
- Label a section once. Add an explanation only when the user cannot make the
  decision without it.
- Use terse, factual fragments in sentence case. Avoid semicolons, em dashes,
  centered dots, ornamental arrows, filler, and unnecessary periods.
- Do not manufacture symmetrical marketing copy. Use the shortest natural
  label for each datum.
- Buttons state the exact action and retain that name through dialog, busy
  state, result, and toast.
- Errors say what happened and what the user can do. Never expose raw status
  codes, responses, traces, reconciliation details, or internal lifecycle
  vocabulary.
- Empty states lead with the next useful action. They do not apologize or fill
  space with illustration and prose.
- Monospace is reserved for flags and actual code, commands, logs, or code
  input. IDs, badges, labels, navigation, metrics, and ordinary operational
  data use the sans family with tabular figures where alignment matters.

## 3. Framework and design-system boundary

- Next.js App Router owns routing, layouts, metadata, SSR, streaming, and route
  boundaries.
- Server Components render stable page structure and initial readable content.
  Client Components begin at the narrowest boundary that needs browser state
  or interaction.
- React Aria Components provide all interaction and accessibility primitives.
  Product components compose wrappers from `web/src/components/ui`.
- Current shadcn React Aria Nova source may be inspected as a behavioral and
  composition reference. Kitsune does not install shadcn or copy its theme.
- TanStack Table is the only approved TanStack package. Do not add TanStack
  Router, Query, DB, Store, Virtual, Pacer, Form, Start, or other TanStack
  packages.
- Tailwind CSS v4 consumes semantic CSS variables from `web/src/app.css`.
  Product components contain no one-off theme colors, arbitrary dimensions,
  inline presentation styles, or `!important`.
- Lucide is the only icon set. Icons must clarify an action or state.
- Do not add an icon beside an obvious text label, inside a decorative chip, or
  as a substitute brand mark. Prefer text alone. A surface should contain only
  the few icons that materially improve recognition or expose an unlabeled
  control.
- React Hook Form and Zod own non-trivial form state and validation.
- CSS transitions own ordinary motion. Motion is limited to gestures or layout
  transitions that CSS cannot express cleanly.
- `web/src/app.css` is the source of truth for visual tokens. Theme packs,
  white-label configuration, plugins, and first-party screens share the same
  semantic contract.

## 4. Structure and density

- Primary event, challenge, team, and operational content is the visual center.
  Reduce chrome around it.
- Do not build rows of decorative KPI cards. Use a compact metric strip or
  inline metrics.
- Cards are for discrete objects. Do not wrap every section, nest rounded
  rectangles, or place a full-width card on a tinted canvas by default.
- Use one elevation level at most. Prefer quiet borders and surface changes.
- Keep one small radius scale, one field-height scale, one page shell, and one
  spacing rhythm.
- Operational tables, toolbars, and controls favor scan speed over empty space.
- Related information sits horizontally when space allows.
- Parallel siblings align and use equal height. Unrelated or intrinsically
  sized states must not stretch merely because they share a grid row.
- Put status, totals, freshness, filters, and actions beside the object or
  collection they describe.
- Compact cards keep short status or category tags on the title row with
  deliberate alignment and a visible gap.
- Every standard route uses the shared page shell and page header. Route files
  do not repeat shell width, top padding, or title styling.
- Fixed workspaces own an explicit viewport-relative height and use internal
  scroll regions. Never suppress document scrolling without owning that height.

## 5. Forms and selection

- Fields use the shared React Aria field composition for labels, descriptions,
  validation, and control grouping.
- Use RadioGroup for one visible choice, Checkbox for independent choices,
  ToggleGroup for compact modes, Select for long lists, and ComboBox for
  searchable lists.
- Search sits with the collection it filters and updates as the user types.
- Password creation requires password and confirmation fields plus an
  accessible show or hide control.
- Temporary credentials must be replaced after first authentication and before
  application access.
- Occasional creation, credential, configuration, and management workflows open
  from a concise action into a Dialog.
- Tables summarize. When editing controls would dominate scanning, open the
  complete form from one row action.
- Hover, focus, and selected surfaces retain internal padding and a stable hit
  area.
- Controlled values are initialized from server data during the first render.
  Do not rely on an effect to repair hydration.

## 6. Tables and collections

- Interactive datasets use the shared DataTable composition: TanStack Table
  state and column definitions rendered through React Aria Table primitives.
- Keep filtering and column visibility in one toolbar above the bordered table.
  Put selection count and pagination in one footer below it.
- Every collection uses the same anatomy, density, alignment, empty state,
  error state, loading state, action placement, and pagination behavior.
- Key rows by stable database identity, never array position.
- Selection checkboxes appear only when relevant batch actions exist.
- Filtering resets to the first page. Pagination preserves relevant filters and
  safely clamps invalid pages.
- Icon-only action columns have a screen-reader-only header, narrow fixed width,
  and matching right alignment.
- Default states are plain text or omitted. Colored badges are reserved for
  exceptions, warnings, failures, and time-sensitive states.
- Static status does not use hover styling.
- Detail and sensitive-value actions open a Dialog or Sheet. Sensitive values
  have explicit copy actions.
- Map backend lifecycle states to the few user-facing states needed for the
  decision. Do not expose accessor keys or database field names.

## 7. Feedback and state changes

- Transient results use the shared React Aria toast queue in the bottom-right
  corner. Toasts never shift page content.
- Persistent route problems may use Alert. Validation remains beside its
  field. Destructive confirmation uses AlertDialog.
- Never use browser `alert`, `confirm`, or `prompt`.
- Destructive dialogs name the object, state the consequence, and offer a safe
  cancel action.
- Async actions preserve the page and scroll position, prevent duplicate
  submission, update the affected object, and report completion through the
  shared feedback channel.
- Primary actions acknowledge input immediately with a disabled busy state.
- Expected domain failures receive designed recovery actions.
- Background state must stop claiming that work is running after it is
  superseded, timed out, completed, or canceled.

## 8. Dialogs and disclosures

- Dialog is for focused creation, setup, credential, and detail tasks.
  AlertDialog is for destructive confirmation only.
- Overlays have one clear title, an optional concise description, a stable
  body, and the shared responsive action footer.
- Titles and descriptions remain left aligned at every width.
- Narrow layouts stack equal-width actions. Wide layouts use content-width
  actions aligned to the end.
- Overlays restore focus, close on success, remain open on validation failure,
  and close with Escape through React Aria behavior.
- Do not replace handlers provided by close primitives. Coordinate follow-up
  state from the root open-change callback.
- Disclosure summaries and panels have independent padding. Opening a panel
  cannot steal the summary inset.
- Collapsible content animates bounded height and opacity and respects reduced
  motion.

## 9. Authentication and authorization

- Authenticate username and password first. Ask for a second factor only when
  required.
- Pending authentication is disabled and session creation remains idempotent.
- Do not prefill privileged usernames or credentials.
- First-time password replacement occurs after successful authentication and
  before product access.
- Navigation and actions match actual permissions. Unauthorized controls are
  absent and protected again by the server.
- Two-factor setup lives in a Dialog, uses a six-digit OTP control, and leaves
  no setup state when abandoned.
- User administration includes creation, editing, deactivation, and deletion
  where allowed. Protect the current user and final active platform manager.

## 10. CTF and operational surfaces

- Challenge discovery keeps search, categories, solve state, points, and the
  submission action in one task flow.
- Flag input is monospaced. Challenge prose, metadata, categories, and scoring
  are not.
- A flag submission updates in place, preserves the challenge position, and
  gives an immediate pending state followed by exact feedback.
- Scoreboard controls sit with scoreboard state. Frozen, hidden, delayed, and
  public states use factual user-facing language.
- Team-instance controls show ownership, readiness, expiry, capacity, and
  connection data together. Secrets are explicit copy actions.
- Health labels describe what is actually measured. Stored inventory is not
  provider health.
- Detailed probes remain collapsed behind a concise status line.
- Expected unavailable providers are muted as whole objects rather than
  amplified into large red panels.
- Refresh actions say Refresh. Avoid implementation terms such as probe,
  reconcile, fanout, outbox, lease CAS, or projection.
- Async jobs appear in the collection immediately after persistence, before
  slow remote work starts.
- Retry labels and displayed state agree. Terminal states explain the next
  available action.
- Import and synchronization actions state their true direction and conflict
  semantics.

## 11. Navigation and branding

- Product name, page title, mark, and icon come from approved brand assets and
  configuration.
- The mascot slot stays empty until approved human-authored artwork exists.
  Never invent placeholder character art.
- Do not render navigation for a single destination.
- Adjacent navigation targets have a visible gap. Hover and selected surfaces
  do not touch.
- Mobile multi-route navigation uses the shared React Aria Sheet.
- In-place actions preserve route, filter, and scroll context.
- Initial route content is server rendered where possible. Stale network data
  refreshes in the background or behind an explicit Refresh action.
- Global navigation never blocks on an unrelated external synchronization.

## 12. Accessibility and resilience

- Icon-only actions have accessible names and useful tooltips where ambiguity
  remains.
- Focus order follows visual order. Focus remains visible and overlays trap and
  restore it through React Aria.
- Controls expose selected, disabled, invalid, expanded, and busy states
  semantically.
- Color is never the only status carrier.
- Every route works from 360px through wide desktop without clipped actions,
  accidental horizontal scroll, or hidden recovery paths.
- Light and dark themes preserve hierarchy, contrast, affordance, and comfort.
  Dark mode is near-achromatic charcoal, not pure black or blue-tinted chrome.

## 13. Route audit

Before a user-facing route is complete:

1. Walk its primary task, cancel, retry, refresh, back, and repeated-use paths.
2. Inspect light and dark modes at narrow and wide widths.
3. Compare title baseline, shell width, density, fields, radii, action
   hierarchy, and feedback with sibling routes.
4. Verify collection search, filtering, empty/loading/error states, pagination,
   page-size change, direct page jump, and action alignment where applicable.
5. Verify destructive actions use AlertDialog and transient results use the
   shared bottom-right toast.
6. Read every label aloud. Delete exposition, repetition, generic SaaS copy,
   decorative punctuation, centered dots, and unnecessary periods.
7. Search for raw interactive HTML, browser dialogs, hard-coded theme colors,
   arbitrary values, inline styles, duplicate separators, and local
   reimplementations of UI primitives.
8. Verify async work preserves scroll and updates content without a document
   refresh.
9. Run format, lint, strict typecheck, tests, production build, keyboard review,
   Playwright screenshots, and axe.
10. Record any new reusable failure mode in this contract.
