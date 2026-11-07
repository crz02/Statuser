import React, { useCallback, useEffect, useState } from 'react'

interface HostProps {
  onToast: (type: 'success' | 'error', message: string) => void
}

interface ServerStatus {
  running: boolean
  port: number
  url: string
  hostAddress: string
  canManage: boolean
  canStop: boolean
}

export default function Host({ onToast }: HostProps) {
  const [server, setServer] = useState<ServerStatus>({
    running: false,
    port: 8080,
    url: 'http://localhost:8080',
    hostAddress: '127.0.0.1',
    canManage: false,
    canStop: false
  })
  const [localIp, setLocalIp] = useState('')
  const [deviceCount, setDeviceCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const [status, config] = await Promise.all([window.api.getServerStatus(), window.api.getConfig()])
      setServer(status)
      setLocalIp(status.hostAddress)

      if (status.running) {
        const response = await window.api.fetchDevices(status.url, config.userId)
        if (response.success) {
          setDeviceCount(response.devices?.filter((device: { is_online?: boolean }) => device.is_online).length || 0)
        } else {
          setDeviceCount(null)
        }
      } else {
        setDeviceCount(null)
      }
      setError((current) => current.startsWith('Could not check') ? '' : current)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check the host status.')
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const interval = setInterval(() => void refresh(), 5000)
    return () => clearInterval(interval)
  }, [refresh])

  const connectionUrl = `http://${localIp || 'localhost'}:${server.port}`
  const hasLanAddress = server.hostAddress !== '127.0.0.1'

  const handleStart = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await window.api.startServer()
      if (!result.success) {
        setError(result.message)
        onToast('error', result.message)
        return
      }

      try {
        await window.api.triggerReport()
      } catch {
        // Hosting can still be useful even if this device cannot report yet.
      }
      await refresh()
      onToast('success', 'Dashboard is available on this Mac.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start the dashboard host.'
      setError(message)
      onToast('error', message)
    } finally {
      setBusy(false)
    }
  }

  const handleStop = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await window.api.stopServer()
      if (!result.success) {
        setError(result.message)
        onToast('error', result.message)
        return
      }
      await refresh()
      onToast('success', 'Dashboard hosting stopped.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not stop the dashboard host.'
      setError(message)
      onToast('error', message)
    } finally {
      setBusy(false)
    }
  }

  const handleCopyAddress = async () => {
    try {
      await window.api.copyClipboard(connectionUrl)
      onToast('success', 'Host address copied.')
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Could not copy the host address.')
    }
  }

  const handleOpenDashboard = async () => {
    try {
      await window.api.openExternal(`${server.url.replace(/\/+$/, '')}/dashboard`)
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Could not open the web dashboard.')
    }
  }

  return (
    <div className="host-page">
      <header className="host-page-header">
        <div>
          <span className="host-eyebrow">YOUR PRIVATE DEVICE HUB</span>
          <h1 className="page-title">Host dashboard</h1>
          <p className="page-subtitle">Keep your dashboard on this Mac and connect your devices over your local network.</p>
        </div>
        <span className={`host-state ${server.running ? 'is-running' : 'is-stopped'}`}>
          <span className="host-state-dot" />
          {server.running ? 'Hosting' : 'Not hosting'}
        </span>
      </header>

      <section className={`host-hero ${server.running ? 'is-running' : ''}`}>
        <div className="host-hero-glow" aria-hidden="true" />
        <div className="host-hero-content">
          <div className="host-hero-icon" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <rect x="4" y="5" width="24" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
              <path d="M11 27h10M16 21v6M9 11h14M9 15h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="23" cy="16" r="2" fill="currentColor" />
            </svg>
          </div>
          <div className="host-hero-copy">
            <span className="host-eyebrow">{server.running ? 'HOST IS READY' : 'START WITH THIS MAC'}</span>
            <h2>{server.running ? 'Your dashboard is online.' : 'Make this Mac your host.'}</h2>
            <p>
              {server.running
                ? 'Your dashboard is available to devices on the same trusted Wi-Fi network.'
                : 'Start the dashboard here, then connect phones and computers on the same Wi-Fi.'}
            </p>
          </div>
          <button
            className={`host-primary-button ${server.running ? 'host-stop-button' : ''}`}
            onClick={server.running && server.canStop ? handleStop : handleStart}
            disabled={busy || (server.running ? !server.canStop : !server.canManage)}
          >
            {busy ? 'Please wait…' : server.running ? server.canStop ? 'Stop hosting' : 'Host is already running' : 'Start hosting'}
          </button>
        </div>
        {error && <div className="host-error" role="alert">{error}</div>}
        {server.running && !server.canStop && (
          <div className="host-connection-note" role="status">
            This dashboard is running outside this app, so Statuser cannot stop that process.
          </div>
        )}
        {!server.running && !server.canManage && !error && (
          <div className="host-error" role="status">
            Host files are unavailable in this app build. Reinstall the desktop app or run it from the project checkout.
          </div>
        )}
        {!server.running && server.canManage && (
          <div className="host-runtime-note">
            This build still requires Python 3 on the host Mac. Bundling the server runtime into the installer is a remaining step.
          </div>
        )}
      </section>

      <div className="host-overview-grid">
        <section className="host-panel host-connection-panel">
          <div className="host-panel-heading">
            <div>
              <span className="host-eyebrow">CONNECT A DEVICE</span>
              <h2>Join this dashboard</h2>
            </div>
            <span className="host-panel-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <rect x="7" y="2.5" width="10" height="19" rx="2" stroke="currentColor" strokeWidth="1.7" />
                <path d="M11 18.5h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </span>
          </div>
          <p className="host-panel-description">On each device, open Statuser Settings and enter this address as the Dashboard URL.</p>
          <div className="host-address-row">
            <code>{connectionUrl}</code>
            <button type="button" className="host-copy-button" onClick={handleCopyAddress} aria-label="Copy host address" disabled={!server.running || !hasLanAddress}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              Copy
            </button>
          </div>
          <div className="host-connection-note">
            <span className="host-note-dot" />
            {server.running
              ? hasLanAddress ? 'Make sure your devices are on the same Wi-Fi network.' : 'Join a private Wi-Fi network to connect other devices.'
              : 'Start hosting to enable device connections.'}
          </div>
        </section>

        <section className="host-panel host-status-panel">
          <div className="host-panel-heading">
            <div>
              <span className="host-eyebrow">HOST OVERVIEW</span>
              <h2>At a glance</h2>
            </div>
            <button type="button" className="host-refresh-button" onClick={() => void refresh()} aria-label="Refresh host status" disabled={refreshing}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 7v5h-5M4 17v-5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <div className="host-stat-list">
            <div className="host-stat-row">
              <span>Host status</span>
              <strong className={server.running ? 'host-stat-online' : ''}>{server.running ? 'Online' : 'Stopped'}</strong>
            </div>
            <div className="host-stat-row">
              <span>Devices online</span>
              <strong>{deviceCount === null ? '—' : deviceCount}</strong>
            </div>
            <div className="host-stat-row">
              <span>Network</span>
              <strong>{localIp || 'Checking…'}</strong>
            </div>
            <div className="host-stat-row">
              <span>Access</span>
              <strong>{hasLanAddress ? 'Local network' : 'This Mac only'}</strong>
            </div>
          </div>
          {server.running && (
            <button type="button" className="host-open-button" onClick={handleOpenDashboard}>
              Open web dashboard <span aria-hidden="true">↗</span>
            </button>
          )}
        </section>
      </div>

      <aside className="host-security-note">
        <span className="host-security-icon" aria-hidden="true">i</span>
        <p><strong>Use a trusted network.</strong> Device pairing and access controls are not yet available; anyone who can reach this host may be able to view its dashboard. Keep hosting on a trusted local network and do not expose it to the public internet.</p>
      </aside>
    </div>
  )
}
