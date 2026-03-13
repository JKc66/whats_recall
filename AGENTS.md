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

- **Chromium path:** `whatsapp-web.js` expects `/usr/bin/chromium-browser`. In the Cloud VM, this is a symlink to Google Chrome. If missing: `sudo ln -sf /opt/google/chrome/google-chrome /usr/bin/chromium-browser`.
- **Default password:** `AUTH_PASSWORD` in `.env` defaults to `changeme`. Create `.env` from `.env.example` if it doesn't exist.
- **WhatsApp connection:** On first run a QR code appears in the terminal. A real phone must scan it. Without this, the dashboard shows "Disconnected" but still functions (login, settings, navigation all work).
- **Frontend build output:** `bun run build` outputs to `public/` (served by the backend). During dev, Vite on `:5173` proxies API calls to the backend on `:3001` (set by `WEB_PORT` in `.env`; the Vite proxy in `web/vite.config.ts` is hardcoded to 3001).
- **No linter/test framework configured.** Validation is done by running both dev servers and verifying module imports.
- **SQLite is embedded** via `bun:sqlite` — no external database needed. Data stored in `data/messages.db`.
- **PM2 production mode:** `bun run build && pm2 start ecosystem.config.cjs`. PM2 uses `bun` as interpreter. Backend serves the built frontend from `public/` on port `WEB_PORT`.
- **Secure cookies:** `.env` sets `NODE_ENV=production`, which enables `Secure` flag on session cookies. On localhost HTTP this still works in Chrome (special localhost exception). If testing with curl, auth cookies may not be set.
