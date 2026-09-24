/**
 * Bridge Server — watches the latest OpenClaw session JSONL file and pushes
 * new events to all connected WebSocket clients.
 *
 * Usage:  tsx bridge/server.ts
 * Listens on ws://127.0.0.1:18790
 */

import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { parseAllowedOrigins, startBridgeServer } from './bridgeServer.ts'

// ── Configuration ────────────────────────────────────────────────────────────
const HOST = process.env.BRIDGE_HOST ?? '127.0.0.1'
const PORT = (() => {
  const raw = process.env.BRIDGE_PORT ?? '18790'
  const parsed = Number(raw)
  if (
    !Number.isFinite(parsed) ||
    parsed < 1 ||
    parsed > 65535 ||
    parsed !== Math.floor(parsed)
  ) {
    console.error(
      `[bridge] Invalid BRIDGE_PORT "${raw}", must be an integer 1–65535. Using default 18790.`,
    )
    return 18790
  }
  return parsed
})()
const SESSIONS_DIR = process.env.OPENCLAW_SESSIONS_DIR
  ? resolve(process.env.OPENCLAW_SESSIONS_DIR)
  : resolve(homedir(), '.openclaw/agents/main/sessions')
// Extra exact browser origins to accept, e.g. a PWA served on the LAN
const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.BRIDGE_ALLOWED_ORIGINS)

// ── Startup ──────────────────────────────────────────────────────────────────

console.log(`[bridge] Bridge Server starting on ws://${HOST}:${PORT}`)
console.log(`[bridge] Sessions dir: ${SESSIONS_DIR}`)
console.log(
  `[bridge] To allow LAN connections: BRIDGE_HOST=0.0.0.0 BRIDGE_ALLOWED_ORIGINS=http://<lan-ip>:5173 pnpm dev`,
)
if (ALLOWED_ORIGINS.length > 0) {
  console.log(`[bridge] Extra allowed origins: ${ALLOWED_ORIGINS.join(', ')}`)
}

startBridgeServer({
  host: HOST,
  port: PORT,
  sessionsDir: SESSIONS_DIR,
  allowedOrigins: ALLOWED_ORIGINS,
}).then(
  (bridge) => {
    // ── Graceful shutdown ────────────────────────────────────────────────────
    function shutdown(): void {
      console.log('\n[bridge] Shutting down...')
      void bridge.close().then(() => process.exit(0))
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  },
  (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[bridge] Port ${PORT} on ${HOST} is already in use (is another Bridge Server running?). Set BRIDGE_PORT to use a different port.`,
      )
    } else {
      console.error(`[bridge] Failed to start: ${err.message}`)
    }
    process.exit(1)
  },
)
