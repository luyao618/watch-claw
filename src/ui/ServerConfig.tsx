/**
 * ServerConfig — overlay panel to configure the Bridge Server WebSocket URL.
 *
 * On mobile / remote clients the user needs to point to the desktop machine's
 * LAN IP instead of the default 127.0.0.1.  The chosen URL is persisted in
 * localStorage so it survives page reloads and PWA restarts.  The bridge must
 * also list this page's origin in BRIDGE_ALLOWED_ORIGINS (see bridge/README.md).
 */

import { useState, useCallback } from 'react'
import { BRIDGE_WS_URL } from '@/utils/constants.ts'
import { getSavedBridgeUrl, saveBridgeUrl } from '@/utils/bridgeUrl.ts'

// ── Component ────────────────────────────────────────────────────────────────

interface ServerConfigProps {
  /** Whether the Bridge Server is currently connected. */
  isConnected: boolean
  /** Called when the user confirms a new URL — parent should reconnect. */
  onUrlChange: (url: string) => void
  /** Close the config panel. */
  onClose: () => void
}

export default function ServerConfig({
  isConnected,
  onUrlChange,
  onClose,
}: ServerConfigProps) {
  const [url, setUrl] = useState(getSavedBridgeUrl)
  const [error, setError] = useState<string | null>(null)

  const handleConnect = useCallback(() => {
    const trimmed = url.trim()
    if (!trimmed) {
      setError('URL cannot be empty')
      return
    }
    // Strict validation via URL parser
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
        setError('URL must start with ws:// or wss://')
        return
      }
    } catch {
      setError('Invalid URL format')
      return
    }
    setError(null)
    saveBridgeUrl(trimmed)
    onUrlChange(trimmed)
  }, [url, onUrlChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleConnect()
      if (e.key === 'Escape') onClose()
    },
    [handleConnect, onClose],
  )

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
      }}
      onClick={(e) => {
        // Close when clicking the backdrop (not the panel itself)
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          background: '#1e1e3a',
          border: '1px solid #3a3a5a',
          borderRadius: '8px',
          padding: '20px',
          width: '90%',
          maxWidth: '400px',
          fontFamily: 'monospace',
          color: '#c0c0d0',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
            Bridge Server
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px 8px',
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            x
          </button>
        </div>

        {/* Status */}
        <div style={{ marginBottom: '12px', fontSize: '12px' }}>
          Status:{' '}
          <span style={{ color: isConnected ? '#22c55e' : '#ef4444' }}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* URL Input */}
        <label
          style={{
            display: 'block',
            fontSize: '11px',
            color: '#888',
            marginBottom: '6px',
          }}
        >
          WebSocket URL
        </label>
        <input
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setError(null)
          }}
          onKeyDown={handleKeyDown}
          placeholder="ws://192.168.1.100:18790"
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: '13px',
            fontFamily: 'monospace',
            backgroundColor: '#12121f',
            border: '1px solid #3a3a5a',
            borderRadius: '4px',
            color: '#e0e0e0',
            outline: 'none',
            boxSizing: 'border-box',
            minHeight: '44px',
          }}
        />

        {error && (
          <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '6px' }}>
            {error}
          </div>
        )}

        {/* Hint */}
        <div
          style={{
            fontSize: '10px',
            color: '#666',
            marginTop: '8px',
            lineHeight: 1.5,
          }}
        >
          On mobile, enter your desktop's LAN IP, e.g.{' '}
          <span style={{ color: '#888' }}>ws://192.168.1.x:18790</span>, and
          start the bridge with{' '}
          <span style={{ color: '#888' }}>
            BRIDGE_ALLOWED_ORIGINS={window.location.origin}
          </span>
        </div>

        {/* Connect button */}
        <button
          onClick={handleConnect}
          style={{
            marginTop: '16px',
            width: '100%',
            padding: '10px',
            fontSize: '13px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            backgroundColor: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            minHeight: '44px',
          }}
        >
          Connect
        </button>

        {/* Reset to default — saves and reconnects immediately */}
        <button
          onClick={() => {
            setError(null)
            saveBridgeUrl(BRIDGE_WS_URL)
            onUrlChange(BRIDGE_WS_URL)
          }}
          style={{
            marginTop: '8px',
            width: '100%',
            padding: '8px',
            fontSize: '11px',
            fontFamily: 'monospace',
            backgroundColor: 'transparent',
            color: '#666',
            border: '1px solid #333',
            borderRadius: '4px',
            cursor: 'pointer',
            minHeight: '44px',
          }}
        >
          Reset to default ({BRIDGE_WS_URL})
        </button>
      </div>
    </div>
  )
}
