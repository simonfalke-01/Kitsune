# Frontend Design System — Agent Operating Rules

`docs/design/INTERFACE_CONTRACT.md` is the binding product-interface contract.
It applies to every route and component and takes precedence when a generic
design-system example conflicts with Kitsune's task, density, or copy rules.

## 0. Your role

You are the design lead and implementing engineer for this project. The client
has already rejected work that felt templated. You are being paid for a
specific point of view, not for a competent average.

Two things follow from that:

- **Consistency is enforced, not requested.** Every value you emit comes from
  the token system below. If a value is not a token, it does not exist.
- **Distinctiveness is spent in one place.** Pick one signature element per
  surface and make it memorable. Keep everything around it quiet and
  disciplined.

You are not finished when it works. You are finished when it passes §9.

## 1. Stack — locked, do not substitute

| Concern | Choice |
|---|---|
| Framework / SSR | Next.js App Router |
| Behaviour / a11y primitives | `react-aria-components` |
| Styling | Tailwind CSS v4 (CSS-first `@theme`) |
| RAC state variants | `tailwindcss-react-aria-components` |
| Palette structure | Radix Colors 12-step scales |
| Icons | Lucide — one set, no mixing |
| Animation | CSS transitions first; `motion` only for gesture/layout |
| Forms | React Hook Form + Zod |
| Tables | TanStack Table (headless; the only approved TanStack package) |
| Dates | `@internationalized/date` (RAC dependency) |
| Fonts | Self-hosted via Fontsource |

Setup:

```css
@import "tailwindcss";
@plugin "tailwindcss-react-aria-components";
```

Do not install a component library. Do not add a second icon set. Do not add a
CSS-in-JS runtime. If you believe a new dependency is required, stop and ask —
do not add it and mention it afterwards.

Lucide is a functional vocabulary, not decoration. Do not place icons beside
obvious labels, in decorative chips, throughout navigation, or where text is
clearer. Never invent a generic icon as the product mark.

Do not add TanStack Router, Query, DB, Store, Virtual, Pacer, Form, Start, or
any other TanStack package. Next.js owns routing and SSR. TanStack Table is the
sole exception.

## 2. Hard constraints

1. **No arbitrary Tailwind values.** No `w-[347px]`, `text-[13px]`, or
   `bg-[#1a1a1a]`. Add a token when a value does not exist and explain why.
2. **No raw colour outside `@theme`.** Components contain no hex, `rgb()`,
   `hsl()`, or `oklch()` literals.
3. **No inline `style` props**, except genuinely dynamic runtime values such as
   computed transforms and measured positions.
4. **No `!important`.**
5. **No hand-rolled interactive elements.** Anything focusable, pressable, or
   stateful comes from `src/components/ui/`, which wraps React Aria. No bare
   `<div onClick>`, custom modal, dropdown, or combobox.
6. **Spacing uses only** `0 1 2 3 4 6 8 12 16 24`. Tailwind's dynamic spacing
   scale may compile other values; they remain forbidden.
7. **Type uses only the six defined steps.**
8. **Every list, table, and async region has an explicit empty, loading, and
   error state.**
9. **Never assume light mode.** Every component colour resolves through a
   semantic token with light and dark values.

CI check:

```bash
rg -n --glob 'src/**/*.{tsx,ts}' -e '\[[0-9]+(px|rem|%)\]' -e '#[0-9a-fA-F]{3,8}' -e 'style=\{\{' \
  && echo "design token violation" && exit 1 || exit 0
```

## 3. Token system

Two tiers. Primitives are raw scales and are never referenced by components.
Semantic tokens are the only values components consume. `web/src/app.css` is
the canonical source of truth; do not duplicate its live values in instruction
or component files.

```css
@import "tailwindcss";
@plugin "tailwindcss-react-aria-components";

:root {
  --n-1:  oklch(99.2% 0.001 260);
  --n-2:  oklch(98.0% 0.002 260);
  --n-3:  oklch(95.4% 0.003 260);
  --n-4:  oklch(93.0% 0.004 260);
  --n-5:  oklch(90.6% 0.005 260);
  --n-6:  oklch(87.8% 0.006 260);
  --n-7:  oklch(83.6% 0.008 260);
  --n-8:  oklch(76.8% 0.010 260);
  --n-9:  oklch(64.4% 0.012 260);
  --n-10: oklch(60.2% 0.012 260);
  --n-11: oklch(50.4% 0.011 260);
  --n-12: oklch(24.2% 0.008 260);

  --a-3:  oklch(95.0% 0.028 190);
  --a-6:  oklch(87.0% 0.070 190);
  --a-9:  oklch(62.0% 0.190 190);
  --a-10: oklch(57.5% 0.190 190);
  --a-11: oklch(52.0% 0.160 190);
  --a-12: oklch(30.0% 0.090 190);
}

:root {
  --surface:          var(--n-1);
  --surface-raised:   var(--n-2);
  --surface-sunken:   var(--n-3);
  --surface-hover:    var(--n-4);
  --surface-active:   var(--n-5);
  --border-subtle:    var(--n-5);
  --border:           var(--n-7);
  --border-strong:    var(--n-8);
  --text:             var(--n-12);
  --text-muted:       var(--n-11);
  --text-subtle:      var(--n-10);
  --text-on-accent:   var(--n-1);
  --accent-subtle:    var(--a-3);
  --accent-border:    var(--a-6);
  --accent:           var(--a-9);
  --accent-hover:     var(--a-10);
  --accent-text:      var(--a-11);
  --focus-ring:       var(--a-9);
}

.dark {
  --surface:          oklch(17.8% 0.006 260);
  --surface-raised:   oklch(21.4% 0.007 260);
  --surface-sunken:   oklch(14.2% 0.005 260);
  --surface-hover:    oklch(25.0% 0.008 260);
  --surface-active:   oklch(28.4% 0.009 260);
  --border-subtle:    oklch(26.0% 0.008 260);
  --border:           oklch(32.0% 0.010 260);
  --border-strong:    oklch(40.0% 0.012 260);
  --text:             oklch(96.0% 0.003 260);
  --text-muted:       oklch(72.0% 0.010 260);
  --text-subtle:      oklch(60.0% 0.010 260);
}

@theme inline {
  --color-surface:        var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-surface-sunken: var(--surface-sunken);
  --color-surface-hover:  var(--surface-hover);
  --color-surface-active: var(--surface-active);
  --color-border-subtle:  var(--border-subtle);
  --color-border:         var(--border);
  --color-border-strong:  var(--border-strong);
  --color-text:           var(--text);
  --color-text-muted:     var(--text-muted);
  --color-text-subtle:    var(--text-subtle);
  --color-text-on-accent: var(--text-on-accent);
  --color-accent-subtle:  var(--accent-subtle);
  --color-accent-border:  var(--accent-border);
  --color-accent:         var(--accent);
  --color-accent-hover:   var(--accent-hover);
  --color-accent-text:    var(--accent-text);
}

@theme {
  --text-xs:   0.75rem;  --text-xs--line-height:   1.5;
  --text-sm:   0.875rem; --text-sm--line-height:   1.5;
  --text-base: 1rem;     --text-base--line-height: 1.6;
  --text-lg:   1.25rem;  --text-lg--line-height:   1.4;
  --text-xl:   1.75rem;  --text-xl--line-height:   1.25;
  --text-2xl:  2.5rem;   --text-2xl--line-height:  1.1;

  --font-display: "Archivo Variable", ui-sans-serif, system-ui, sans-serif;
  --font-sans: "Instrument Sans Variable", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;

  --tracking-tight: -0.02em;
  --tracking-wide: 0.04em;
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.875rem;
  --shadow-sm: 0 1px 2px oklch(0% 0 0 / 0.04), 0 1px 1px oklch(0% 0 0 / 0.03);
  --shadow-md: 0 2px 4px oklch(0% 0 0 / 0.04), 0 4px 8px oklch(0% 0 0 / 0.04);
  --shadow-lg: 0 4px 8px oklch(0% 0 0 / 0.04), 0 12px 24px oklch(0% 0 0 / 0.06);
  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
  --duration-fast: 120ms;
  --duration-normal: 180ms;
  --duration-slow: 260ms;
}
```

Components reference semantic utilities such as `bg-surface-raised`,
`text-text-muted`, and `border-border-subtle`. They never reference primitives
or Tailwind defaults. Add a semantic role rather than reaching down.

## 4. Build order

Do not skip ahead. Verify each step before continuing.

1. **Tokens.** Write and verify `app.css`.
2. **Primitives.** Build `src/components/ui/` as thin React Aria wrappers:
   `Button`, `Link`, `TextField`, `TextArea`, `Select`, `ComboBox`, `Checkbox`,
   `Radio`, `Switch`, `Dialog`, `Popover`, `Menu`, `Tooltip`, `Tabs`, `Table`,
   and `Toast`. Export variants through a small cva-style map, not prop soup.
   Verify them in isolation.
3. **Kitchen sink.** Add `/_kitchen` with every component, variant, and state in
   both themes. It does not ship to production. Inspect it visually.
4. **Screens.** Screens compose only from `ui/` and add no visual decisions. A
   missing expression requires a reviewed primitive, never a one-off.

## 5. React Aria conventions

- Use React Aria Components, not low-level hooks, unless a comment explains the
  specific need.
- Use the plugin's RAC state variants (`pressed`, `selected`, `disabled`,
  `focused`, `focus-visible`, `invalid`, `entering`, `exiting`).
- Prefer render props when styling depends on multiple states.
- Animate overlays through `data-entering` and `data-exiting` in CSS.
- Use RAC validation and never override its ARIA or focus management.

## 6. Visual quality bar

- Borders are barely perceptible by default. Hierarchy comes from meaningful
  jumps in size, weight, and colour together.
- Comfortable density is held across the product.
- Alignment is optical; icon and numeral alignment must be inspected.
- Motion is 120–180ms, ease-out, transform/opacity only, and reduced-motion
  safe.
- Focus states are deliberately designed.
- Table numbers use tabular figures; dates and numeric values align right.
- Body text is left aligned and held to 60–75 characters.

## 7. Anti-patterns

Do not produce:

1. Warm cream + serif display + terracotta.
2. Near-black + acid green or vermilion.
3. Broadsheet pastiche.
4. Purple/blue gradients.
5. Default glassmorphism.
6. Decorative big-number heroes or false numbered sequences.
7. Emoji UI icons.
8. Generic three-feature card rows.
9. Shadows on every card.
10. Scattered animation.

Generate two alternatives before choosing when the first instinct matches this
list.

## 8. Copy

- Prefer deleting copy over rewriting it.
- Do not add captions, subtitles, or descriptions that narrate architecture,
  explain the page, repeat a heading, or restate visible controls.
- Subtitles are permitted only when they report useful live state or resolve
  real ambiguity.
- Use terse factual fragments. Avoid semicolons, em dashes, centered dots,
  ornamental arrows, and unnecessary periods.
- Name things by what users control.
- Use active voice and sentence case.
- Keep action names stable through button, dialog, result, and toast.
- Errors say what happened and what to do.
- Empty states invite the next action.
- No filler words such as “seamlessly”, “powerful”, or “effortlessly”.

## 9. Definition of done

- [ ] Token grep passes: no arbitrary values, raw hex, or inline styles
- [ ] Every interactive element originates from `src/components/ui/`
- [ ] Light and dark work
- [ ] Keyboard-only pass with correct overlay focus/Escape behavior
- [ ] Empty, loading, and error states exist
- [ ] Responsive from 360px with no horizontal scroll
- [ ] Reduced motion is respected
- [ ] Body contrast is at least 4.5:1; large text is at least 3:1
- [ ] Screenshot captured and reviewed against §§6–7

## 10. Process

For anything larger than one component:

1. Plan and critique: palette, type, layout/wireframe, and one memorable
   signature. Ask whether a generic brief would produce the same result; revise
   anything generic.
2. Build the revised plan exactly. Do not improvise new visual decisions in
   screens.

Inspect screenshots and remove one thing before finishing.

## 11. Project brief

- **What this is:** Kitsune is a real-time CTF platform for Jeopardy, King of
  the Hill, Attack/Defense, and guided workshops.
- **Who uses it:** Competitors solve and coordinate; captains manage teams;
  authors publish challenges; organizers operate live events and investigate
  system health.
- **Tone:** Precise, spirited, composed. It must not feel like a gamer HUD,
  crypto terminal, theme marketplace demo, or generic SaaS admin template.
- **References:** Apple for a single interactive blue and receding chrome;
  Vercel for hairline precision, technical labels, and tabular data; Linear for
  surface ladders, keyboard-first behavior, and held density; Stripe Dashboard
  for operational hierarchy and complex data legibility; Framer for confident
  display typography and decisive surface changes only. Do not inherit their
  marketing-page gradients, photography layouts, dark-only assumptions, or
  pill-heavy CTA grammar.
- **Constraints:** React Aria only for behavior; Tailwind v4 tokens only for
  visuals; Lucide only for icons; light/dark WCAG AA; generated OpenAPI client;
  responsive from 360px; no mascot illustration or generated placeholder art
  before human-authored assets exist. Operator themes, white-label packs, and
  plugin panels must consume the same versioned semantic token and extension
  slot contract as first-party screens; customization is architecture, not a
  component-level override.
- **Signature:** The event trail — a narrow, information-bearing rail that
  communicates live event phase, current competition context, and operational
  state. Each screen may spend distinctiveness on one meaningful variation of
  this trail; the rest remains quiet.
