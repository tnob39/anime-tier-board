# Anime Tier Board Design Direction

This document defines the practical design direction for the next implementation pass. It is intentionally scoped to UI behavior, component treatment, and accessibility. It does not prescribe backend schema names or implementation details beyond what the interface needs.

## Product Posture

Anime Tier Board should feel like a fast personal ranking tool first, then a shareable discussion object. The main experience is operational: users need to scan a season list, move titles between tiers, save/share/export, and understand what changed without fighting the interface.

Design for the smallest useful screen first. Desktop should add density and comfort, not a separate mental model.

## Mobile-First Tier Movement

Drag and drop can remain available, but mobile ranking should not depend on precise dragging.

Primary mobile interaction:
- Tapping an anime card opens a bottom sheet titled with the anime name and current tier.
- The sheet shows large tier destination buttons in tier order, using each tier color as a left accent or compact swatch.
- The current tier is marked with "Current" and disabled.
- Moving an item closes the sheet, updates the card position immediately, and shows a short status message such as "Moved to A".
- The sheet includes "View details" only if there is a real detail target. Avoid dead-end controls.

Secondary mobile interaction:
- Keep drag as an enhancement for users who expect it.
- Use a drag handle only if accidental moves become a problem; otherwise make the full card draggable.
- During drag, make target rows visibly active with a clear border and soft background, not only a color shift.

Desktop interaction:
- Preserve drag and drop as the primary interaction.
- Keep the tap/click move menu available for accessibility and parity.
- Keyboard users must be able to choose an item, open the move menu, select a tier, and confirm without using drag.

Movement feedback:
- A moved card should animate with a short positional transition when practical.
- The save indicator should change independently from movement feedback, so users can tell "moved" from "saved".
- If saving fails, do not undo the visible move automatically. Show a clear save error and offer retry.

## Shared Page And Google-Required Comments

The shared page should feel like a public artifact: read-only board first, social context second.

Shared page layout:
- Top area: board title, season, owner display name if available, last updated/shared timestamp, and compact reaction summary.
- Main area: the shared tier board, optimized for image scanning.
- Below board: reactions, comments, and a small call to action to create your own board.

Comments should require Google sign-in. This needs to be explicit without feeling like a blocking error.

Comment states:
- Signed out: show existing comments, then a comment box placeholder with a Google sign-in button. Copy: "Sign in with Google to comment."
- Signing in/loading: keep the comment area visible and show a small loading indicator.
- Signed in: show a textarea, character count, submit button, and the signed-in user identity.
- Submit pending: disable submit, preserve typed text, and show progress in the button.
- Submit failed: keep typed text and show an inline error with retry.
- Empty state: "No comments yet" with the Google sign-in prompt or active comment box directly beneath it.

Comment rules:
- Comments should be plain text with preserved line breaks.
- Set a practical limit, for example 500 characters, and show the limit before submission.
- Avoid nested replies for the first version. A flat chronological thread is easier to moderate and implement.
- Each comment should show display name, timestamp, and optional "You" marker for the current user's own comment.
- Deletion can be limited to the comment owner in a later pass; if added now, use a simple text command in a menu.

## Expanded Reactions

The current like pattern should expand into a small reaction bar. Reactions are quick sentiment, not a rating system.

Recommended first set:
- Like
- Fire
- Cry
- Shock
- Confused

Use icons with text labels available to screen readers. On mobile, show icon plus count; on desktop, labels can appear on hover or in an overflow explanation if space is tight.

Reaction behavior:
- A viewer can select one reaction per shared board by default.
- Selecting another reaction swaps the previous reaction.
- Tapping the active reaction removes it.
- Counts update optimistically, then reconcile with the server response.
- If the update fails, restore the previous counts and show a compact inline error.

Reaction display:
- Sort reactions in the fixed product order, not by popularity, so the bar does not jump.
- Show zero-count reactions if the viewer has not reacted, because they are available actions.
- Highlight the viewer's active reaction with a filled background and stronger border.
- Keep the total social proof compact in the header, for example "24 reactions".

## Viewing Status UI

Viewing status helps users understand whether they have ranked, watched, dropped, or ignored a title. It should not compete with tier rank.

Statuses:
- Planning
- Watching
- Completed
- Paused
- Dropped
- Not watching

Placement:
- On anime cards, show status as a small pill below the title when text is visible, or as a top-corner dot/pill on image-only compact cards.
- In the move menu/bottom sheet, include a "Viewing status" segmented control below tier movement.
- On shared boards, statuses should be visible only when the owner chose to share them. Default to showing tier rank only.

Visual treatment:
- Use muted semantic colors, not tier colors, so status and rank stay distinct.
- Keep status pills small: 12-13 px text, 24-28 px height, 6-8 px radius.
- Do not use color alone. Include a short text label or accessible name.

Filtering and dashboard use:
- Dashboard filters can include status chips, but the board should not hide cards by default.
- If filters are active, show a visible count and a clear reset control.

## Dashboard Visual Direction

The dashboard should be a dense, scannable workspace rather than a marketing page.

Top structure:
- Sticky topbar with app name, season/year controls, save status, Google account state, and primary actions.
- Primary actions: refresh/load season, share, export PNG.
- Secondary actions: reset, sign out, advanced options.

Main structure:
- Board first. The tier board should be visible in the first viewport on both mobile and desktop.
- Use the unranked pool as a working tray. On mobile it can appear after ranked tiers, but provide a jump control if the list is long.
- Use side panels only on wide screens. On mobile, use bottom sheets or inline sections.

Dashboard hierarchy:
- H1 should be literal and compact, for example "Anime Tier Board".
- Season/year controls belong near the title, not buried in settings.
- Save state should be always visible but quiet.
- Warnings and data-source messages should be inline banners below the toolbar, with direct recovery actions when possible.

Empty/loading/error states:
- Loading season: skeleton rows or a compact centered loader with the target season named.
- No anime found: explain the selected season/year and offer refresh or season change.
- Fetch warning: show the warning without blocking board use if cached data exists.
- Unauthenticated: local board use should remain available, with a clear note that Google sign-in enables cloud save and comments.

## Color, Spacing, And Component Principles

The app should keep its current restrained utility direction: light surfaces, clear borders, compact controls, and tier colors used as functional labels.

Color:
- Keep the base palette neutral: off-white background, white surfaces, dark ink, muted gray text, cool accent.
- Tier colors are data colors. Do not reuse them for unrelated buttons or alerts.
- Use semantic colors consistently: red for destructive/error, amber for warning, teal or blue for primary action.
- Avoid large decorative gradients, background blobs, and heavy shadows.
- Every colored tier label must compute or choose readable text color.

Spacing:
- Use an 8 px spacing grid.
- Mobile page padding: 12-16 px.
- Desktop page padding: 24-36 px.
- Control gaps: 8-10 px.
- Tier row internal gap: 8-12 px.
- Cards should be compact enough to support scanning many anime at once.

Components:
- Buttons: 40 px minimum height on mobile, 36-40 px on desktop. Icon-only buttons need labels via `aria-label` and tooltips where available.
- Cards: 8 px radius or less, clear focus outline, no nested decorative card frames.
- Tier rows: colored label column, bordered item area, clear empty drop state.
- Bottom sheets: full-width on mobile, max height around 80 vh, sticky action area only if content scrolls.
- Dialogs/menus: close on Escape, restore focus to the triggering card/control.
- Banners: concise text plus one action. Do not stack multiple persistent banners without collapsing or prioritizing them.

Typography:
- Use system UI fonts already present in the app.
- Keep dashboard text compact: 13-16 px for most UI, 20-24 px for page title.
- Avoid viewport-scaled type. Text should wrap cleanly instead.
- Japanese and English strings must both fit controls without clipping.

## Accessibility

The board must be usable without drag, without a mouse, and without color perception.

Keyboard:
- All cards must be focusable or have a focusable action inside them.
- Provide a keyboard path for moving cards between tiers.
- Use visible focus rings with at least 2 px contrast against the surrounding surface.
- Menus, bottom sheets, and dialogs should trap focus while open and restore focus on close.

Screen readers:
- Tier rows need accessible names such as "S tier, 4 items".
- Anime cards should expose title, current tier, and viewing status when present.
- Movement actions should be announced through a polite live region.
- Save and share state changes should be announced when they affect user confidence.

Touch and pointer:
- Touch targets should be at least 44 x 44 px for primary interactive elements on mobile.
- Do not require long press for essential actions.
- Avoid hover-only information. Hover can enhance desktop, but mobile must expose the same data.

Contrast:
- Text must meet WCAG AA contrast.
- Tier label text must be readable over custom tier colors.
- Reaction active states must include more than a color change, such as border, fill, icon state, or selected text.

Motion:
- Keep movement animations short and functional.
- Respect reduced-motion preferences by disabling non-essential transitions.
- Loading spinners should have accompanying text for screen readers.

Forms:
- Comment textarea must have a visible label.
- Error text should be associated with the field it describes.
- Character count should be announced politely when near the limit, not on every keystroke.

## Implementation Priority

1. Make mobile tier movement reliable with the bottom-sheet move flow and keyboard-accessible equivalent.
2. Add shared page comments gated by Google sign-in, with complete empty/loading/error states.
3. Expand reactions from a single like to a stable reaction bar.
4. Add viewing status as a distinct layer separate from tier rank.
5. Tighten dashboard visual hierarchy and state messaging.
6. Audit accessibility for keyboard movement, focus management, contrast, labels, and live announcements.
