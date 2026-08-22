import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'

export type TeacherSoundtrackMode = 'off' | 'lobby' | 'game'

export interface TeacherSoundtrackHandle {
  playLobby: () => void
  playGame: () => void
  stop: () => void
}

interface TeacherSoundtrackProps {
  mode: TeacherSoundtrackMode
}

const TRACKS: Record<Exclude<TeacherSoundtrackMode, 'off'>, string> = {
  lobby: '/audio/bgm-teacher-lobby.mp3',
  game: '/audio/bgm-teacher-gameplay.mp3',
}

const VOLUME_KEY = 'our_city_teacher_audio_volume_v1'
const MUTED_KEY = 'our_city_teacher_audio_muted_v1'
const POSITION_KEY = 'our_city_teacher_audio_position_v1'
const DEFAULT_VOLUME = 0.45
const VOLUME_STEP = 0.1

const clampVolume = (value: number): number => Math.min(1, Math.max(0, value))

const readStoredVolume = (): number => {
  if (typeof window === 'undefined') return DEFAULT_VOLUME
  const rawVolume = window.localStorage.getItem(VOLUME_KEY)
  if (rawVolume === null) return DEFAULT_VOLUME
  const stored = Number(rawVolume)
  return Number.isFinite(stored) ? clampVolume(stored) : DEFAULT_VOLUME
}

const readStoredMuted = (): boolean =>
  typeof window !== 'undefined' && window.localStorage.getItem(MUTED_KEY) === 'true'

interface TeacherAudioPosition {
  x: number
  y: number
}

const readStoredPosition = (): TeacherAudioPosition | null => {
  if (typeof window === 'undefined') return null
  try {
    const parsed = JSON.parse(window.localStorage.getItem(POSITION_KEY) ?? 'null') as Partial<TeacherAudioPosition> | null
    return parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)
      ? { x: Number(parsed.x), y: Number(parsed.y) }
      : null
  } catch {
    return null
  }
}

export const TeacherSoundtrack = forwardRef<TeacherSoundtrackHandle, TeacherSoundtrackProps>(
  ({ mode }, forwardedRef) => {
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const controlsRef = useRef<HTMLElement | null>(null)
    const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
    const activeModeRef = useRef<TeacherSoundtrackMode>('off')
    const [volume, setVolume] = useState(readStoredVolume)
    const [muted, setMuted] = useState(readStoredMuted)
    const [activeMode, setActiveMode] = useState<TeacherSoundtrackMode>('off')
    const [needsInteraction, setNeedsInteraction] = useState(false)
    const [position, setPosition] = useState<TeacherAudioPosition | null>(readStoredPosition)

    const switchTrack = useCallback((nextMode: TeacherSoundtrackMode): void => {
      const audio = audioRef.current
      if (!audio) return

      if (nextMode === 'off') {
        audio.pause()
        audio.currentTime = 0
        activeModeRef.current = 'off'
        setActiveMode('off')
        setNeedsInteraction(false)
        return
      }

      const nextSource = new URL(TRACKS[nextMode], window.location.origin).href
      if (audio.src !== nextSource) {
        audio.pause()
        audio.src = nextSource
        audio.currentTime = 0
        audio.load()
      }

      activeModeRef.current = nextMode
      setActiveMode(nextMode)
      if (audio.muted) return
      void audio.play()
        .then(() => setNeedsInteraction(false))
        .catch(() => setNeedsInteraction(true))
    }, [])

    useEffect(() => {
      const audio = new Audio()
      audio.loop = true
      audio.preload = 'metadata'
      audio.volume = volume
      audio.muted = muted
      audioRef.current = audio
      switchTrack(mode)

      return () => {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
        audioRef.current = null
      }
      // The audio element must be created only once for this teacher page.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
      switchTrack(mode)
    }, [mode, switchTrack])

    useEffect(() => {
      const audio = audioRef.current
      if (audio) audio.volume = volume
      window.localStorage.setItem(VOLUME_KEY, String(volume))
    }, [volume])

    useEffect(() => {
      const audio = audioRef.current
      if (audio) audio.muted = muted
      window.localStorage.setItem(MUTED_KEY, String(muted))
    }, [muted])

    useImperativeHandle(forwardedRef, () => ({
      playLobby: () => switchTrack('lobby'),
      playGame: () => switchTrack('game'),
      stop: () => switchTrack('off'),
    }), [switchTrack])

    const clampPosition = useCallback((next: TeacherAudioPosition): TeacherAudioPosition => {
      const controls = controlsRef.current
      const width = controls?.offsetWidth ?? 220
      const height = controls?.offsetHeight ?? 54
      return {
        x: Math.min(Math.max(8, next.x), Math.max(8, window.innerWidth - width - 8)),
        y: Math.min(Math.max(8, next.y), Math.max(8, window.innerHeight - height - 8)),
      }
    }, [])

    useEffect(() => {
      const keepInsideViewport = (): void => {
        setPosition((current) => current ? clampPosition(current) : current)
      }
      keepInsideViewport()
      window.addEventListener('resize', keepInsideViewport)
      return () => window.removeEventListener('resize', keepInsideViewport)
    }, [clampPosition])

    const beginDrag = (event: ReactPointerEvent<HTMLElement>): void => {
      if ((event.target as HTMLElement).closest('button')) return
      const rect = event.currentTarget.getBoundingClientRect()
      const origin = clampPosition({ x: rect.left, y: rect.top })
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: origin.x, originY: origin.y }
      setPosition(origin)
    }

    const moveDrag = (event: ReactPointerEvent<HTMLElement>): void => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      event.preventDefault()
      setPosition(clampPosition({
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      }))
    }

    const finishDrag = (event: ReactPointerEvent<HTMLElement>): void => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      dragRef.current = null
      setPosition((current) => {
        if (current) window.localStorage.setItem(POSITION_KEY, JSON.stringify(current))
        return current
      })
    }

    const resetPosition = (event: ReactMouseEvent<HTMLElement>): void => {
      if ((event.target as HTMLElement).closest('button')) return
      dragRef.current = null
      setPosition(null)
      window.localStorage.removeItem(POSITION_KEY)
    }

    const toggleMuted = (): void => {
      if (volume === 0) {
        setVolume(DEFAULT_VOLUME)
        setMuted(false)
        const audio = audioRef.current
        if (audio) {
          audio.volume = DEFAULT_VOLUME
          audio.muted = false
          if (activeModeRef.current !== 'off') {
            void audio.play()
              .then(() => setNeedsInteraction(false))
              .catch(() => setNeedsInteraction(true))
          }
        }
        return
      }
      const nextMuted = !muted
      setMuted(nextMuted)
      const audio = audioRef.current
      if (!audio) return
      audio.muted = nextMuted
      if (!nextMuted && activeModeRef.current !== 'off') {
        void audio.play()
          .then(() => setNeedsInteraction(false))
          .catch(() => setNeedsInteraction(true))
      }
    }

    const changeVolume = (delta: number): void => {
      const nextVolume = clampVolume(Number((volume + delta).toFixed(2)))
      setVolume(nextVolume)
      if (nextVolume > 0 && muted) {
        setMuted(false)
        const audio = audioRef.current
        if (audio) {
          audio.muted = false
          if (activeModeRef.current !== 'off') {
            void audio.play()
              .then(() => setNeedsInteraction(false))
              .catch(() => setNeedsInteraction(true))
          }
        }
      }
    }

    const percent = Math.round(volume * 100)
    const trackLabel = activeMode === 'game' ? 'เพลงระหว่างเกม' : activeMode === 'lobby' ? 'เพลงรอเข้าห้อง' : 'เสียงหน้าครู'

    return (
      <aside
        className={`teacher-audio-controls${dragRef.current ? ' is-dragging' : ''}`}
        aria-label="ควบคุมเสียงหน้าครู ลากเพื่อย้ายตำแหน่ง"
        onDoubleClick={resetPosition}
        onPointerCancel={finishDrag}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        ref={controlsRef}
        style={position ? { position: 'fixed', left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined}
        title="ลากเพื่อย้ายตำแหน่ง · ดับเบิลคลิกเพื่อคืนตำแหน่งเดิม"
      >
        <button
          aria-label={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
          className={muted ? 'is-muted' : ''}
          onClick={toggleMuted}
          title={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
          type="button"
        >
          <span aria-hidden="true">{muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}</span>
        </button>
        <div className="teacher-audio-controls__status">
          <strong>{trackLabel}</strong>
          <small>{needsInteraction ? 'แตะเปิดเสียงเพื่อเริ่มเพลง' : `${muted ? 'ปิดเสียง' : `${percent}%`}`}</small>
        </div>
        <button aria-label="ลดเสียง" disabled={volume <= 0} onClick={() => changeVolume(-VOLUME_STEP)} title="ลดเสียง" type="button">−</button>
        <span className="teacher-audio-controls__meter" aria-hidden="true"><i style={{ width: `${muted ? 0 : percent}%` }} /></span>
        <button aria-label="เพิ่มเสียง" disabled={volume >= 1} onClick={() => changeVolume(VOLUME_STEP)} title="เพิ่มเสียง" type="button">+</button>
      </aside>
    )
  },
)

TeacherSoundtrack.displayName = 'TeacherSoundtrack'
