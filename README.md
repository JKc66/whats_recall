<div align="center">

# WHATSRECALL
### SECURE_MESSAGE_ARCHIVAL_SYSTEM

[![Version](https://img.shields.io/badge/version-1.0-white?style=flat-square)](#)
[![Runtime](https://img.shields.io/badge/Runtime-Bun-000?logo=bun&logoColor=white&style=flat-square)](https://bun.sh)
[![Frontend](https://img.shields.io/badge/Frontend-SolidJS-2c4f7c?logo=solid&logoColor=fff&style=flat-square)](https://www.solidjs.com/)
[![Backend](https://img.shields.io/badge/Backend-Hono-E36002?logo=hono&logoColor=white&style=flat-square)](https://hono.dev/)
[![Design](https://img.shields.io/badge/Design-Nothing-D71921?style=flat-square)](#design-system)

**NEVER_MISS_A_MESSAGE.**
A privacy-first archival system that captures deleted messages, saves view-once media, and provides a premium technical dashboard for real-time review.

[FEATURES](#-key-features) • [QUICK_START](#-quick-start) • [ARCHITECTURE](#-technical-architecture) • [SECURITY](#-security--privacy)

---

</div>

## 01_KEY_FEATURES

| | |
| :--- | :--- |
| 🕵️ **SELECTIVE_MONITORING** | Precision control: only track the specific chats you choose. |
| 📸 **VIEW_ONCE_PRESERVATION** | Bypasses "View Once" restrictions by capturing and archiving media. |
| ♻️ **SMART_DEDUPLICATION** | Global SHA-256 media hashing prevents redundant storage and saves disk space. |
| ⚡ **REAL_TIME_SYNC** | Instant dashboard updates via high-performance WebSockets. |
| 🎭 **REACTION_TRACKING** | Full support for real-time message reactions and emoji changes. |
| 🧵 **THREADED_CONTEXT** | Preserves and displays quoted messages to maintain conversation flow. |
| 🔒 **SECURITY_FIRST** | Hardware fingerprinting + `HttpOnly` / `SameSite=Strict` session management. |
| 💎 **NOTHING_AESTHETIC** | Monochromatic dashboard, `Doto` hero type, and functional identification tints. |

---

## 02_TECHNICAL_ARCHITECTURE

> Built for performance, reliability, and extreme privacy.

| LAYER | TECHNOLOGY | RATIONALE |
| :--- | :--- | :--- |
| **RUNTIME** | [Bun](https://bun.sh) | High-performance JS runtime with native TS support. |
| **BACKEND** | [Hono](https://hono.dev/) | Ultra-fast web framework with standard-compliant fetch API. |
| **FRONTEND** | [SolidJS](https://www.solidjs.com/) | Fine-grained reactivity and minimal UI overhead. |
| **DATABASE** | SQLite (WAL) | Local, file-based persistence with Write-Ahead Logging for concurrency. |
| **WHATSAPP** | [Baileys](https://github.com/WhiskeySockets/Baileys) | Reliable Multi-Device WhatsApp API implementation. |

---

## 03_DESIGN_SYSTEM

This project adheres to the **SOFTENED_NOTHING** design system. It prioritizes information density and typography over decorative elements.

- **TYPOGRAPHY**: `Doto` (Primary), `Space Grotesk` (Secondary), `Space Mono` (Tertiary).
- **PALETTE**: Strictly achromatic. `#000000` (OLED), `#E8E8E8` (Primary Text), `#D71921` (Nothing Red Accent).
- **IDENTIFICATION**: Avatars use grayscale fills; group participants use distinct hues for functional clarity only.
- **PHILOSOPHY**: No gradients, no shadows, no glassmorphism. Just data.

---

## 04_QUICK_START

### 1_INSTALLATION
```bash
# Clone the repository
git clone https://github.com/JKc66/whats_recall.git
cd whats_recall

# Install dependencies and build frontend
bun install
bun run build
```

### 2_CONFIGURATION
```bash
cp .env.example .env
# Edit .env and set a secure AUTH_PASSWORD
```

### 3_EXECUTION
```bash
# Start the production server
bun start
```

*On first run, follow the terminal instructions to pair your account via QR Code or Pairing Code. Dashboard available at `http://localhost:3001/whats/`.*

---

## 05_PROJECT_STRUCTURE

```text
├── 📂 data/               # Persistent storage (SQLite DB + Media files)
├── 📂 public/             # Optimized frontend production assets
├── 📂 src/                # Backend Architecture (TypeScript)
│   ├── 📂 api/          # Hono routes, middleware & WebSocket server
│   ├── 📂 db/           # Modular SQLite database layer
│   ├── 📂 whatsapp/     # Baileys socket & handlers
│   └── 📂 workers/      # Background media processing
├── 📂 web/                # Frontend (SolidJS + Vite + Tailwind v4)
│   └── 📂 src/          # UI Logic & Components
├── ecosystem.config.cjs    # PM2 Configuration
└── package.json           # Global scripts
```

---

## 06_SECURITY_&_PRIVACY

- **LOCAL_FIRST**: All messages and media are stored exclusively on your hardware.
- **SESSION_BINDING**: Access tokens are cryptographically bound to hardware fingerprints via **ThumbmarkJS**.
- **PAYLOAD_BOUNDARIES**: Automatic rejection of oversized payloads to prevent DoS attacks.
- **ZERO_EXTINCTION**: SQLite WAL mode ensures data durability even during unexpected crashes.

---

## 07_DEVELOPMENT

| COMMAND | DESCRIPTION |
| :--- | :--- |
| `bun dev` | Start development server with hot-reloading. |
| `bun fix` | Automatically rewrite arbitrary CSS to match design system. |
| `bun lint` | Project-wide logic and style check. |
| `bun t` | Run tests in quiet diagnostic mode. |
| `bun test` | Full verbose test suite execution. |

---

<div align="center">
[LICENSE](LICENSE) • [CONTRIBUTE](#) • [REPORT_ISSUE](https://github.com/JKc66/whats_recall/issues)
</div>
