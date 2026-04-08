# 🤖 Agent Intelligence & Protocol (AGENTS.md)

This document is specifically designed for AI agents (Claude, Gemini, etc.) to understand the core architecture, design philosophy, and operational constraints of the **WhatsApp Deleted Messages Monitor** project before performing any modifications.

---

## 🏛️ Core Architecture & Tech Stack
- **Runtime**: [Bun](https://bun.sh) (High-performance, built-in TS support).
- **Backend**: [Hono](https://hono.dev/) (HTTP + WebSockets).
- **Frontend**: [SolidJS](https://www.solidjs.com/) (Fine-grained reactivity, no Virtual DOM).
- **Persistence**: SQLite with **Write-Ahead Logging (WAL)** enabled for concurrency.
- **Messaging**: [Baileys](https://github.com/WhiskeySockets/Baileys) (Socket-based WhatsApp protocol).

---

## 🎨 Design Philosophy
The UI follows a **Softened Nothing Design System**, adhering exactly to the **Nothing Design** specifications with a slightly reduced "hacker-terminal" roleplay.
- **Three-Layer Rule**: Primary (Display size, Doto font), Secondary (Body context, Space Grotesk), Tertiary (Metadata & Labels, Space Mono).
- **Palette**: Strictly achromatic (Monochrome). **Dark Mode**: Background: `#000000` (OLED), Primary Text: `#E8E8E8`, Display Text: `#FFFFFF`, Secondary Text: `#999999`, Metadata: `#666666`. **Light Mode**: Background: `#F5F5F5`. **Nothing Red** (#D71921) is the only allowed accent.
- **Avatar / peer tints**: Chat avatars use a **dark grayscale fill** so white initials stay legible. **Group sender names** use **distinct saturated hues** per peer (same index as the avatar hash) so participants are easy to tell apart. Functional identification only—not arbitrary UI chrome colors.
- **Implementation**: Avoid writing raw Tailwind classes for basic components. Use the standardized design system classes in `index.css`:
  - **Typography**: `.text-display-lg`, `.text-subheading`, `.text-body-sm`, `.text-label`, `.text-metadata`.
  - **Buttons**: `.btn` with variants `.btn-primary`, `.btn-secondary`, `.btn-destructive`.
  - **Controls**: `.segmented-control` + `.segmented-item` (with brackets), and `.tag` for badges.
- **Anti-Patterns**: No gradients, no glassmorphism (backdrop-blur), no heavy shadows. No generic Tailwind colors (`text-red-500`), and no secondary colors (success/warning hues) — use ONLY strictly defined variables representing monochrome or the allowed accent (`--accent`).
- **Communication**: Use clear, functional, and uppercase interface text (e.g., `NO_MESSAGES_LOGGED` instead of "No messages found").

---

## 🚦 Operational Protocols

### 🧪 Testing Environment
- **Command**: Use `bun t` for quiet diagnostic mode (shows failures only).
- **Command**: Use `bun test` for full verbose output.
- **Standard**: All tests must set `process.env.NODE_ENV = "test"` as the very first line to ensure database isolation.
- **Debugging**: If logs are needed during testing, set `process.env.VERBOSE = "true"`.

### 🧹 Destructive Operations (The Wipe Protocol)
- **Engine**: Data deletion calls via `getDb().clearAllData()` **require** an explicit `true` parameter in non-test environments to bypass safety locks.
- **UX**: Terminology for deletion is **DATA_WIPE**. Avoid dramatic 'roleplay' labels like 'PURGE' or 'TERMINATE'.

### 🪵 Standardized Logging
- **Utility**: Always use the custom logger located at `src/logger.ts`.
- **Categories**: `HTTP`, `WA`, `BOOT`, `AUTH`, `WS`, `SERVER`, `DB`, `API`, `CONN`, `PROCESSOR`, `SYNC`.
- **Silence**: Logging is automatically suppressed in standard `bun t` test runs unless `VERBOSE=true`.

---

## 🛡️ Security & Environment
- **Authentication**: `AUTH_PASSWORD` (env) is used for both dashboard login and destructive operation authorization.
- **Fingerprinting**: Client-side hardware fingerprinting via **ThumbmarkJS** is mandatory for session binding.
- **Privacy**: All media deduplication is done strictly via local SHA-256 hashing.
- **Payload Boundaries (DoS)**: All mutation endpoints (`POST`, `DELETE`) must implement Hono `bodyLimit` wrapper (e.g., `8192` bytes) and wrap `c.req.json()` in try/catch to gracefully handle malformed JSON memory attacks.

---

## 🤖 Contextual Reminders
- **No Path Placeholders**: Always use absolute paths for file operations if possible, or `resolve()` from the data directory.
- **Worker Offloading**: Use `src/workers/` for heavy operations like media hashing or processing.
- **Environment Context**: The app is designed to run in **PM2** (`ecosystem.config.cjs`). Restart the process after backend changes.
