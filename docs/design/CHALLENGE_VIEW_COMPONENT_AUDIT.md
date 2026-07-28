# Challenge view component audit

Status: completed 2026-07-28

Scope: every element rendered by `/challenges`, including the merged product
header, event trail, collection, selected detail, narrow-screen sheet, detail
tabs, sticky solve dock, overlays, loading states, and feedback effects.

The audit distinguishes behavior-bearing components from semantic layout.
Repeated interaction, state, security, or visual contracts are components.
Plain `section`, `header`, list, description-list, and alignment markup remains
local when a wrapper would enforce no additional rule.

## Repeated elements

| Element                                   | Contract owner                                               | Audit result                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text and destructive actions              | `Button`                                                     | All challenge actions already used the React Aria wrapper. Added an explicit pointer cursor to the primitive.                                         |
| Icon-only actions                         | `IconButton`                                                 | Added and adopted by the event trail, collection toolbar, focus rail, copy action, merged header, Dialog, and Sheet.                                  |
| Long-region focus bypass                  | `SkipLink`                                                   | Added bidirectional focus transfer between the challenge collection and selected detail. Hash activation explicitly focuses its destination.          |
| Focus indication                          | `focusRing`, `focusTargetRing`                               | Restored solid outline style across controls and programmatic skip destinations; width and colour alone had been visually inert after `outline-none`. |
| Clipboard actions                         | `CopyButton`, `CopyIconButton`                               | Consolidated copied state, timeout, accessible names, and errors. Removed the redundant icon beside the visible CodeBlock `Copy` label.               |
| Safe downloads                            | `DownloadLink`                                               | Added protocol validation and native download intent for challenge attachments.                                                                       |
| Keyboard shortcut keys                    | `KeyboardKey`                                                | Replaced local `kbd` styling in the event-trail dialog.                                                                                               |
| Chromatic body text                       | Category `*-text` roles and podium roles                     | Split readable labels and avatar initials from brighter decorative marks. Rendered Axe checks now pass in both themes.                                |
| Horizontally scrollable authored evidence | `CodeBlock`, `AuthoredContent`                               | Code and authored tables are keyboard-focusable and expose visible focus rings.                                                                       |
| Challenge collection rows                 | `ChallengeCollectionRow`                                     | Extracted repeated two-line row anatomy, selection, presence, points, solve count, and link behavior.                                                 |
| Solve and blood labels                    | `ChallengeSolveStatus`                                       | One component now owns labels, Lucide glyphs, optical offset, and first-blood presentation in the sidebar and detail header.                          |
| Locked and revealed hints                 | `ChallengeHintItem`, `HintUnlockAction`                      | Row anatomy and action behavior are isolated. Unlock and reveal use `Button`; paid unlock uses `AlertDialog`.                                         |
| Challenge attachments                     | `ChallengeResources`                                         | Repeated file rows, size metadata, and safe download actions are isolated from the screen.                                                            |
| Category identity                         | `ChallengeCategoryLabel`                                     | Existing component correctly owns category label, Lucide icon, and semantic tone.                                                                     |
| Teammate presence                         | `PresenceSummary`, `Avatar`                                  | Existing components own names, accessible copy, compact overlapping avatars, and fallback initials. Presence remains sidebar-only.                    |
| Async states                              | `Skeleton`, `Alert`, `EmptyState`                            | Loading, recoverable failure, and empty states use shared primitives. Shapes and recovery copy remain feature-specific.                               |
| Forms                                     | `Form`, `TextField`, `RadioGroup`, `RatingGroup`, `TextArea` | Submission, survey, and writeup interactions use shared React Aria form primitives.                                                                   |

## Unique elements

| Element                                  | Contract owner                                                                                  | Audit result                                                                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event trail                              | `ChallengeEventTrail` composed with `AppHeader`, `Progress`, `Sparkline`, and `StatusIndicator` | Correctly isolated as the workspace signature. No second signature treatment was added.                                                                 |
| Resizable workspace and focus mode       | `SplitWorkspace`, `ChallengeCollapsedRail`                                                      | Shared React Aria slider semantics, pointer geometry, persistence, and reduced motion remain centralized.                                               |
| Selected detail header                   | `ChallengeDetailHeader`                                                                         | Extracted title, author, category, attempts, solve count, status, points, and copy-link action from the screen.                                         |
| Authored description                     | `ChallengeDescription`, `AuthoredContent`                                                       | The bounded challenge object and safe Markdown renderer remain separate, explicit components.                                                           |
| Connection and code evidence             | `CodeBlock`                                                                                     | Copy behavior now delegates to `CopyButton`; code semantics and horizontal overflow remain centralized.                                                 |
| Solve timeline and compact solve context | `ChallengeSolves`, `SolveRow`, `SolveIdentity`, `ChallengeSolveStrip`                           | Existing feature components correctly centralize rank, identity, time, self state, and responsive ordering.                                             |
| Sticky submission dock                   | `ChallengeSubmission`, `ChallengeSolvedSummary`                                                 | Existing components preserve form state, validation, pending state, and solved replacement geometry.                                                    |
| Bidirectional scroll dock                | `ScrollEdgeDock`                                                                                | Shared behavior mirrors a natural item at the nearest declared scroll edge without duplicating its semantics. Challenge solves supply only row content. |
| Challenge instance controls              | `ChallengeInstance`                                                                             | Existing component owns lifecycle state, endpoints, alerts, and async actions.                                                                          |
| Survey and writeup workflows             | `ChallengeSurvey`, `ChallengeWriteup`                                                           | Existing components own validation, confirmation, persistence, and feedback.                                                                            |
| Solve feedback effect                    | `ChallengeFeedbackEffect` and its internal frame variants                                       | Existing feature component correctly owns the portal, dynamic runtime geometry, reduced motion, and cleanup.                                            |
| Narrow-screen detail                     | `Sheet`                                                                                         | Existing React Aria overlay owns dismissal, focus restoration, title, and close action.                                                                 |

## Intentionally local markup

- Challenge progress remains a semantic description list because it has no
  reusable interaction or state contract.
- Section headings remain native headings. Their levels and density follow the
  surrounding task and should not be flattened into a prop-driven heading
  component.
- Action groups and metadata rows remain flex or grid layout. A component that
  only aliases `display` and `gap` would hide context without preventing a
  defect.
- Motion subparts inside the solve effect remain private because they are not
  valid outside that effect.

## Static guarantees

- No raw interactive HTML exists in the challenge feature.
- Every pressable challenge action resolves through a React Aria primitive in
  `src/components/ui`.
- Component code contains no raw colours, arbitrary Tailwind dimensions, or
  non-runtime inline styles.
- Rendered Axe audits report zero violations for light and dark Details,
  Hints, Solves, settled Dialog and AlertDialog overlays, and the narrow Sheet.
- Desktop keyboard tracing verifies collection bypass, visible heading landing,
  forward continuation to Copy challenge link, reverse continuation to the
  focus-only search bypass, and final focus on the search input. The bypasses
  are omitted from the narrow Sheet focus trap.
- Desktop and 360-pixel views have no document overflow. The narrow locked-hint
  row remains one 44-pixel line with no internal overflow.
- Light, dark, desktop, narrow, keyboard, loading, empty, error, and reduced
  motion paths are covered by automated or rendered verification.
