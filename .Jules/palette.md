## 2024-05-15 - Missing ARIA labels on icon-only utilities and search inputs
**Learning:** Found instances where utility buttons (like the force sync refresh button) and general utility inputs (like the search bar) were missing ARIA labels, despite some standard navigation buttons having them. The lack of associated labels or `aria-label`s on generic inputs creates a barrier for screen reader users trying to understand the functionality.
**Action:** Always verify that icon-only buttons (such as refresh, delete, or theme toggles) and standalone search or filter inputs have proper `aria-label` attributes if there's no visible accompanying label element.
## 2025-01-16 - Proper Keyboard Focus Indicators for Video Players
**Learning:** Native `focus-visible` pseudo-classes on custom interactive media elements (e.g. video note containers, internal mute buttons) only trigger on explicit keyboard navigation (tabbing), not programmatic focus (`.focus()`).
**Action:** When adding ARIA and keyboard handlers to non-standard interactive components, ensure `focus-visible:ring-x` is applied and verify it visually via sequential `Tab` keypresses in playwright.
