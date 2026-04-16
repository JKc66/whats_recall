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
## 2024-05-15 - Missing ARIA labels on icon-only utilities and search inputs
**Learning:** Found instances where utility buttons (like the force sync refresh button) and general utility inputs (like the search bar) were missing ARIA labels, despite some standard navigation buttons having them. The lack of associated labels or `aria-label`s on generic inputs creates a barrier for screen reader users trying to understand the functionality.
**Action:** Always verify that icon-only buttons (such as refresh, delete, or theme toggles) and standalone search or filter inputs have proper `aria-label` attributes if there's no visible accompanying label element.
## 2024-05-18 - Missing ARIA labels on responsive icon-only buttons
**Learning:** Tailwind utility classes like `max-md:hidden` often create unlabelled, icon-only buttons on mobile devices because their semantic text labels disappear from the accessibility tree, leaving only an SVG icon.
**Action:** When auditing or implementing buttons, always verify if text labels are conditionally hidden across breakpoints. If so, provide an explicit `aria-label` to preserve context for screen readers on those devices.
## 2025-01-16 - Proper Keyboard Focus Indicators for Video Players
**Learning:** Native `focus-visible` pseudo-classes on custom interactive media elements (e.g. video note containers, internal mute buttons) only trigger on explicit keyboard navigation (tabbing), not programmatic focus (`.focus()`).
**Action:** When adding ARIA and keyboard handlers to non-standard interactive components, ensure `focus-visible:ring-x` is applied and verify it visually via sequential `Tab` keypresses in playwright.
## 2025-04-12 - ARIA Tab Accessibility
**Learning:** Custom tab navigation structures must use proper ARIA roles (`role="tablist"` on the container with an `aria-label`, and `role="tab"` on the buttons with dynamic `aria-selected` states) to ensure screen readers can accurately interpret the layout.
**Action:** When creating or modifying tabbed interfaces, always implement full ARIA attributes and pair them with clear keyboard focus indicators (e.g., using Tailwind's `focus-visible` utilities).
## 2025-05-19 - Keyboard focus states on custom ARIA tabs
**Learning:** Custom tab navigation patterns missing native keyboard focus styling make the interface confusing to navigate via keyboard. While some components like sidebar items correctly implement focus outlines, custom implementations using plain buttons wrapped in `role="tablist"` can lose this.
**Action:** When implementing or updating custom tab interfaces (`role="tab"`), always apply standard focus indicators. Specifically, use `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent` to ensure the currently focused tab is clearly visible.
