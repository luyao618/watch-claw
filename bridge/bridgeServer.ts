/**
 * Bridge Server core — watches the latest OpenClaw session JSONL file and
 * pushes new events to all connected WebSocket clients.
 *
 * This module has no side effects on import so it can be started and stopped
 * from tests. The CLI entry point (env parsing, signals) lives in server.ts.
 */

import {
  readFileSync,
  watch,
  statSync,
  existsSync,
  openSync,
  readSync,
  closeSync,
} from 'node:fs'
import { resolve, dirname } from 'node:path'
import type { AddressInfo } from 'node:net'
import { WebSocket, WebSocketServer, type VerifyClientCallbackAsync } from 'ws'

// ── Configuration ────────────────────────────────────────────────────────────
const SESSION_CHECK_INTERVAL_MS = 2_000 // re-check sessions.json every 2s
const WATCH_DEBOUNCE_MS = 50 // debounce fs.watch events (macOS may fire duplicates)
const SESSIONS_INDEX_DEBOUNCE_MS = 200 // debounce sessions.json watcher
const FILE_POLL_INTERVAL_MS = 500 // poll session file for changes (fs.watch fallback)

// ── Types ────────────────────────────────────────────────────────────────────
interface SessionEntry {
  sessionId: string
  sessionFile: string
  updatedAt: number
}

type SessionsIndex = Record<string, SessionEntry>

export interface BridgeServerOptions {
  host: string
  /** Port to listen on; 0 picks a free port (see `BridgeServer.port`). */
  port: number
  sessionsDir: string
  /** Extra browser origins to accept, compared exactly (see isOriginAllowed). */
  allowedOrigins?: string[]
}

export interface BridgeServer {
  /** The port actually bound. */
  port: number
  close(): Promise<void>
}

// ── Origin checks ────────────────────────────────────────────────────────────

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Parse a comma-separated list of origins (BRIDGE_ALLOWED_ORIGINS) into
 * normalized origin strings. Invalid entries are skipped with a warning.
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return []
  const origins: string[] = []
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim()
    if (trimmed.length === 0) continue
    let origin: string
    try {
      origin = new URL(trimmed).origin
    } catch {
      origin = 'null'
    }
    if (origin === 'null') {
      console.warn(
        `[bridge] Ignoring invalid BRIDGE_ALLOWED_ORIGINS entry: ${JSON.stringify(trimmed)}`,
      )
      continue
    }
    origins.push(origin)
  }
  return origins
}

/**
 * Decide whether a WebSocket handshake's Origin header is trusted.
 *
 * Browsers always send Origin, so this is what stops arbitrary websites from
 * reading session events through the visitor's browser. Accepted:
 *   - no Origin (non-browser clients such as Node or native apps)
 *   - file:// (the packaged Electron app)
 *   - http(s) pages served from localhost / 127.0.0.1 / [::1]
 *   - exact matches from `allowedOrigins`
 * The Host header is deliberately never consulted: under DNS rebinding an
 * attacker controls both Origin and Host.
 */
export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[] = [],
): boolean {
  if (origin === undefined) return true
  if (allowedOrigins.includes(origin)) return true
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  if (url.protocol === 'file:') return true
  return (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    LOOPBACK_HOSTNAMES.has(url.hostname)
  )
}

/** Start the bridge. Resolves once the WebSocket server is listening. */
export function startBridgeServer(
  options: BridgeServerOptions,
): Promise<BridgeServer> {
  const { host, sessionsDir, allowedOrigins = [] } = options
  const sessionsIndex = resolve(sessionsDir, 'sessions.json')

  // ── State ──────────────────────────────────────────────────────────────────
  let port = options.port
  let currentSessionFile: string | null = null
  let fileSize = 0
  let trailingPartial = '' // buffer for incomplete lines across fs.watch events
  let currentWatcher: ReturnType<typeof watch> | null = null
  let sessionsIndexWatcher: ReturnType<typeof watch> | null = null
  let sessionCheckTimer: ReturnType<typeof setInterval> | null = null
  let filePollTimer: ReturnType<typeof setInterval> | null = null
  let watchDebounceTimer: ReturnType<typeof setTimeout> | null = null
  let sessionsIndexDebounceTimer: ReturnType<typeof setTimeout> | null = null

  // ── Session discovery ──────────────────────────────────────────────────────

  function findLatestSession(): string | null {
    if (!existsSync(sessionsIndex)) {
      return null
    }
    try {
      // NOTE: sessions.json may be mid-write when we read it; JSON.parse failure
      // is caught and we return null, retrying on the next check interval.
      const raw = readFileSync(sessionsIndex, 'utf-8')
      const index: SessionsIndex = JSON.parse(raw) as SessionsIndex
      const entries = Object.values(index)
      if (entries.length === 0) return null

      entries.sort((a, b) => b.updatedAt - a.updatedAt)
      const latest = entries[0]

      // sessionFile may be a relative filename or absolute path
      const filePath = resolve(sessionsDir, latest.sessionFile)
      if (!existsSync(filePath)) return null

      return filePath
    } catch {
      return null
    }
  }

  // ── WebSocket server ───────────────────────────────────────────────────────

  const verifyClient: VerifyClientCallbackAsync = ({ origin }, callback) => {
    if (isOriginAllowed(origin, allowedOrigins)) {
      callback(true)
      return
    }
    console.warn(
      `[bridge] Rejected connection from origin ${JSON.stringify(origin)}`,
    )
    callback(false, 403, 'Forbidden')
  }

  const wss = new WebSocketServer({ port: options.port, host, verifyClient })

  function broadcast(data: string): void {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    }
  }

  // ── File watching ──────────────────────────────────────────────────────────

  function processFileChanges(filePath: string): void {
    let newSize: number
    try {
      const stat = statSync(filePath)
      newSize = stat.size
    } catch {
      return
    }

    // Handle file truncation (e.g. user clears file, OpenClaw rewrites it)
    if (newSize < fileSize) {
      console.log('[bridge] File truncated, resetting offset')
      fileSize = newSize
      trailingPartial = ''
      return
    }

    if (newSize === fileSize) return

    // Read only the newly appended bytes, with try/finally to prevent fd leak
    const fd = openSync(filePath, 'r')
    let buf: Buffer
    try {
      buf = Buffer.alloc(newSize - fileSize)
      readSync(fd, buf, 0, buf.length, fileSize)
    } finally {
      closeSync(fd)
    }

    fileSize = newSize

    // Prepend any trailing partial line from the previous read to handle
    // incomplete lines and multi-byte UTF-8 characters split across events
    const added = trailingPartial + buf.toString('utf-8')
    const lines = added.split('\n')

    // The last element may be an incomplete line — save it for next time
    trailingPartial = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.length === 0) continue
      try {
        // Validate it's JSON before broadcasting
        JSON.parse(trimmed)
        broadcast(trimmed)
      } catch {
        console.warn('[bridge] Skipping malformed line:', trimmed.slice(0, 120))
      }
    }
  }

  function watchSession(filePath: string): void {
    // Clean up previous watcher, poll timer, and debounce timer
    if (currentWatcher) {
      currentWatcher.close()
      currentWatcher = null
    }
    if (filePollTimer) {
      clearInterval(filePollTimer)
      filePollTimer = null
    }
    if (watchDebounceTimer) {
      clearTimeout(watchDebounceTimer)
      watchDebounceTimer = null
    }

    currentSessionFile = filePath
    trailingPartial = '' // reset partial buffer on session switch

    // Get current file size so we only broadcast *new* lines
    try {
      const stat = statSync(filePath)
      fileSize = stat.size
    } catch {
      fileSize = 0
    }

    console.log(`[bridge] Watching session: ${filePath}`)

    // Notify clients of session switch
    broadcast(
      JSON.stringify({
        _bridge: true,
        type: 'session_switch',
        file: filePath,
      }),
    )

    // Primary: fs.watch for instant notifications
    try {
      currentWatcher = watch(filePath, (eventType) => {
        if (eventType !== 'change') return

        // Debounce: macOS FSEvents may fire duplicate change events.
        if (watchDebounceTimer) clearTimeout(watchDebounceTimer)
        watchDebounceTimer = setTimeout(() => {
          watchDebounceTimer = null
          processFileChanges(filePath)
        }, WATCH_DEBOUNCE_MS)
      })
    } catch (e) {
      console.warn('[bridge] fs.watch failed, relying on polling:', e)
    }

    // Fallback: poll file size every 500ms (fs.watch is unreliable on some macOS setups)
    filePollTimer = setInterval(() => {
      processFileChanges(filePath)
    }, FILE_POLL_INTERVAL_MS)
  }

  // ── Session check loop ─────────────────────────────────────────────────────

  function checkForSessionChange(): void {
    const latest = findLatestSession()
    if (latest && latest !== currentSessionFile) {
      console.log(`[bridge] Session switch detected → ${latest}`)
      watchSession(latest)
    }
  }

  // ── sessions.json file watcher ─────────────────────────────────────────────

  function startSessionsIndexWatcher(): void {
    if (sessionsIndexWatcher) {
      sessionsIndexWatcher.close()
      sessionsIndexWatcher = null
    }

    // Watch the directory containing sessions.json (more reliable than watching the file)
    const dir = dirname(sessionsIndex)
    if (!existsSync(dir)) return

    try {
      sessionsIndexWatcher = watch(dir, (_eventType, filename) => {
        // Only react to changes to sessions.json
        if (filename !== 'sessions.json') return

        // Debounce — sessions.json may be written in bursts
        if (sessionsIndexDebounceTimer) clearTimeout(sessionsIndexDebounceTimer)
        sessionsIndexDebounceTimer = setTimeout(() => {
          sessionsIndexDebounceTimer = null
          console.log(
            '[bridge] sessions.json changed — checking for new session',
          )
          checkForSessionChange()
        }, SESSIONS_INDEX_DEBOUNCE_MS)
      })
      console.log('[bridge] Watching sessions.json for changes')
    } catch (e) {
      console.warn('[bridge] Could not watch sessions dir:', e)
    }
  }

  // ── Client connection handling ─────────────────────────────────────────────

  wss.on('connection', (ws) => {
    console.log(`[bridge] Client connected (total: ${wss.clients.size})`)

    // Send current status to newly connected client
    ws.send(
      JSON.stringify({
        _bridge: true,
        type: 'status',
        watching: currentSessionFile,
        port,
      }),
    )

    // A misbehaving client (e.g. a malformed frame) must not crash the bridge;
    // ws closes the offending connection itself after emitting this.
    ws.on('error', (err) => {
      console.warn(`[bridge] Client error, disconnecting: ${err.message}`)
    })

    ws.on('close', () => {
      console.log(`[bridge] Client disconnected (total: ${wss.clients.size})`)
    })
  })

  // ── Startup ────────────────────────────────────────────────────────────────

  function startWatching(): void {
    const initial = findLatestSession()
    if (initial) {
      watchSession(initial)
    } else {
      console.log(
        '[bridge] No active session found. Waiting for sessions to appear...',
      )
    }

    // Watch sessions.json for immediate change detection
    startSessionsIndexWatcher()

    // Periodically check for new sessions (fallback in case fs.watch misses changes)
    sessionCheckTimer = setInterval(
      checkForSessionChange,
      SESSION_CHECK_INTERVAL_MS,
    )
  }

  // ── Shutdown ───────────────────────────────────────────────────────────────

  function close(): Promise<void> {
    if (sessionCheckTimer) clearInterval(sessionCheckTimer)
    if (filePollTimer) clearInterval(filePollTimer)
    if (watchDebounceTimer) clearTimeout(watchDebounceTimer)
    if (sessionsIndexDebounceTimer) clearTimeout(sessionsIndexDebounceTimer)
    if (currentWatcher) currentWatcher.close()
    if (sessionsIndexWatcher) sessionsIndexWatcher.close()
    for (const client of wss.clients) client.terminate()
    return new Promise((resolveClose) => wss.close(() => resolveClose()))
  }

  return new Promise((resolveStart, rejectStart) => {
    let listening = false

    wss.on('error', (err) => {
      if (!listening) {
        // Startup failure (e.g. EADDRINUSE): nothing else has started yet.
        rejectStart(err)
        return
      }
      console.error(`[bridge] Server error: ${err.message}`)
    })

    wss.once('listening', () => {
      listening = true
      port = (wss.address() as AddressInfo).port
      startWatching()
      resolveStart({ port, close })
    })
  })
}
