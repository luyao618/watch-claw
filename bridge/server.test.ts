/**
 * Integration tests for the Bridge Server entry point. Each test spawns
 * `bridge/server.ts` as a real process so crashes and exit codes are observable.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, connect, type Server } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { WebSocket } from 'ws'

const ROOT = resolve(import.meta.dirname, '..')
const TSX_BIN = resolve(ROOT, 'node_modules/.bin/tsx')
const SERVER_ENTRY = resolve(ROOT, 'bridge/server.ts')

// ── Helpers ─────────────────────────────────────────────────────────────────

interface BridgeProcess {
  child: ChildProcess
  port: number
  stderr: () => string
  exited: Promise<number | null>
}

const cleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn()
})

function getFreePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer()
    srv.once('error', rej)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number }
      srv.close(() => res(port))
    })
  })
}

async function spawnBridge(
  env: Record<string, string> = {},
  port?: number,
): Promise<BridgeProcess> {
  const sessionsDir = mkdtempSync(join(tmpdir(), 'watch-claw-bridge-'))
  cleanups.push(() => rmSync(sessionsDir, { recursive: true, force: true }))
  const bridgePort = port ?? (await getFreePort())

  const child = spawn(TSX_BIN, [SERVER_ENTRY], {
    cwd: ROOT,
    env: {
      ...process.env,
      BRIDGE_HOST: '127.0.0.1',
      BRIDGE_PORT: String(bridgePort),
      OPENCLAW_SESSIONS_DIR: sessionsDir,
      BRIDGE_ALLOWED_ORIGINS: '',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))
  child.stdout?.resume()
  const exited = new Promise<number | null>((res) =>
    child.once('exit', (code) => res(code)),
  )
  cleanups.push(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await exited
    }
  })
  return { child, port: bridgePort, stderr: () => stderr, exited }
}

type ConnectResult =
  | { ok: true; ws: WebSocket; firstMessage: string }
  | { ok: false; status: number }

function tryConnect(
  port: number,
  opts: { origin?: string; host?: string } = {},
): Promise<ConnectResult> {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
      origin: opts.origin,
      headers: opts.host ? { host: opts.host } : undefined,
    })
    ws.once('message', (data) => {
      cleanups.push(() => ws.terminate())
      res({ ok: true, ws, firstMessage: String(data) })
    })
    ws.once('unexpected-response', (_req, response) => {
      res({ ok: false, status: response.statusCode ?? 0 })
      ws.terminate()
    })
    ws.once('error', rej)
  })
}

async function startBridge(
  env: Record<string, string> = {},
): Promise<BridgeProcess> {
  const bridge = await spawnBridge(env)
  const deadline = Date.now() + 10_000
  for (;;) {
    try {
      const result = await tryConnect(bridge.port)
      if (result.ok) {
        result.ws.terminate()
        return bridge
      }
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline || bridge.child.exitCode !== null) {
      throw new Error(`Bridge did not start. stderr:\n${bridge.stderr()}`)
    }
    await new Promise((r) => setTimeout(r, 100))
  }
}

/** Perform a raw WebSocket handshake so we can write arbitrary bytes after it. */
function rawUpgrade(port: number): Promise<import('node:net').Socket> {
  return new Promise((res, rej) => {
    const socket = connect(port, '127.0.0.1')
    cleanups.push(() => void socket.destroy())
    socket.once('error', rej)
    socket.once('connect', () => {
      socket.write(
        [
          'GET / HTTP/1.1',
          `Host: 127.0.0.1:${port}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}`,
          'Sec-WebSocket-Version: 13',
          '',
          '',
        ].join('\r\n'),
      )
    })
    let head = ''
    const onData = (d: Buffer): void => {
      head += d.toString('latin1')
      if (!head.includes('\r\n\r\n')) return
      socket.off('data', onData)
      if (!head.startsWith('HTTP/1.1 101')) {
        rej(new Error(`Upgrade failed: ${head.split('\r\n')[0]}`))
      } else {
        res(socket)
      }
    }
    socket.on('data', onData)
  })
}

function waitFor<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`Timed out waiting for ${what}`)), ms),
    ),
  ])
}

// ── Origin checks ───────────────────────────────────────────────────────────

describe('bridge origin checks', () => {
  it('rejects foreign browser origins', async () => {
    const { port } = await startBridge()
    for (const origin of [
      'https://evil.example',
      'http://localhost.evil.example',
      'http://127.0.0.1.evil.example:18790',
      'null',
    ]) {
      const result = await tryConnect(port, { origin })
      expect(result, origin).toEqual({ ok: false, status: 403 })
    }
  })

  it('accepts no-Origin, file://, localhost and 127.0.0.1 clients', async () => {
    const { port } = await startBridge()
    for (const origin of [
      undefined,
      'file://',
      'http://localhost:5173',
      'https://localhost',
      'http://127.0.0.1:4173',
      'http://[::1]:5173',
    ]) {
      const result = await tryConnect(port, { origin })
      expect(result.ok, String(origin)).toBe(true)
      if (result.ok) {
        expect(JSON.parse(result.firstMessage)).toMatchObject({
          _bridge: true,
          type: 'status',
        })
      }
    }
  })

  it('adds exact origins from BRIDGE_ALLOWED_ORIGINS without trusting Host', async () => {
    const { port } = await startBridge({
      BRIDGE_ALLOWED_ORIGINS:
        ' http://192.168.1.20:5173 , https://watch.example.test ,',
    })

    for (const origin of [
      'http://192.168.1.20:5173',
      'https://watch.example.test',
    ]) {
      expect((await tryConnect(port, { origin })).ok, origin).toBe(true)
    }

    // Not exact matches → rejected
    for (const origin of [
      'http://192.168.1.20:4173',
      'https://192.168.1.20:5173',
      'http://watch.example.test',
      'https://sub.watch.example.test',
    ]) {
      expect(await tryConnect(port, { origin }), origin).toEqual({
        ok: false,
        status: 403,
      })
    }

    // DNS rebinding: Origin and Host both point at the attacker's name
    expect(
      await tryConnect(port, {
        origin: `http://rebind.evil.example:${port}`,
        host: `rebind.evil.example:${port}`,
      }),
    ).toEqual({ ok: false, status: 403 })
    expect(
      await tryConnect(port, {
        origin: 'http://192.168.1.99:5173',
        host: `192.168.1.99:${port}`,
      }),
    ).toEqual({ ok: false, status: 403 })
  })
})

// ── Reliability ─────────────────────────────────────────────────────────────

describe('bridge reliability', () => {
  it('disconnects only the client that sends a malformed frame', async () => {
    const bridge = await startBridge()

    const bystander = await tryConnect(bridge.port)
    expect(bystander.ok).toBe(true)
    if (!bystander.ok) return

    const bad = await rawUpgrade(bridge.port)
    const badClosed = new Promise<void>((r) => bad.once('close', () => r()))
    // Unmasked client→server text frame: a protocol violation (RFC 6455 §5.1)
    bad.write(Buffer.from([0x81, 0x02, 0x68, 0x69]))
    await waitFor(badClosed, 5_000, 'malformed client to be disconnected')

    // Give a crash (if any) time to surface
    await new Promise((r) => setTimeout(r, 300))
    expect(bridge.child.exitCode).toBeNull()
    expect(bystander.ws.readyState).toBe(WebSocket.OPEN)

    const fresh = await tryConnect(bridge.port)
    expect(fresh.ok).toBe(true)
  })

  it('exits with one clear error and nonzero status when the port is busy', async () => {
    const port = await getFreePort()
    const blocker: Server = createServer()
    await new Promise<void>((r) => blocker.listen(port, '127.0.0.1', r))
    cleanups.push(() => new Promise<void>((r) => blocker.close(() => r())))

    const bridge = await spawnBridge({}, port)
    const code = await waitFor(bridge.exited, 10_000, 'bridge to exit')

    expect(code).not.toBe(0)
    expect(code).not.toBeNull()
    const lines = bridge
      .stderr()
      .split('\n')
      .filter((l) => l.trim().length > 0)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/port .*already in use/i)
    expect(lines[0]).toContain(String(port))
  })
})
