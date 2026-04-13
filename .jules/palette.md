## 2025-04-03 - Keyboard Accessibility for Interactive Media
**Learning:** In chat applications, inline media (like images and videos) that expand or open lightboxes via `onClick` handlers often lack keyboard accessibility. This makes it impossible for users relying on keyboard navigation to view full-size media.
**Action:** When adding `onClick` handlers to `<img>` or `<video>` elements for viewing full media, always add `role="button"`, `tabIndex={0}`, and an `onKeyDown` handler that triggers the action on the `Enter` or `Space` key. Additionally, provide visual focus indicators (`focus-visible:ring`) to signal the element's interactivity.
## 2025-04-03 - Theming and Hardcoded Colors
**Learning:** Hardcoded utility colors (like `bg-zinc-900`, `bg-white/5`) break the visual harmony and Light/Dark mode support.
**Action:** Always map backgrounds, text, and borders to the application's design system tokens defined in `index.css` (e.g., `bg-surface-raised`, `text-text-secondary`, `border-border`).
## 2024-05-24 - Toggle Checkboxes ARIA Missing
**Learning:** Found that custom toggle switches built with `<input type="checkbox" class="sr-only">` and adjacent visual `<div>`s were lacking `aria-label`s. This means screen reader users would encounter an unlabeled toggle switch that just announces "checkbox" or its state, but not its function.
**Action:** Always ensure visually-hidden input elements that power custom toggles have an explicit `aria-label` or `aria-labelledby` so their function is properly announced to assistive technologies.

## 2024-05-18 - Hover-Only Icon Actions Keyboard Accessibility
**Learning:** Using `opacity-0 group-hover:opacity-100` on interactive elements (like icon-only download buttons) completely hides them from keyboard-only users who navigate via `Tab`. The element will receive focus but remain `opacity-0`, making the interface confusing and inaccessible.
**Action:** When hiding an interactive element via `opacity-0` until hovered, always ensure you add `focus-visible:opacity-100` to make it visible on keyboard focus, alongside a clear focus ring (e.g., `outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:bg-accent`).
