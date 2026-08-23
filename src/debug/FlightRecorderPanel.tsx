/**
 * DIAGNOSTIC FLIGHT RECORDER PANEL — rendered only when ?debug=2 is active.
 * Mounted once, app-wide (see App.tsx), same pattern as DebugOverlay.
 * No debug UI at all when the flag is disabled - see the `active` check
 * below, mirroring DebugOverlay's early `if (!active) return null`.
 * Do NOT commit, push, or deploy with this active beyond local diagnosis.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  buildFlightReport,
  buildFlightTextSummary,
  clearFlightRecorder,
  disableFlightRecorder,
  getLastAction,
  installBrowserLifecycleRecorder,
  isFlightRecorderEnabled,
  isOnline,
  isPageVisible,
  subscribeFlightEvents,
  subscribeTeacherDiagnosticSnapshot,
  type FlightEvent,
  type TeacherDiagnosticSnapshot,
} from './flightRecorder'

const downloadJson = (filename: string, data: unknown): void => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const latestAnomalyLabel = (events: FlightEvent[]): string => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.actor === 'anomaly') return event.label
  }
  return 'none'
}

export const FlightRecorderPanel = (): React.ReactElement | null => {
  const [active, setActive] = useState(() => isFlightRecorderEnabled())
  const [events, setEvents] = useState<FlightEvent[]>([])
  const [snapshot, setSnapshot] = useState<TeacherDiagnosticSnapshot | null>(null)
  const [minimized, setMinimized] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const [online, setOnline] = useState(() => isOnline())
  const [visible, setVisible] = useState(() => isPageVisible())

  useEffect(() => {
    if (!active) return undefined
    const unsubscribeEvents = subscribeFlightEvents(setEvents)
    const unsubscribeSnapshot = subscribeTeacherDiagnosticSnapshot(setSnapshot)
    const uninstallLifecycle = installBrowserLifecycleRecorder()
    const onOnline = (): void => setOnline(true)
    const onOffline = (): void => setOnline(false)
    const onVisibility = (): void => setVisible(isPageVisible())
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      unsubscribeEvents()
      unsubscribeSnapshot()
      uninstallLifecycle()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active])

  const listenerAges = useMemo(() => {
    if (!snapshot?.roomId) return []
    const kinds = ['room', 'players', 'answers', 'rounds', 'crisisResults', 'preAssessments'] as const
    return kinds.map((kind) => {
      const lastEvent = [...events].reverse().find((event) => event.label === `SNAPSHOT_RECEIVED ${kind}` && event.roomId === snapshot.roomId)
      const ageMs = lastEvent ? Date.now() - lastEvent.ts : null
      return { kind, ageMs }
    })
  }, [events, snapshot?.roomId])

  if (!active) return null

  const lastAction = getLastAction()
  const latestAnomaly = latestAnomalyLabel(events)

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(buildFlightTextSummary())
      setCopyStatus('คัดลอกแล้ว')
    } catch {
      setCopyStatus('คัดลอกไม่สำเร็จ')
    }
    window.setTimeout(() => setCopyStatus(''), 2000)
  }

  const handleDownload = (): void => {
    downloadJson(`flight-report-${Date.now()}.json`, buildFlightReport())
  }

  const handleDisable = (): void => {
    disableFlightRecorder()
    setActive(false)
  }

  return (
    <div
      aria-label="Flight recorder panel"
      style={{
        position: 'fixed',
        bottom: 8,
        left: 8,
        zIndex: 99998,
        width: minimized ? 100 : 340,
        maxHeight: minimized ? 36 : 420,
        background: 'rgba(5,11,20,0.95)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 10,
        fontFamily: 'monospace',
        fontSize: 11,
        color: '#e2e8f0',
        boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
        overflow: 'hidden',
        transition: 'width 0.2s, max-height 0.2s',
        userSelect: 'text',
      }}
    >
      <div
        onClick={() => setMinimized((value) => !value)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 8px', background: 'rgba(255,255,255,0.06)',
          borderBottom: minimized ? 'none' : '1px solid rgba(255,255,255,0.08)',
          cursor: 'pointer', gap: 4,
        }}
        title={minimized ? 'Expand flight recorder' : 'Minimize flight recorder'}
      >
        <span style={{ color: '#60d394', fontWeight: 700 }}>🛩 FLT</span>
        {!minimized && <span style={{ color: '#64748b', flexGrow: 1, paddingLeft: 4 }}>{events.length} evt</span>}
        <span style={{ color: '#64748b', fontSize: 10 }}>{minimized ? '▲' : '▼'}</span>
      </div>

      {!minimized && (
        <div style={{ padding: '6px 8px', display: 'grid', gap: 3, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>ROOM <b style={{ color: '#f4c96d' }}>{snapshot?.roomId ?? '-'}</b> STATUS <b style={{ color: '#f4c96d' }}>{snapshot?.roomStatus ?? '-'}</b> Q <b>{snapshot?.questionNumber ?? '-'}</b></div>
          <div>NET <b style={{ color: online ? '#60d394' : '#fca5a5' }}>{online ? 'online' : 'offline'}</b> VIS <b style={{ color: visible ? '#60d394' : '#fca5a5' }}>{visible ? 'visible' : 'hidden'}</b></div>
          <div>ANSWERS <b>{snapshot?.answerCount ?? 0}/{snapshot?.lockedPlayerCount ?? 0}</b> CRISIS <b>{snapshot?.crisisAnswerCount ?? 0}/{snapshot?.lockedPlayerCount ?? 0}</b></div>
          <div>SNAPSHOT <b style={{ color: snapshot?.trustedSnapshotPresent ? '#60d394' : '#fca5a5' }}>{snapshot?.trustedSnapshotPresent ? 'yes' : 'no'}</b> ADVANCE <b style={{ color: snapshot?.canAdvanceQuestion ? '#60d394' : '#fca5a5' }}>{snapshot?.canAdvanceQuestion ? 'yes' : 'no'}</b></div>
          <div>LAST ACTION <b>{lastAction ? `${lastAction.action}:${lastAction.status}` : '-'}</b></div>
          <div>ANOMALY <b style={{ color: latestAnomaly === 'none' ? '#94a3b8' : '#fca5a5' }}>{latestAnomaly}</b></div>
          <div style={{ color: '#64748b' }}>
            {listenerAges.filter((entry) => entry.ageMs !== null).map((entry) => `${entry.kind}:${entry.ageMs}ms`).join(' ') || 'no listener ages yet'}
          </div>
        </div>
      )}

      {!minimized && (
        <div style={{ display: 'flex', gap: 4, padding: '5px 8px' }}>
          <button onClick={() => void handleCopy()} style={panelButtonStyle} type="button">COPY</button>
          <button onClick={handleDownload} style={panelButtonStyle} type="button">DOWNLOAD</button>
          <button onClick={clearFlightRecorder} style={panelButtonStyle} type="button">CLEAR</button>
          <button onClick={handleDisable} style={{ ...panelButtonStyle, marginLeft: 'auto', color: '#fca5a5' }} type="button">ปิด</button>
        </div>
      )}
      {!minimized && copyStatus && <div style={{ padding: '0 8px 6px', color: '#60d394' }}>{copyStatus}</div>}
    </div>
  )
}

const panelButtonStyle: React.CSSProperties = {
  padding: '2px 6px',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 4,
  color: '#e2e8f0',
  cursor: 'pointer',
  fontSize: 10,
}
