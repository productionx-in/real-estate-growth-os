# Product-wide UI/UX audit and design system v2

Scope: every route and shared component in the workspace app (111 pages, 184 components). The aim is one design
language across the whole product, built into the shared components so every screen inherits it, rather than restyling
pages one by one. Business logic is untouched throughout.

## What the audit found (25 Nov 2026)

| Area | Finding | Effect on people |
| --- | --- | --- |
| Controls | 290 hand-built `<button>` vs 269 `Button`; 189 raw `<input>` vs 121 `Input`; 57 raw `<select>` | The same action looks and responds differently from module to module |
| Overlays | 19 hand-built pop-ups beside the shared `Dialog`; most without `role="dialog"` | Inconsistent entry and exit; screen readers did not announce them |
| Tables | 39 hand-built tables, no shared data table | Row hover, density and empty states vary |
| Depth | 5 corner radii in use, 10 shadow utilities, only 3 shadow tokens defined (the rest fell back to Tailwind defaults) | Surfaces look like they come from different products |
| Type | 12 font sizes, including 46 uses of 9–10 px | Hard to read, especially on phones |
| Motion | Colour fades only; no page, dialog or menu motion; spinners instead of placeholders | Changes feel abrupt; loading reads as "stuck" |
| Feedback | Hover and press feedback present on `Button` only | Hand-built controls feel dead |
| Accessibility | Focus ring varied per component | Keyboard users lose their place |

## Design system v2 (this change)

All in `app/globals.css` and `components/ui`, so it reaches every route at once:

- **Depth**: one elevation family (`shadow-2xs` … `shadow-2xl`), each a contact shadow plus an ambient one, tuned
  separately for light and dark. Raised surfaces add a lit top edge (`--edge-highlight`, `.surface-raised`).
- **Motion**: `--ease-out`, `--ease-in`, `--ease-spring` and durations of 150, 220 and 320 ms. Things that arrive use
  the spring curve; things that leave are faster and plain. Reduced motion makes everything instant.
- **Interaction defaults** (zero specificity, so components still win):
  - every clickable element answers hover and press within 150 ms;
  - the same focus ring everywhere;
  - disabled controls show a not-allowed cursor;
  - table rows fade their hover.
- **3D, used with purpose**:
  - `Tilt` (`components/ui/tilt.tsx`) is for showcase surfaces: dashboard tiles and stat cards. It gives a few degrees of
    perspective toward the pointer, a light that follows it, and a number that stands forward. Mouse only, at most once
    per frame, and off for reduced motion.
  - `.lift` is for clickable cards such as project cards.
  - Pages rise into place with slight perspective (`[orgSlug]/template.tsx`).
  - Dialogs rise from behind the page, and become bottom sheets with a grab handle on phones.
  - Menus open from the side they were triggered from.
  - Empty states show a floating stack of tiles.
- **Loading**: a shimmer sweeps across placeholders (`Skeleton`), and lists settle in turn (`.stagger`).
- **Navigation**:
  - the sidebar's current page sits on a raised pill, its marker grows in, and the other icons lean toward the pointer;
  - the phone tab bar's active tab pops.
- **Hand-built dialogs** (all 15 files) get the same entrance as `Dialog`, the same dimmer, and `role="dialog"`.
- **Type floor**: 37 tiny labels raised to 11 px. Only count bubbles keep 10 px.
- **Fixes found on the way**:
  - the Team page rendered sign-in times in the server's time zone, then the browser's (a hydration mismatch);
  - the inventory "Add many" auto-open broke a lint rule.

Verified:
- all 47 workspace routes on desktop and phone: no errors, no horizontal overflow;
- interactions in the browser: tilt, menus, dialogs, phone bottom sheets;
- `npm test` and the design-token checks.

## Rollout of the rest, one module per pull request

Each step moves hand-built pieces onto the shared components, so later design changes reach every screen without
editing pages:

1. **Controls**: raw `<button>`, `<input>`, `<select>` and `<textarea>` onto `Button`, `Input`, `Select` and `Textarea`,
   module by module (leads, inventory, projects, integrations, settings, platform console).
2. **Data tables**: a shared `DataTable` with sticky header, row hover and lift, an expandable row, density, empty and
   loading states, and stacked cards on phones. Then the 39 tables move to it.
3. **Overlays**: the 15 hand-built dialogs onto `Dialog` / `Sheet`. Add a shared side `Sheet` for detail drawers
   (inventory, leads).
4. **Feedback**: one toast system for success, error and undo (built on the lead-alert banner).
5. **Charts**: one chart frame (title, legend, tooltip, empty state) for analytics and reports.
6. **Calendar**: built on this system from the start (individual and team calendars).

Every step keeps the existing behaviour and is browser-checked on desktop and phone for every role.
