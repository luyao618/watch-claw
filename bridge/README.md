# Bridge Server

A lightweight Node.js process that watches OpenClaw session log files and pushes new events to the browser via WebSocket.

## How it works

1. Reads `~/.openclaw/agents/main/sessions/sessions.json` to find the most recently active session
2. Uses `fs.watch` to monitor the session's JSONL file for new lines
3. Broadcasts new JSON events to all connected WebSocket clients on `ws://127.0.0.1:18790`
4. Periodically re-checks `sessions.json` (every 2s) to detect session switches

## Running

The bridge server starts automatically with `pnpm dev` (via `concurrently`).

To run standalone:

```bash
npx tsx bridge/server.ts
```
