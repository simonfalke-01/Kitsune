# Kitsune product design constitution

Status: binding for product, design, and frontend implementation.

This document explains why Kitsune's interface behaves and looks the way it
does. `docs/design/INTERFACE_CONTRACT.md` translates these principles into
route and component requirements. `web/src/app.css` remains the only source of
live visual token values. `AGENTS.md` remains authoritative for the locked
stack, allowed utilities, and verification commands.

When instructions conflict, resolve them in this order:

1. Safety and ethics
2. Accessibility
3. Functional correctness
4. Clarity
5. Efficiency
6. Product consistency
7. Aesthetics and distinctiveness

Never silently resolve an unresolved conflict. State it and name the user need
that determines the outcome.

## 1. Product purpose

Kitsune helps competitors discover challenges, solve them, coordinate with a
team, and understand a live competition without losing context. It helps
authors publish reliable challenges and helps operators understand and act on
live state.

The interface is a cost. Every label, container, line, icon, animation, and
control must repay the attention it consumes by improving comprehension,
speed, confidence, or recovery.

Content is the product. Chrome is scaffolding. Competition state, challenges,
flags, solves, teams, and operational evidence advance; navigation and
containers recede.

Kitsune is precise, spirited, and composed. It is not a gamer HUD, crypto
terminal, generic SaaS dashboard, marketing page, or component-library demo.
Competition energy comes from meaningful category colour, live progress, team
identity, and decisive state changes rather than decorative effects.

## 2. The decision before the pixels

Before changing a surface, answer all of the following:

- What is the user's immediate job?
- What single object or relationship should they notice first?
- What is the primary action, if the surface has one?
- What must remain visible while the user acts?
- What can the system infer or preserve instead of asking?
- Why is this structure better for comprehension or action than the nearest
  plausible alternative?

"It is conventional" is only a tiebreaker between equally effective options.
"It looks better" is never sufficient. Explain what the choice does for the
user.

## 3. Visual hierarchy and attention

- Every screen must have one primary focus. If it cannot be named in one
  phrase, the screen is not designed.
- Every task surface has at most one visually primary action. Informational
  surfaces may have none.
- Establish hierarchy in this order: position, decisive size, whitespace,
  weight, colour, contrast, then depth.
- Colour is a scarce structural signal. Interactive blue communicates focus
  and selection. Green communicates a confirmed solve. Podium colours
  communicate first through third blood. Category colours index challenge
  families. These meanings do not overlap.
- A screen must pass the squint test: when text becomes unreadable, its reading
  order and grouping remain evident from mass, alignment, and contrast.
- Equal-sized cards create equal importance. Do not use a grid of cards for
  unrelated metrics merely because the data has four fields.
- Big numbers are not hierarchy by themselves. A number earns prominence only
  when the user's next decision depends on it and its comparison or unit is
  immediately legible.
- Distinctiveness is spent once per surface. The event trail is the challenge
  workspace signature. Everything surrounding it must stay disciplined.

## 4. Spatial harmony

- Every object aligns to a small set of strong edges. New alignment edges must
  be justified.
- Space within a group is always smaller than space between groups. Use a
  visibly meaningful ratio, not tiny incidental differences.
- Separate content in this order: whitespace, alignment, surface shift, then
  border. A border is not a substitute for grouping.
- Repeated data uses a ledger, table, or aligned list. It does not become a
  field of individually rounded cards.
- Density remains consistent within a task region. Dense challenge scanning
  and spacious marketing composition never share one surface.
- Optical alignment outranks mathematical alignment. Inspect icon mass,
  baselines, numerals, punctuation, and the perceived centre of blocks.
- Nested radii must be concentric. Do not nest rounded rectangles by habit.
- Spacing, type, radius, elevation, and motion consume only the approved token
  systems. Their live values are defined in `web/src/app.css`; component code
  never invents a value.

## 5. Consistency without uniformity

- External web and platform conventions are the default because users bring
  that knowledge for free.
- Internal consistency means the same concept keeps the same name, position,
  visual state, and behavior.
- Behavioural differences must remain visible. A destructive action cannot
  look like a benign action. Selected, hovered, solved, and unavailable are
  not interchangeable states.
- A deliberate convention break must solve a named Kitsune problem, preserve
  accessibility, and be taught once through the interaction itself.
- React Aria primitives own focus, keyboard, pointer, overlay, and validation
  behavior. Visual consistency never justifies bypassing them.

## 6. User control, directness, and trust

- The user initiates consequential actions and can cancel, leave, retry, or
  recover.
- Prefer undo or reversible state over confirmation. Reserve confirmation for
  genuinely destructive, irreversible outcomes.
- Interact with the object itself. A resizable pane has a visible, forgiving
  divider that follows the pointer continuously and also supports the
  keyboard. A hidden one-pixel target is not direct manipulation.
- Every action acknowledges input within 100 ms. Longer work exposes honest,
  proportionate status without replacing stable content.
- Familiar landmarks never jump during loading or state changes.
- Preserve selection, filters, scroll position, drafts, and open context during
  in-place updates.
- Never fabricate urgency, activity, progress, scarcity, social proof, or
  confidence. Frontend demo data is explicitly typed and isolated as demo
  state until real data is connected.
- Privacy-preserving behavior is the default. No personal data belongs in a
  URL.

## 7. Laws of UX translated for Kitsune

The source material is Jon Yablonski's Laws of UX, reviewed law by law from
<https://lawsofux.com/> on 2026-07-27. The rules below are project-specific
applications, not decorative citations.

| Law | Mechanism | Kitsune consequence |
|---|---|---|
| Aesthetic-usability effect | A polished interface is perceived as easier and minor flaws receive more tolerance | Craft matters, but visual review never substitutes for pointer, keyboard, error, and task-flow testing. Polish that hides a broken interaction is a failed review. |
| Choice overload | Decision quality declines as options multiply | Show the challenges and controls relevant to the current event. Search and filtering narrow the field. Advanced operations use progressive disclosure. |
| Chunking | Meaningful groups reduce processing effort | Categories group challenges; title, state, score, and solve count form one stable row; detail content is grouped by the decision it supports. |
| Cognitive bias | Heuristics speed judgment but introduce systematic error | Do not use visual emphasis to imply a recommendation, severity, or popularity the data does not support. Preserve neutral comparisons. |
| Cognitive load | Irrelevant processing competes with the task | Remove duplicated metrics, ornamental labels, nested cards, repeated borders, and state the user can already see. Keep flag entry, evidence, hints, and solve context together. |
| Doherty threshold | Interaction flow degrades beyond roughly 400 ms | Press feedback is immediate. Avoid spinner flashes. Use optimistic state only when honest and reversible; expose longer progress in place. |
| Fitts's law | Small or distant targets take longer and produce errors | Entire challenge rows are targets. Resize dividers and touch controls have forgiving hit areas. Frequent actions remain near the object; destructive actions are separated. |
| Flow | Focus emerges when challenge, skill, feedback, and control remain balanced | Selecting, reading, solving, and continuing occur without navigation loss. Feedback is immediate and the interface does not interrupt the solving rhythm. |
| Goal-gradient effect | Motivation increases as the goal becomes visibly nearer | Show solved/total and earned/available points as honest continuous progress. Make remaining work legible without turning it into decorative gamification. |
| Hick's law | Decision time grows with the number and complexity of choices | One primary action, concise tab sets, sensible defaults, independent categories, and progressive disclosure. Simplification stops before meaning is hidden. |
| Jakob's law | Users transfer expectations from familiar products | Search behaves like search, tabs like tabs, links preserve browser history, and the split view follows common desktop behavior. Novelty is reserved for the event trail, not basic controls. |
| Law of common region | A shared bounded area implies a group | Use a region only when its contents are one object or one layer. Do not wrap every statistic or list row in a card. |
| Law of Prägnanz | People reduce ambiguity to the simplest coherent form | Prefer one composed model over a collection of fragments. Shapes, states, and copy remain simple enough to scan without explanation. |
| Law of proximity | Nearby objects are perceived as related | Keep status beside its challenge, submission beside its flag field, and rank beside the competitor. Group gaps must visibly exceed internal gaps. |
| Law of similarity | Similar appearance implies shared meaning or behavior | Equal row anatomy communicates equal interaction. Different states add a second non-colour cue. Static labels never inherit interactive hover styling. |
| Law of uniform connectedness | Connected elements appear more related than unconnected ones | The event trail, score path, challenge segments, and timeline rails connect state that changes across time. Do not draw connectors between unrelated metrics. |
| Mental models | People act through compressed expectations of how a system works | Use the competitor model: browse a category, choose a challenge, inspect evidence, submit a flag, confirm the solve, continue. Do not expose service or database structure. |
| Miller's law | Working memory is limited and context dependent | Favour recognition over recall. Preserve prior state, show values at the point of use, and chunk dense data. Never treat seven as a magic layout limit. |
| Occam's razor | The adequate explanation with fewer assumptions is preferable | Remove any element that does not change comprehension, choice, action, or recovery. Completion requires one further deletion pass. |
| Paradox of the active user | People begin the task instead of reading instructions | Demo challenges are immediately usable. Contextual help appears at the moment of need; no tour or architecture narration blocks entry. |
| Pareto principle | A minority of inputs often produces most outcomes | Optimize the primary competitor path first. Rare author and operator controls do not burden the challenge-solving surface. |
| Parkinson's law | Work expands to available time and process | Do not lengthen short tasks with confirmation, ornamental transitions, or unnecessary fields. Defaults and preserved state shorten repeat work. |
| Peak-end rule | The most intense and final moments disproportionately shape memory | Wrong flags, first blood, successful solves, failures, and completion receive the most careful feedback and recovery design. |
| Postel's law | Robust systems accept variable input and emit predictable output | Normalize harmless flag whitespace and flexible user input where meaning is clear. Return stable, specific states and errors. |
| Selective attention | People filter stimuli to protect the current goal | Give the selected challenge and its next action the strongest local cue. Avoid banner-like filler, competing animations, and simultaneous attention events. |
| Serial-position effect | The first and last items in a sequence are recalled best | Put identity/context first and the action or resolution last. Do not bury the primary action in the middle of metadata. |
| Tesler's law | Irreducible complexity is borne by the system or the user | Kitsune absorbs event resolution, grouping, defaults, formatting, and state reconciliation. Implementation choices never become user questions. |
| Von Restorff effect | A single distinct object is remembered | One thing may stand out per surface: selected challenge, active action, or event trail. Multiple saturated cards destroy the effect. |
| Working memory | Task information fades quickly unless kept visible | Keep challenge context, attempts, points, hints, and submission state in the workspace. Never require memorising values across tabs or routes. |
| Zeigarnik effect | Incomplete work remains cognitively active | Show honest progress and remaining challenges. Preserve unfinished writeups and selection. Do not manufacture incomplete tasks to drive engagement. |

## 8. Challenge workspace application

### 8.1 Single job and primary focus

The workspace's job is to let a competitor choose and solve the next challenge
without losing competition context.

- With a challenge selected, the selected challenge is the primary focus and
  flag submission is the primary action.
- Without a selection, the competition's score trajectory and remaining
  challenge field form one primary information model. The view must help the
  competitor decide where to go next.
- The event trail keeps event, progress, rank, and live score context stable.
  The unselected view must not repeat those values as disconnected KPI tiles.

### 8.2 Challenge collection

- Categories are independent disclosures and begin expanded.
- Category headers remain sticky within the collection scroll owner.
- Every row keeps one invariant two-line geometry: challenge and points first;
  state and solve count second.
- Trusted author metadata may share the challenge-name baseline as smaller,
  muted `by <name>` text. It never creates a third line or changes row height.
- Hover, focus, selected, solved, and podium states remain distinguishable.
  Blue alone means interaction/selection; green means solved; podium tones mean
  placement.
- Category colour appears as an index: icon, label, narrow rail, or progress
  segment. It does not become a saturated full-width challenge slab.
- Search is immediate and local. Filtering never loses the selected challenge
  without explaining the state.

### 8.3 Split workspace

- The document and workspace root never scroll. The collection and active
  right-pane body are the desktop scroll owners.
- Challenge selection and the active detail tab are URL state. Browser Back,
  forward, refresh, and copied links must restore the same visible object and
  section without making URL synchronization delay immediate selection.
- Remember the collection scroll position and each challenge's last tab and
  per-tab detail position within the current event. Returning to prior work
  must restore context without moving a different event's workspace.
- The splitter is a direct-manipulation control. Its hit target is forgiving,
  its affordance is visible without guessing, dragging updates continuously,
  and arrow keys provide an equivalent path.
- Resizing preserves selected challenge and both scroll positions.
- The divider communicates function without becoming decorative chrome.

### 8.4 Unselected competition view

- Do not use a KPI-card row.
- The overview title shares the selected challenge title's exact top and left
  anchor. Selecting a challenge changes the object, not the primary reading
  origin.
- Do not use one rounded card per category.
- Do not repeat event-trail facts unless a comparison gives them new meaning.
- Use one score/standing focal relationship and one compact aligned category
  ledger.
- The ledger shows category, solved/total, remaining challenge segments,
  available points, and solve activity on shared alignment rules.
- Segment length encodes available points. Unequal point values must produce
  proportionally unequal lengths; equal blocks are permitted only for equal
  values. Minimum target sizing may protect accessibility but must never be
  mistaken for the underlying scale.
- Colour is confined to lines, segments, and category identifiers. Surfaces
  remain quiet.

### 8.5 Challenge detail

- Header contains name, points, minimal state, and decision-relevant metadata.
- When trusted author data exists, show `by <name>` as quiet text beside the
  challenge name. It is metadata, not a badge, chip, or second heading. Demo
  authors remain explicitly isolated in the frontend demo adapter.
- Details, solves, hints, and writeup occupy stable tabs; switching tabs does
  not flash or move fixed chrome.
- The description may use one bounded region because it is a discrete authored
  object. Nested sub-sections rely on whitespace before borders.
- Solve standings are aligned rows, not a feed of identical cards. Team
  identity, rank, relative time, and absolute time share stable columns.
- First-three-plus-self context and flag submission form one persistent action
  dock. Its subparts are connected by alignment, not mini cards.
- Blank writeups and blank flags are prevented before submission. Errors remain
  adjacent to the action and preserve input.

## 9. Typography and copy

- Instrument Sans carries interface and body text. Archivo carries restrained
  display hierarchy. JetBrains Mono is reserved for flags, code, commands, and
  logs.
- Use no more than four type sizes and three weights on one screen.
- Tabular figures are mandatory for aligned and changing numbers.
- Body copy is left aligned and held to a readable measure.
- Copy is terse, factual, active, and sentence case. Delete before rewriting.
- A label labels, a hint demonstrates, a description explains, and a status
  reports state. One element never quietly performs all four jobs.
- Buttons use a stable, specific verb. Errors name what happened and what to do.
- Never use centered dots, ornamental arrows, architecture narration, or
  filler captions.

## 10. Colour and material

- Live colours are semantic tokens in `web/src/app.css`; components never
  consume primitives or raw colours.
- Dark mode uses near-achromatic charcoal, not black. Text is off-white, not
  pure white. Pastel accents are lightened and controlled to avoid vibration.
- Colour never carries state alone. Text, icon, position, or shape reinforces
  it.
- Borders are barely perceptible by default. Elevation communicates a real
  layer, not importance.
- Cards represent discrete objects or layers. They are never the default
  wrapper for a statistic, repeated row, or section.

## 11. Interaction, feedback, and motion

- Applicable component states are complete: default, hover, focus-visible,
  pressed, disabled, loading, selected, and error.
- Hit targets follow the shared control size and retain at least an eight-pixel
  separation where targets are adjacent.
- Pointer, touch, and keyboard paths produce the same result. Gestures are
  accelerators, never exclusive paths.
- Routine transitions remain within the shared fast and normal duration
  tokens. Motion uses transform and opacity, explains continuity, is
  interruptible, and respects reduced motion.
- Operations below the indicator threshold do not flash a spinner. Known
  layouts use skeletons for longer initial loads.
- Successful changes are visible in context. Toasts supplement rather than
  replace persistent state.

## 12. State and resilience matrix

Every list, chart, table, and async region covers:

- first-run empty;
- user-cleared empty;
- no search results;
- initial loading;
- incremental loading;
- partial data;
- recoverable, permission, and offline errors;
- sparse data;
- dense data;
- overflow and international text;
- success;
- stale data.

Test realistic long names, emoji, CJK, RTL, negative values, one-character
names, large solve counts, and unavailable timestamps. Never validate a layout
only with three tidy rows.

## 13. Accessibility and platform behavior

- Target WCAG 2.2 AA. Accessibility outranks aesthetics.
- Semantic HTML comes before ARIA. React Aria supplies composite behavior.
- Every focus target has a visible focus indicator; focus order follows visual
  order; overlays trap and restore focus.
- No meaning depends only on colour, hover, motion, or position.
- Text, UI graphics, icons, and focus indicators meet their contrast floors in
  light and dark modes.
- The interface reflows at narrow widths, high zoom, and user-scaled text
  without lost content or horizontal page scrolling.
- Browser Back, refresh, and direct URLs preserve meaningful workspace state.
- Respect reduced motion, colour scheme, increased contrast, forced colours,
  and reduced transparency where supported.

## 14. Prohibited product-design patterns

- Generic KPI card strips
- A rounded card for every row, metric, or category
- Equal visual weight for unrelated information
- Invisible or one-pixel drag targets
- Large empty surfaces with a centered instruction as the only content
- Duplicated facts that add no comparison or decision support
- Full-width saturated category slabs
- Decorative gradients, glass, glow, or animation on task surfaces
- Colour-only state
- Multiple primary actions
- Disabled actions with no adjacent reason
- Hover-only discovery
- Input loss, layout shift, or scroll-position loss
- Fake progress, urgency, activity, or social proof
- Error copy that is vague, blaming, cute, or internal
- Confirmation when undo or prevention is available
- Purely aesthetic novelty in standard controls

## 15. Required self-audit

Before delivery, perform every pass:

1. Purpose: name the job, focus, action, and justification for every element.
2. Squint: confirm one dominant object and unambiguous grouping.
3. States: inspect the complete state matrix with hostile content.
4. Interaction: test pointer, touch-sized targets, keyboard, immediate feedback,
   cancellation, and recovery.
5. Assistive technology: inspect semantic roles, names, values, announcements,
   focus, and overlay behavior.
6. Accessibility: verify contrast, zoom, reflow, colour independence, and user
   preferences in both themes.
7. System integrity: confirm tokens, radii, icon family, vocabulary, and sibling
   consistency.
8. Copy: remove filler, stabilize verbs and nouns, and make every error
   actionable.
9. Performance: prevent layout shift, expensive paint, and dishonest latency
   masking.
10. Ethics: reject manipulation and default to privacy and reversibility.
11. Removal: delete one more element and confirm the task becomes clearer.

An automated pass cannot prove visual quality, pointer usability, or screen
reader quality. A component-state test cannot substitute for testing the real
interaction.
