# Palette Journal — WhatsApp Monitor

## 2026-03-29 - Lightbox Close Affordance
**Learning:** The image lightbox had `role="dialog"` and keyboard dismiss (Escape), but zero *visible* UI to close it. On mobile touch devices, clicking the background behind the image is not a discoverable pattern — users get trapped in the preview with no obvious way out.
**Action:** Always add a visible close button (44×44px minimum touch target) to any overlay/modal/lightbox, even when background-click-to-dismiss exists. The button is the primary close affordance; background click is the shortcut.
