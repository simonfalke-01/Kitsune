# Kitsune interface contract

This contract is a release requirement for every Kitsune surface. It adapts
the project-wide interface review rules to Kitsune's Next.js, React Aria,
Tailwind, and CTF architecture. Generic shadcn, Svelte, commerce, and payment
examples are not implementation instructions for this repository. Their
underlying interaction rules apply only after translation into Kitsune's
locked stack and real competitor or operator task. When review exposes a
reusable failure mode, add the general rule here before closing the issue.

## 1. Model the real task

- Competitors need to find a challenge, understand it, submit a flag, and see
  the result without losing their place.
- A Kitsune deployment presents one active competition to competitors. Resolve
  it in platform state. Do not make players select an event before they can
  compete.
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
- Do not display state merely because the backend exposes it. A label such as
  `Live now` is useless when the entire surface already represents the active
  live event and the label changes no action.
- Preserve values, filters, scroll position, and open context during in-place
  changes. Repeated actions must work repeatedly.

## 2. Copy is interface

- Prefer deleting copy over rewriting it.
- Do not add a subtitle, caption, or helper sentence merely because a component
  has a slot for one.
- Subtitles may report live state. They must not explain the page, narrate the
  architecture, advertise a feature, repeat the heading, or describe visible
  controls.
- Delete implied-state labels, redundant totals, and repeated metadata. If the
  route, section, control, or surrounding state already communicates a fact,
  do not print the fact again.
- Do not use eyebrow labels unless they are actual breadcrumbs or necessary
  taxonomy.
- Label a section once. Add an explanation only when the user cannot make the
  decision without it.
- Use terse, factual fragments in sentence case. Avoid semicolons, em dashes,
  centered dots, ornamental arrows, filler, and unnecessary periods.
- Do not manufacture symmetrical marketing copy. Use the shortest natural
  label for each datum.
- Test project names, browser names, timestamps, random suffixes, database IDs,
  and fixture keys never appear as user-facing event or challenge copy.
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
- Archivo carries restrained display hierarchy. Instrument Sans carries
  interface and body text. JetBrains Mono is reserved for flags, code,
  commands, and logs. Components consume only the shared font tokens.

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
- Use color to encode real structure: interactive blue for event context,
  focus, and selection; restrained category color for challenge grouping;
  green only for a confirmed solve; warning and danger only for states that
  require attention. A screen must not become an undifferentiated gray field,
  but color may not be sprayed across decorative chips and cards.

## 4. Structure and density

- Primary event, challenge, team, and operational content is the visual center.
  Reduce chrome around it.
- Do not build rows of decorative KPI cards. Use a compact metric strip or
  inline metrics.
- Cards are for discrete objects. Do not wrap every section, nest rounded
  rectangles, or place a full-width card on a tinted canvas by default.
- Use one elevation level at most. Prefer quiet borders and surface changes.
- The neutral surface ladder must remain perceptible without becoming striped:
  light mode uses a slightly darker canvas beneath a lighter raised surface;
  dark mode steps upward in lightness from canvas to raised surface. Sunken
  fields, default borders, hover, and active states each retain a distinct
  adjacent step. Increase contrast in shared roles, never by adding local
  outlines or darkening individual cards.
- Keep one small radius scale, one field-height scale, one page shell, and one
  spacing rhythm.
- Operational tables, toolbars, and controls favor scan speed over empty space.
- Related information sits horizontally when space allows.
- Parallel siblings align and use equal height. Unrelated or intrinsically
  sized states must not stretch merely because they share a grid row.
- Vertically centered interface text uses the shared optical-offset token, not
  mathematically symmetric padding. Preserve the component's total height by
  adding the offset above the line and subtracting it below; prose and
  multi-line reading surfaces retain symmetric leading and padding.
- Put status, totals, freshness, filters, and actions beside the object or
  collection they describe.
- Compact cards keep short status or category tags on the title row with
  deliberate alignment and a visible gap.
- Every standard route uses the shared page shell and page header. Route files
  do not repeat shell width, top padding, or title styling.
- Fixed workspaces own an explicit viewport-relative height and use internal
  scroll regions. Never suppress document scrolling without owning that height.
- A fixed challenge workspace has exactly two desktop scroll owners: the
  challenge collection and the selected challenge detail. The document, page
  shell, event trail, split root, and nested sections do not scroll.
- The desktop splitter owns its value when a screen does not control it. Drag,
  touch, and arrow-key resizing update the pane immediately without changing
  the selected challenge or either pane's scroll position.
- The desktop splitter is visible as a functional divider and owns a forgiving
  pointer target. A keyboard-only value change does not prove the pointer
  interaction works. Pointer dragging must be tested against the rendered
  target and update pane geometry continuously.
- The splitter grid boundary, visible grip, and pointer calculation consume one
  literal workspace percentage. They must not derive parallel coordinates from
  separate tracks. Pointer movement preserves fractional percentages and writes
  that coordinate synchronously; integer keyboard steps remain available
  through the React Aria slider semantics.
- User-adjusted workspace splits persist across reloads and synchronize across
  tabs. Persist only committed drag or keyboard values; synchronous storage on
  pointer movement is prohibited because it compromises direct manipulation.
- Resolve persisted workspace splits in the document head before first paint.
  Server-rendered split geometry must consume the validated pre-paint value and
  clamp it to the component range; hydration must not expose the default width
  before restoring the user's preference.
- Selection feedback is optimistic. A challenge row marks itself selected and
  changes the detail in the activation frame; URL synchronization must never
  sit on the critical feedback path.
- Challenge selection and non-default detail tabs are represented in the URL.
  Back, forward, refresh, and direct links restore the visible challenge and
  tab; clearing selection removes both parameters without disturbing unrelated
  query state.
- Challenge workspace memory is event-scoped. It preserves the collection
  position plus each challenge's last available tab and per-tab detail scroll
  position. Restoring one value must not reset the others, and malformed or
  unavailable stored values fall back safely.
- Challenge workspace accelerators are additive: Slash focuses search; J and K
  move the actual selection through currently visible challenge rows and update
  detail in the same frame; Enter uses the focused row's normal link behavior;
  D, S, and H choose detail tabs; brackets resize the desktop split. Editable
  controls, composition, modifier chords, and open overlays must not trigger
  them.
- Escape exits challenge search and restores focus to the selected rendered
  challenge row when available. The next J or K movement continues from that
  row and advances selection.
- The event trail owns one concise shortcut reference reachable by pointer and
  keyboard. Every command retains a visible equivalent, and focus movement is
  visually agrees with selection when J or K changes the active challenge.
- The challenge route composes global navigation, event identity, live
  progress, standing, and global actions into one persistent header. Its solve
  progress rail is the header's lower edge. A separate global bar is hidden
  only while this merged header exists, so loading and error states retain an
  escape path.
- Desktop focus mode reduces the collection to the shared collapsed-rail width
  without unmounting either pane or overwriting the persisted split. The rail
  owns only Show challenge list; it does not become a parallel category index
  or duplicate challenge and event state. The detail's tab, scroll position,
  form state, and submission feedback survive entry and exit. The collection
  toolbar owns the collapse control beside its other view controls. F toggles
  it; Escape exits only when no overlay owns Escape. Focus mode is intentionally
  session-local and never restored on reload.
- Focus-mode collapse and expansion use the shared slow duration and spatial
  easing on one pane track. Mounted collection and rail content cross over with
  the shared fast transform and opacity transition. Pointer resizing disables
  the pane transition, and reduced motion resolves the state change instantly.
- The flag field reserves a flexible validation line before submission so
  ordinary one-line feedback never changes sticky-dock height; text enlargement
  and long localized errors remain free to reflow.
- First blood is an achievement state, not a warning. Its sidebar wash, solved
  confirmation, toast, screen imprint, and field wave consume the shared
  first-blood gold role. Its viewport edge color is an independent typed
  presentation setting: first-blood color, another approved semantic color, or
  rainbow. Ordinary solves continue to use success green.
- The first-blood rainbow edge uses the shared category-color roles as one
  static perimeter. It adds no glow, page wash, hue motion, or saturated panel,
  and it retains the same edge geometry, timing, and reduced-motion behavior as
  a single-color frame.
- A first-blood challenge row adds one solid gold achievement rail to its gold
  wash. The blue inset ring remains the selected-state signal; achievement and
  current location must stay simultaneously legible rather than replacing one
  another.
- Light-mode solved and first-blood washes must remain visibly distinct from
  the raised surface while retaining a pastel register. Solve-effect frames use
  the stronger achievement edge role; dark mode keeps its independently tuned
  surface and edge values.
- Resolve stored or system theme preference in the document head before first
  paint. Hydration must not be the first point at which the root theme class is
  applied, and it must not temporarily overwrite the pre-paint result.
- Full-screen effect frames remain flush to every viewport edge. Their dedicated
  outer fill is rectangular and lets host-window clipping define the true outer
  curve; only the transparent inner cutout uses Kitsune's larger viewport
  radius. This fills the corner wedge from the native edge to the inner curve.
- Solve-effect viewport perimeters must not use SVG or CSS masks. Safari may
  reconstruct a masked layer while its ancestor animates and visibly flicker.
  Compose the static perimeter from edge strips and rounded corner fills, then
  animate opacity on that plain HTML layer only. Corner fills and edge strips
  must meet without overlap because translucent semantic colors visibly darken
  when composited twice.
- Scrollbar tracks stay transparent. A pane may reveal its thumb while the user
  scrolls, then hide it after scrolling stops. Do not reserve a permanent gray
  track at the viewport edge.
- Use the split workspace at tablet widths and above. Do not open a desktop-
  sized sheet merely because the viewport is narrower than an arbitrary large
  breakpoint. Sheets are for genuinely narrow layouts.

## 5. Forms and selection

- Fields use the shared React Aria field composition for labels, descriptions,
  validation, and control grouping.
- Use RadioGroup for one visible choice, Checkbox for independent choices,
  ToggleGroup for compact modes, Select for long lists, and ComboBox for
  searchable lists.
- Search sits with the collection it filters and updates as the user types.
- Challenge progress occupies one compact line directly above search. It shows
  solved/total and earned/available points without repeating the selected
  category or challenge title already visible in the collection and detail.
- Challenge search is immediate and local when data is already loaded. It does
  not need an Apply button, a visible label that repeats its placeholder, or a
  separate results explanation.
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
- Category and solve state in the challenge browser are not pill collections.
  Categories are section structure. Solved state is plain text or a compact
  confirmation beside the challenge it affects.
- Category color indexes the challenge ledger through its category icon,
  label, and narrow header rail. Blue alone communicates focus and selection;
  green communicates a confirmed solve; podium tones communicate first,
  second, and third blood. Full-width chromatic category bands reproduce
  rCTF's skin instead of expressing Kitsune's event-trail system.
- Category headers remain sticky inside the collection scroll owner and fully
  occlude rows moving underneath them.
- Every challenge row has one invariant two-line anatomy and hit height: name
  and points on the first line, solve status and solve count on the second.
  Changing state never changes row height or shifts adjacent targets.
- Trusted author metadata may follow the challenge name on its first-line
  baseline as truncated, muted `by <name>` text. It never creates a third row,
  displaces points, or changes the invariant hit height.
- Static status does not use hover styling.
- Repeated standings, metrics, and category summaries use aligned ledgers or
  lists. They do not become grids of individually rounded cards. A common
  region is reserved for one coherent object, not applied once per datum.
- When length or area represents a quantity, geometry must be proportional to
  the underlying value. Equal-sized challenge segments are prohibited when
  point values differ. Accessibility minimums may constrain extreme cases;
  the component must retain the real value and expose it in text.
- Within each category progress bar, segments accumulate from the leading edge:
  solved challenges come before unsolved challenges while retaining their
  defined order within each state. The overall field bar retains canonical
  challenge order so category structure remains legible.
- Detail and sensitive-value actions open a Dialog or Sheet. Sensitive values
  have explicit copy actions.
- Map backend lifecycle states to the few user-facing states needed for the
  decision. Do not expose accessor keys or database field names.
- Automated browser fixtures use credible stable visible names and unique
  opaque slugs. Tests remove or isolate created events so repeated runs cannot
  turn the product collection into a test log.

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
- When no challenge is selected, the detail pane presents one composed model
  of the competitor's position and the remaining challenge field. It does not
  repeat event-trail facts as KPI tiles or wrap each category in a card.
- In that overview, the run summary, nearby-score chart, challenge-field
  heading, overall challenge bar, and category column headings remain fixed.
  Only the category rows own vertical overflow when they exceed the remaining
  pane height; the overview pane and document do not become scroll owners.
- The nearby-score chart uses a seven-place local standings window instead of a
  series legend. It shows consecutive rank, team, and point columns around the
  current competitor, spans the chart's plotted height, and keeps the current
  team as the sole accented, weighted row. Neutral neighbours fade toward the
  top and bottom edges without implying that the ledger is an interactive
  picker.
- The chart's first visible Y-axis label shares the section's leading edge.
  Grid lines retain their internal label inset; that functional plotting inset
  must not shift the chart's entire visible block away from its heading.
- Once the nearby-score chart and standings share a row, both use the standard
  chart-height token. The responsive column split corrects the wide aspect;
  increasing height again wastes the fixed workspace and pushes the challenge
  field below the user's decision context.
- Responsive SVG charts measure their rendered box and recompute plot bounds,
  pointer coordinates, ticks, and overlays from that box. They must not apply
  `preserveAspectRatio="none"` to a fixed coordinate system, which visibly
  distorts both data geometry and typography as a pane narrows.
- Before that first client measurement, the server-rendered chart fallback may
  fill the already-reserved chart box so it does not appear to grow during
  hydration. The measured render replaces the fallback with matching plot and
  CSS dimensions before enabling exact pointer geometry.
- A split pane already constrains the overview's reading context. The
  no-selection overview consumes the available pane width with one compact
  lateral inset; it must not reapply the global page-shell maximum and create
  large automatic side margins around charts or ledgers.
- The no-selection overview title and selected challenge title share the same
  top and left pane inset. Switching state changes the content, not the primary
  reading origin.
- In challenge detail, the tab selection edge, challenge title, and first
  content surface share one left pane inset. A tab's internal hit-area padding
  must not pull its selection underline outside that alignment rule.
- Challenge categories are independent disclosures, all expanded by default.
  Category headings remain sticky inside the challenge-list scroll owner and
  retain their Lucide category icon, pastel index colour, solved ratio, and
  collapse state while the list moves beneath them.
- Every challenge row shows its solve count. Unsolved, solved, first-through-
  third blood, hovered, focused, and selected states remain distinguishable
  without relying on colour alone. Selected state uses the single interactive
  blue; solved and blood states use a restrained lateral wash rather than a
  full chromatic card.
- Flag input is monospaced. Challenge prose, metadata, categories, and scoring
  are not.
- A flag submission updates in place, preserves the challenge position, and
  gives an immediate pending state followed by exact feedback.
- Confirmed-flag feedback uses a typed presentation slot with `edge-border`,
  `screen-imprint`, `field-wave`, and `none` variants. Until the admin API
  supplies the setting, one feature-local frontend adapter selects the default;
  screens do not branch on ad hoc booleans.
- The default edge border draws only one crisp semantic-green viewport
  perimeter at the screen boundary. It applies no page tint, glow, blur,
  gradient, content movement, or layout animation.
- The optional screen imprint reuses that perimeter and briefly applies a
  low-opacity flat green wash over the page. The weaker wash recedes before the
  perimeter so it reads as a page imprint rather than replacing the border.
- The optional field wave begins at the measured flag-field bounds and expands
  across the viewport above product chrome. Its imprint preserves the textbox
  bounds, shared field radius, edge, and submitted value; it never substitutes
  an approximate ellipse. Linear motion is permitted only for this physical
  propagation because acceleration would falsify its travel.
- Every success effect uses only transform and opacity, never delays the solved
  state, never intercepts input, cleans itself up after completion, and
  disappears under reduced motion. The dedicated 1.2-second duration is
  permitted only for these rare, non-blocking viewport confirmations.
- The challenge list, selected detail, resources, hints, and flag input remain
  in one task flow. Selecting a challenge updates the detail in place and may
  update the URL without reloading the document.
- The challenge detail begins with the name, points, minimal decision-relevant
  metadata, description, resources when present, and the submission action.
- Solve-tab labels put the tabular count first and use singular `Solve` only
  when the count is exactly one.
- A trusted challenge author appears beside the name as muted `by <name>` text.
  Omit the line when author data is absent; never invent an author outside the
  explicitly typed demo adapter or render authorship as a badge.
  Hints and writeups use progressive disclosure.
- A locked hint renders identity and `Locked` at the leading edge, then cost and
  a specifically labelled action at the trailing edge of one compact row. The
  button never repeats the price and never drops beneath the state as a detached
  control.
- Challenge detail provides a solve timeline sourced from the same model as
  the compact first-three-plus-self context. Each solve shows rank, competitor,
  elapsed time from first solve, and absolute solve time. The current
  competitor stays identifiable and receives a pinned row when outside the
  leading results.
- The compact first-three-plus-self context uses one identity anatomy per
  competitor: placement, a larger team avatar, then a two-line stack of team
  name and elapsed state. First blood reports elapsed competition time in
  compact non-empty units such as `8h` or `1h 17min`. A detached far-right time
  label and separate mini-profile cards are prohibited.
- An untaken top-three place preserves the occupied slot's exact footprint but
  contains no fabricated avatar, team, or solve time. Its placement remains
  visible in neutral text outside the placeholder while fine neutral diagonal
  linework marks only the empty identity area. The placeholder contains no
  visible copy or icon; assistive text names its state.
- Avatar slots render the real team profile image when the solve model supplies
  one and retain initials as the load-failure fallback. Frontend demo state does
  not fabricate profile art when no human-authored asset exists.
- The first-three-plus-self context and flag action form one sticky detail
  dock. The dock spans the pane; the text action remains content-width on wide
  layouts and expands only when the controls stack on narrow layouts.
- A solved challenge removes the completed flag field. A compact status row may
  replace it using the same label slot, control height, inset, and text origin
  so the sticky dock does not reflow during confirmation. The submitted value
  and replacement status must share a visual anchor. Do not retain an empty
  footer, expand the result into a large success banner, or permanently open a
  blank writeup editor.
- Incorrect receipts preserve the entered value and use a toast without adding
  an inline message row or reserving empty height beneath the field. Blank input
  and recoverable submission failures remain adjacent inline errors.
- Selected challenge rows retain their blue ring and leading rail across state
  changes. Solved and blood washes remain visible inside that selection chrome;
  no secondary shadow animation may overwrite the ring.
- Asymmetric status glyphs use the shared optical-offset token when bounding-box
  centering leaves their visual mass off the adjacent text baseline.
- While solve timelines, standings, and team context are absent from the player
  API, one typed feature-local frontend adapter supplies deterministic data to
  every consuming challenge component. Do not widen the API, OpenAPI schema,
  database, or server merely to complete frontend visual iteration.
- Demo score trajectories never fabricate synchronized periodic solves. The
  current team's score changes once per challenge actually marked solved;
  neighboring demo teams use distinct deterministic event times so simultaneous
  jumps appear only when source data eventually reports them.
- Do not show tags merely because challenges have tags. Tags remain searchable
  metadata unless they change discovery or a solve decision.
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
- During the current rewrite, the authenticated product exposes only Overview
  and Challenges. Other authenticated routes render no product view and do not
  appear in navigation until they pass this contract.
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

## 13. Reference synthesis

- rCTF v2 supplies the challenge interaction baseline: persistent grouped list,
  in-place detail selection, a resizable desktop split, narrow-screen drawer,
  direct URL selection, preserved list position, and a submission action that
  does not discard context. Reproduce the task quality, not its source or
  category-heavy visual treatment.
- Stripe supplies operational hierarchy: strong object title, terse metadata,
  tabular numerics, compact controls, and a clear primary action. Do not import
  its marketing mesh, thin marketing display type, or pill CTA grammar.
- Linear supplies a disciplined surface ladder, keyboard-first behavior, held
  density, and scarce accent use. Kitsune retains light mode and does not copy
  Linear's dark-only near-black canvas.
- Apple supplies receding chrome, a single interactive blue, and decisive
  removal of redundant interface. Kitsune does not inherit marketing
  whitespace, product-photography layouts, or pill-shaped actions.
- Vercel supplies hairline precision, technical alignment, restrained display
  weight, and mono only where content is actually technical. Its marketing
  gradient and oversized page rhythm do not belong in the product.
- Framer supplies confident display typography and decisive surface changes.
  Gradients, giant poster type, dark-only presentation, and spotlight cards are
  excluded.
- Figma supplies controlled category color as a structural block. In Kitsune,
  category color is reduced to section rails and restrained header tint. It
  never becomes a page-sized pastel panel or decorative tag field.
- GitHub supplies dense developer-tool scanning and clear code surfaces. Avoid
  gamer-console styling, pure-black bands, green glow, and marketing
  atmospherics.
- Claude's warm cream, serif display, and coral identity are explicitly outside
  Kitsune's tone and remain prohibited by the project anti-pattern list.

## 14. Route audit

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
9. Verify the document does not scroll in a fixed workspace, only designated
   panes scroll, and idle scrollbar tracks are not visible.
10. Inspect visible fixture copy and the local database for generated browser
    names, timestamps, or run suffixes.
11. Run format, lint, strict typecheck, tests, production build, keyboard
    review, Playwright screenshots, and axe.
12. Record any new reusable failure mode in this contract.
