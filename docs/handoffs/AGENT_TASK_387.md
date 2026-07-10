# TASK: Cross-cutting apple-design motion standards (GitHub issue #387)

You are applying motion/interaction quality standards across an existing
Next.js app. This is a POLISH task: many small, conservative changes.
Do NOT restructure components. Do NOT change any business logic, data flow,
routes, or copy. Prefer CSS-only changes; touch TSX only to add/adjust
class names or `transform-origin`-related props where unavoidable.
Reference: `docs/UX_DIRECTION.md` section 2 (apple-design standards block).

## Deliverables (4 workstreams)

### 1. Instant press feedback (pointer-down, not release)

- In `app/globals.css` (or a new dedicated `app/motion-standards.css` imported
  from `app/layout.tsx` if globals.css is too crowded - your choice, ONE place):
  add press feedback for the app's main tappable surfaces:
  `transform: scale(0.97)` on `:active` with a ~100ms ease-out transition.
- Target the existing primary interactive classes (find them first; likely
  candidates: poster/lane cards, bottom nav items, primary CTA buttons,
  filter chips). Use an explicit selector list - do NOT apply to `*` or all
  `button` elements globally (form inputs, steppers and text links must not
  shrink).
- Skip elements that already have their own press/scale behavior (check
  watchlist v2 CSS and status-bottom-sheet.css - do not double-apply).

### 2. prefers-reduced-motion / prefers-reduced-transparency

- Audit existing CSS animations/transitions that MOVE things (slide, scale,
  bounce) in app/globals.css and component CSS files.
- Add `@media (prefers-reduced-motion: reduce)` rules so movement-based
  animation is replaced with opacity-only (or disabled), WITHOUT breaking
  end states (elements must still end up visible/positioned correctly).
  A pragmatic pattern is acceptable, e.g. forcing `animation: none` /
  `transition-property: opacity` on the known animated classes. Do not use
  a blanket `* { transition: none !important }` reset.
- Where you introduce translucent chrome in workstream 3, add
  `@media (prefers-reduced-transparency: reduce)` fallbacks to near-solid
  backgrounds without blur.

### 3. Translucent chrome (bottom nav + sticky headers)

- `components/MobileNav.tsx` bottom bar and any sticky page headers that
  currently use a solid background + 1px top/bottom border:
  - background: semi-transparent dark (keep existing CSS variables/theme;
    both light and dark themes exist - check how theming is done first)
  - `backdrop-filter: blur(...) saturate(...)` with a solid-color fallback
    via `@supports not (backdrop-filter: blur(1px))`
  - replace the 1px divider with a subtle gradient/fade edge
- Content must remain legible over the blur (slightly higher text contrast
  if needed).

### 4. Menus/popovers spatial anchoring

- Find dropdown/popover-like UI (e.g. hamburger drawer, the watchlist card
  "..." panel `.wl2g-more-panel`, share menus). Where they appear/disappear
  with a scale or fade, set `transform-origin` to the trigger side (e.g.
  top-right for a panel opening below a top-right trigger) so they grow from
  their trigger. CSS-only where possible.

## Constraints

- NO new npm dependencies.
- NO inline `style={}` additions.
- Keep the total diff moderate (target under ~400 changed lines). If you
  find more candidates than fit, prioritize: bottom nav > home cards >
  watchlist cards > menus, and list what you intentionally skipped in your
  final summary.
- Do NOT add a RELEASES entry to `app/updates/page.tsx` (the parent agent
  will add it at merge time to avoid version-number conflicts).
- Do NOT touch: API routes, lib/ logic, share pages' PNG export layout.
- All Japanese display strings must remain untouched and UTF-8.

## Process rules

- First run `npm install` (node_modules absent in this worktree).
- Verify with `npx tsc --noEmit`. Do NOT run `npm run build` (parent will).
- Commit on branch `feature/motion-standards-387` with clear messages.
  Do NOT commit this AGENT_TASK.md or a file named `Hermes`.
- Final summary must include: a table of every selector/component touched
  per workstream, and the list of intentionally skipped candidates.
