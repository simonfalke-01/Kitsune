# rCTF v2 frontend reimplementation

Reference reviewed at `otter-sec/rctf@5965315`. The implementation must reproduce product capabilities and interaction quality without copying source code. Kitsune's interface contract, React Aria primitives, semantic tokens, event trail, and information architecture remain authoritative.

## Status

| Surface | Status | Remaining frontend work |
|---|---|---|
| Tokens, themes, primitives | In progress | Complete chart roles, dense data surfaces, branded asset controls, and final primitive audit |
| Application shell | In progress | Team-aware event standing, richer compact event context, mobile event selection, skip link |
| Public home | Pending | Configurable event content, timing, sponsors, archived/not-started states |
| Authentication | Partial | Visual consolidation and team-token login affordance |
| Challenges | Frontend complete | Current-state screenshot review, then replace typed solve/standing fixtures only after frontend approval |
| Scoreboard | Partial | Challenge/category matrix, view and sort controls, pinned self row, graph context controls, screenshot workflow polish |
| Competitor profile | Partial | Full score fidelity, profile editing, avatar, country/status/division, members, solve details |
| Team | Partial | Consolidate profile and roster management around the competitor profile language |
| Admin submissions | Pending | Filterable submission audit table with expandable details |
| Admin challenges | Partial | Existing challenge edit/delete, attachments, scoring, instancer, admin-bot, solves, validation and discard states |
| Admin teams | Partial | Full account management, tokens/login links, avatar/profile edit, bans and submission deep links |
| Admin settings | Partial | General branding, timing, logo, home content, metadata, sponsors, persistent save bar |
| Responsive and accessibility | In progress | 360px pass, pinned and overflow behavior, keyboard chart/table exploration, reduced motion |
| Visual verification | Pending | Light/dark screenshots for challenges, scoreboard, profile, submissions and settings |

## Current batch

1. Stabilize the interrupted chart and profile work.
2. Rebuild the scoreboard as the primary rCTF-inspired signature surface.
3. Complete challenge detail information architecture.
4. Bring profiles and settings to frontend-complete states.
5. Add the submissions audit surface.
6. Validate and visually inspect before beginning backend work.

## Validation

- `pnpm --dir web check`
- `pnpm --dir web lint`
- `pnpm --dir web test`
- Interface-contract token scan
