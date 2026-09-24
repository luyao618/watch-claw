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

## Configuration

| Variable                 | Default                            | Description                                               |
| ------------------------ | ---------------------------------- | --------------------------------------------------------- |
| `BRIDGE_HOST`            | `127.0.0.1`                        | Interface to listen on. Use `0.0.0.0` for LAN access.     |
| `BRIDGE_PORT`            | `18790`                            | Port to listen on.                                        |
| `OPENCLAW_SESSIONS_DIR`  | `~/.openclaw/agents/main/sessions` | Directory containing `sessions.json`.                     |
| `BRIDGE_ALLOWED_ORIGINS` | _(empty)_                          | Comma-separated extra browser origins allowed to connect. |

If the port is already in use, the bridge prints a single error and exits with a nonzero status.

## Allowed origins

Browsers let any website open a WebSocket to `127.0.0.1`, so the bridge checks the `Origin` header of every connection and rejects untrusted ones with HTTP 403. These are always accepted:

- clients that send no `Origin` (Node scripts, native apps)
- `file://` pages (the packaged Electron app)
- `http(s)://localhost`, `http(s)://127.0.0.1` and `http(s)://[::1]` on any port (`pnpm dev`, `pnpm preview`)

To connect from any other page, add its exact origin (scheme, host and port) to `BRIDGE_ALLOWED_ORIGINS`. The bridge never uses the `Host` header to decide, so DNS-rebinding tricks can't get around the check.

### LAN / mobile access

To use the PWA from a phone on the same network, the bridge has to listen on the LAN and also trust the origin the phone loads the page from:

```bash
BRIDGE_HOST=0.0.0.0 BRIDGE_ALLOWED_ORIGINS=http://192.168.1.20:5173 pnpm dev
```

Replace `192.168.1.20:5173` with the address you open in the phone's browser. List several origins separated by commas, e.g. `http://192.168.1.20:5173,https://my-tunnel.example.com`. Then enter `ws://192.168.1.20:18790` in the app's server settings.
