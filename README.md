# Watch Claw

[中文](./README_CN.md)

> A pixel-art house where your OpenClaw AI lives -- watch it code, think, rest, and celebrate in real time.

![Watch Claw V1 Screenshot](./docs/assets/V1-demo.jpg)

**Watch Claw** is a real-time pixel-art visualization of the [OpenClaw](https://github.com/openclaw/openclaw) AI agent's working state. A lobster-hat character -- representing the OpenClaw agent -- lives in a cozy three-floor house, moving between nine rooms, performing activities, and expressing emotions based on the agent's actual runtime events.

## Quick Start

### Download Desktop App (Recommended)

Go to the [Releases](https://github.com/luyao618/watch-claw/releases) page and download the latest version:

- **macOS**: `.dmg` installer or `.zip` archive

The app auto-starts the built-in Bridge Server and connects to your running OpenClaw session. No Node.js or dev tools required.

The desktop app supports:

- **System tray** -- keeps running in the background after closing the window; restore anytime from the tray
- **Always-on-top** -- pin the window so you can watch the character while you code
- **Auto-reconnect** -- reconnects automatically after disconnection; seamlessly follows session switches

### Run from Source

```bash
git clone https://github.com/luyao618/watch-claw.git
cd watch-claw
pnpm install
pnpm dev
```

Open `http://localhost:5173` in your browser, then start an OpenClaw session in another terminal to see the character react.

## How It Works

```
OpenClaw runs a tool  -->  Session log (JSONL)  -->  Bridge Server pushes  -->  Character reacts
```

A lightweight Bridge Server monitors OpenClaw's session logs (`~/.openclaw/agents/main/sessions/`), detects new entries via `fs.watch`, and pushes them to the browser over WebSocket. The front-end parses these events and translates them into character behaviors.

## Room Mapping

The character moves between rooms based on what the OpenClaw agent is doing:

```
         +-------------------------------------------------+
  3F     |  📦 Warehouse      📚 Study        🌙 Balcony    |
  Attic  |  (Download)        (Docs)          (Search)      |
         +-------------------------------------------------+
  2F     |  🔧 Toolbox        🛋 Office       🛏 Bedroom    |
  Main   |  (Execute)         (Chat)          (Rest)        |
         +-------------------------------------------------+
  1F     |  🏚 Basement       🖥 Server Room  🗑 Trash      |
  Base   |  (Subagents)       (Code)          (Delete)      |
         +-------------------------------------------------+
```

| What the AI is doing                                       | Where the character goes | Emotion  |
| ---------------------------------------------------------- | ------------------------ | -------- |
| `web_search` / `web_fetch`                                 | 🌙 Balcony               | Curious  |
| `read` / `write` / `edit` / `grep` and other file ops      | 📚 Study                 | Focused  |
| Download/install (`curl`, `pip install`, `npm install`...) | 📦 Warehouse             | Curious  |
| Dev/build (`git`, `python`, `node`, `cargo`, `docker`...)  | 🖥 Server Room           | Focused  |
| Generic commands (`ls`, `echo`, etc.)                      | 🔧 Toolbox               | Serious  |
| Text reply / thinking                                      | 🛋 Office                | Thinking |
| Subagents / multi-session                                  | 🏚 Basement              | Thinking |
| Delete files (`rm`, `trash`...)                            | 🗑 Trash                 | Serious  |
| Idle > 30s / session end                                   | 🛏 Bedroom               | Sleepy   |

## Keyboard Controls

| Key                 | Action                  |
| ------------------- | ----------------------- |
| Arrow keys          | Manually move character |
| `Z`                 | Toggle full-house view  |
| `F`                 | Follow character        |
| `D`                 | Toggle dashboard        |
| `M`                 | Mute                    |
| `+` / `-` or scroll | Zoom                    |

## Features

- **Phaser 3 Arcade Physics** -- gravity, floor jumping, drop-through one-way platforms
- **Character FSM** -- idle, walking, jumping, typing, thinking, sleeping, celebrating
- **Smart auto-navigation** -- walks to passage, jumps/drops between floors, walks to target room
- **Emotion bubbles** -- focused, thinking, sleepy, happy, confused, curious, serious, satisfied
- **Particle effects** -- confetti for celebration, sparks for errors, floating Z's for sleep
- **Sound effects** -- footsteps, typing, snoring, jump, celebration, error sounds
- **Dashboard** -- connection status, character state, session info, token usage, activity log
- **Electron desktop app** -- standalone window, system tray, always-on-top, Bridge auto-start

## Developer Commands

```bash
pnpm dev                     # Dev server + Bridge Server
pnpm dev:electron            # Run as Electron desktop app
pnpm build                   # Production build
pnpm build:electron:mac      # Package macOS zip
pnpm build:electron:mac:dmg  # Package macOS DMG
pnpm test                    # Run tests
pnpm lint                    # Lint
pnpm typecheck               # Type check
```

For the detailed release workflow, see [docs/RELEASE.md](./docs/RELEASE.md).

## Tech Stack

Phaser 3 (Arcade Physics) + React 19 + TypeScript + Vite + Electron + WebSocket

## Documentation

- [Product Requirements Document](./docs/PRD.md) ([中文](./docs/PRD_CN.md))
- [Technical Design Document](./docs/TECHNICAL.md) ([中文](./docs/TECHNICAL_CN.md))
- [Task Breakdown](./docs/TASKS.md) ([中文](./docs/TASKS_CN.md))

## Contributing

Contributions are welcome! Fork the repo → create a branch → commit changes → open a PR.

## License

[MIT](./LICENSE) -- Copyright 2026 luyao618
