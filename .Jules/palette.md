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
