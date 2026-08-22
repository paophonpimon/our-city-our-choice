/**
 * TEMPORARY DIAGNOSTIC — compact collapsible debug overlay.
 * Rendered only when the debug session flag is active (set by ?debug=1).
 * Invisible to normal users. Zero Firebase reads/writes, zero polling.
 * Do NOT commit, push, or deploy with this file beyond local diagnosis.
 */

import { useEffect, useRef, useState } from 'react'
import {
  subscribeDebugEvents,
  isDebugMode,
  disableDebugMode,
  type DebugEvent,
  type DebugActor,
} from './useDebugLog'

const ACTOR_COLOR: Record<DebugActor, string> = {
  teacher: '#f4c96d',
  student: '#8fc4c5',
  hook: '#a78bfa',
}

const ACTOR_LABEL: Record<DebugActor, string> = {
  teacher: 'TCH',
  student: 'STU',
  hook: 'HOK',
}

const fmt = (ts: number): string => {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

export const DebugOverlay = (): React.ReactElement | null => {
  // Track debug-active in React state so disabling it hides the overlay instantly.
  const [active, setActive] = useState(() => isDebugMode())
  const [events, setEvents] = useState<DebugEvent[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) return undefined
    return subscribeDebugEvents(setEvents)
  }, [active])

  if (!active) return null

  const handleDisable = (): void => {
    disableDebugMode()
    setActive(false)
  }

  return (
    <div
      aria-label="Debug overlay"
      style={{
        position: 'fixed',
        bottom: 8,
        right: 8,
        zIndex: 99999,
        width: collapsed ? 80 : 360,
        maxHeight: collapsed ? 36 : 460,
        background: 'rgba(5,11,20,0.93)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 10,
        fontFamily: 'monospace',
        fontSize: 11,
        color: '#e2e8f0',
        boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        overflow: 'hidden',
        transition: 'width 0.2s, max-height 0.2s',
        userSelect: 'text',
      }}
    >
      {/* Header — tap to collapse/expand */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          background: 'rgba(255,255,255,0.06)',
          borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.08)',
          cursor: 'pointer',
          gap: 4,
        }}
        onClick={() => setCollapsed((v) => !v)}
        title={collapsed ? 'Expand debug overlay' : 'Collapse debug overlay'}
      >
        <span style={{ color: '#a78bfa', fontWeight: 700 }}>🔍 DBG</span>
        {!collapsed && (
          <span style={{ color: '#64748b', flexGrow: 1, paddingLeft: 4 }}>
            {events.length} events
          </span>
        )}
        <span style={{ color: '#64748b', fontSize: 10 }}>{collapsed ? '▲' : '▼'}</span>
      </div>

      {/* Legend + disable button */}
      {!collapsed && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '3px 8px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {(['teacher', 'student', 'hook'] as DebugActor[]).map((a) => (
            <span key={a} style={{ color: ACTOR_COLOR[a] }}>
              ■ {ACTOR_LABEL[a]}
            </span>
          ))}
          <button
            onClick={(e) => { e.stopPropagation(); handleDisable() }}
            style={{
              marginLeft: 'auto',
              padding: '1px 6px',
              background: 'rgba(239,68,68,0.18)',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 4,
              color: '#fca5a5',
              cursor: 'pointer',
              fontSize: 10,
              lineHeight: 1.6,
              userSelect: 'none',
            }}
            title="Clear debug session flag and hide overlay"
            type="button"
          >
            ปิด Debug
          </button>
        </div>
      )}

      {/* Event list */}
      {!collapsed && (
        <div
          ref={listRef}
          style={{
            overflowY: 'auto',
            maxHeight: 370,
            padding: '2px 0',
          }}
        >
          {events.length === 0 && (
            <div style={{ color: '#475569', padding: '6px 10px' }}>Waiting for events…</div>
          )}
          {events.map((evt) => (
            <div
              key={evt.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '75px 28px 1fr',
                gap: '0 5px',
                padding: '2px 8px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                lineHeight: 1.5,
              }}
            >
              <span style={{ color: '#475569', fontSize: 10 }}>{fmt(evt.ts)}</span>
              <span style={{ color: ACTOR_COLOR[evt.actor], fontWeight: 700 }}>
                {ACTOR_LABEL[evt.actor]}
              </span>
              <span style={{ color: '#e2e8f0', wordBreak: 'break-all' }}>
                {evt.label}
                {evt.value !== undefined && (
                  <span style={{ color: '#94a3b8' }}> = {evt.value}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
