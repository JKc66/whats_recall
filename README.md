<div align="center">

# WhatsApp Deleted Messages Monitor

[![Version](https://img.shields.io/badge/version-1.0-10B981)](https://github.com/your-repo)
[![Runtime](https://img.shields.io/badge/Runtime-Bun-000?logo=bun&logoColor=white)](https://bun.sh)
[![Frontend](https://img.shields.io/badge/Frontend-SolidJS-2c4f7c?logo=solid&logoColor=fff)](https://www.solidjs.com/)
[![Backend](https://img.shields.io/badge/Backend-Hono-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![License](https://img.shields.io/badge/License-MIT-10B981)](LICENSE)

**Never miss a message.** A secure, privacy-first archival system that captures deleted messages, saves view-once media, and provides a premium technical dashboard for real-time review.

[Explore Features](#-key-features) • [Quick Start](#-quick-start) • [Technical Architecture](#-technical-architecture) • [Security](#-security--privacy)

</div>

---

## ✨ Key Features

| | |
| :--- | :--- |
| 🕵️ **Selective Monitoring** | Precision control: only track the specific chats you choose. |
| 📸 **View-Once Preservation** | Bypasses "View Once" restrictions by capturing and archiving media before it disappears. |
| ♻️ **Smart Deduplication** | Global SHA-256 media hashing prevents redundant storage and saves disk space. |
| ⚡ **Real-time Analytics** | Instant dashboard updates via high-performance WebSockets. |
| 🎭 **Reaction Tracking** | Full support for real-time message reactions and emoji changes. |
| 🧵 **Threaded Context** | Preserves and displays quoted messages (replies) to maintain conversation flow. |
| 🔒 **Security-First** | Device fingerprinting via **ThumbmarkJS** + `HttpOnly` / `SameSite=Strict` session cookies. |
| 💎 **Softened Nothing UI** | Monochromatic dashboard (typography-first, dark themes). Per-peer avatar tiles use **dark** fills; **group** sender names use **distinct hues** per participant. See [`AGENTS.md`](AGENTS.md). |

---

## 🛠️ Technical Architecture

> Built for performance, reliability, and extreme privacy.

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **Runtime** | [Bun](https://bun.sh) | High-performance JS runtime with native TS support. |
| **Backend** | [Hono](https://hono.dev/) | Ultra-fast web framework with standard-compliant fetch API. |
| **Frontend** | [SolidJS](https://www.solidjs.com/) | Fine-grained reactivity and minimal UI overhead. |
| **Database** | SQLite (WAL) | Local, file-based persistence with Write-Ahead Logging for concurrency. |
| **WhatsApp** | [Baileys](https://github.com/WhiskeySockets/Baileys) | Reliable Multi-Device WhatsApp API implementation. |
| **Design** | [Nothing Design](.agents/skills/nothing-design) | **Softened Nothing** compliance: OLED monochrome base (`#000000`), `Doto` hero type, pill UI. Avatar chips add only achromatic peer-identification tints (documented in [`AGENTS.md`](AGENTS.md)). |

---

## 🚀 Quick Start

Ensure you have [Bun](https://bun.sh) installed on your system.

### 1. Installation
```bash
# Clone and enter the project
git clone <your-repo-url>
cd whatsapp_logger

# Install and build the frontend
bun install
bun run build
```

### 2. Configuration
```bash
cp .env.example .env
# Open .env and set your AUTH_PASSWORD to something strong
```

### 3. Launch
```bash
# Start the production server
bun start
```

On first run, follow the terminal instructions to pair your account via **QR Code** or **Pairing Code**. Once paired, access the dashboard at `http://localhost:3001/whats/`.

---

## ⚙️ Configuration Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `WEB_PORT` | `3001` | The port the Hono server will listen on. |
| `AUTH_PASSWORD` | `—` | **Required.** Password for dashboard access. |
| `NODE_ENV` | `development` | Set to `production` for secure/https-only cookies. |
| `TRUST_PROXY` | `false` | Enable if running behind Caddy, Nginx, or Proxy. |


---

## 🏗️ Project Structure

```text
├── 📂 data/               # Persistent storage (SQLite DB + Media files)
├── 📂 public/             # Optimized frontend production assets
├── 📂 src/                # Backend Architecture (TypeScript)
│   ├── 📂 api/          # Hono routes, middleware & WebSocket server
│   ├── 📂 db/           # Modular SQLite database layer
│   ├── 📂 whatsapp/     # Baileys socket, handlers, & state management
│   ├── 📂 workers/      # Multi-threaded background tasks
│   ├── index.ts         # Application bootstrapper
│   ├── logger.ts        # Standardized logging utility
│   └── types.ts         # Shared TypeScript definitions
├── 📂 web/                # Frontend (SolidJS + Vite + Tailwind v4)
│   ├── 📂 src/          # Application logic & UI components
│   │   ├── index.css    # Technical Design System (Optimized T4)
│   │   └── ...
│   └── index.html       # Web entry point
├── ecosystem.config.cjs    # PM2 Process Configuration
├── .env.example           # Configuration template
└── package.json           # Global scripts & dependencies
```

---

## 💎 Development & Maintenance

To maintain the project's design consistency, we use a **standardized CSS design system** defined in `index.css`. This ensures all components follow the **Nothing Design** specifications for typography, buttons, and controls without redundant or arbitrary styling.

### 🧩 Automated Formatting
Keep the project's design consistent by automatically rewriting arbitrary Tailwind classes project-wide from the root.

```bash
# Fix all classes project-wide
bun fix
```

### 🔍 Code Quality & Linting
Check for styling or logic issues across the entire dashboard interface:

```bash
# Project-wide lint
bun lint
```

### 🛠️ Advanced Tools
- `bun dev`: Start development server with hot-reloading.
- `bun t`: Run test suite in **quiet diagnostic mode** (shows only failures).
- `bun test`: Run full test suite with verbose output.
- `bun run typecheck`: Validate TypeScript types across the backend.

---

## 🛡️ Security & Privacy

Privacy is a core design principle:
- **Local Storage**: All messages and media are stored exclusively on *your* hardware.
- **Session Fingerprinting**: Access tokens are cryptographically bound to the device's unique hardware fingerprint via **ThumbmarkJS**.
- **Secure Auth**: Dashboards are protected by standard-compliant session management with `HttpOnly` and `SameSite=Strict` cookie flags.
- **Zero Extinction**: Deleted messages are preserved in WAL mode, ensuring durability even during sudden restarts.
- **Payload Boundaries**: Rejects oversized JSON payloads automatically to prevent memory-based Denial of Service (DoS) attacks.

---

## 📡 Deployment

### Using PM2 (Recommended)
```bash
bun run build
pm2 start ecosystem.config.cjs
pm2 save
```

### Reverse Proxy (Caddy)
Copy `Caddyfile.example` to `/etc/caddy/Caddyfile`, adjust your domain, and reload:
```bash
sudo systemctl reload caddy
```
