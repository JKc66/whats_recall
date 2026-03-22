# AGENTS.md

## Cursor Cloud specific instructions

### Overview

WhatsApp Deleted Messages Monitor — monitors WhatsApp chats for deleted messages, preserves them, and shows them via a web dashboard. Backend uses Hono on Bun with SQLite; frontend uses SolidJS + TypeScript + Vite.

### Running in development

See `README.md` for full details. In short:

```bash
# Terminal 1 — backend (with hot reload)
bun run dev

# Terminal 2 — frontend (Vite HMR on :5173, proxies /api and /ws to :3001)
cd web && bun run dev
```

### Key caveats

- **Driver:** The project uses `@whiskeysockets/baileys` — it is a headless multi-device implementation that does **not** requires Chromium/Puppeteer.
- **Default password:** `AUTH_PASSWORD` in `.env` is required for dashboard login.
- **WhatsApp connection:** On first run a QR code appears in the terminal. Alternatively, the dashboard under **Settings** supports linking via **Phone Pairing Code**.
- **Base Path & Proxy:** The frontend uses `/whats/` as its base path. During development, Vite on `:5173` proxies `/whats/api` and `/whats/ws` to the backend on `:3001` (controlled by `WEB_PORT` in `.env`).
- **SQLite is embedded** via `bun:sqlite` — data is stored in `data/messages.db`.
- **PM2 production mode:** `bun run build && pm2 start ecosystem.config.cjs`. Backend serves the built frontend from `public/` on port `WEB_PORT`.
+
+### Design & Aesthetic
+
+The project follows the **Impeccable Technical Aesthetic** defined in `.impeccable.md`. All UI additions MUST follow these rules:
+
+- **Glassmorphism:** Use `backdrop-filter: blur(24px)` and semi-transparent Zinc backgrounds for panels and headers.
+- **Typography:** Use **Geist** for general interface text and UI labels. Use **JetBrains Mono** for technical data: timestamps, phone numbers, configuration values, and raw IDs.
+- **Colors:** Primarily **Zinc** (dark theme) with **Emerald** (`#34d399`) for accents and status indicators.
+- **Icons:** Use high-precision, linear SVG icons.
+
+**Guideline:** Prioritize utility and technical precision over "social" or "chat-app" aesthetics. The tool should feel like a reliable, professional monitor.
+
