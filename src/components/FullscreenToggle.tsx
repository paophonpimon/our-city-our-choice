import { useFullscreen } from '../hooks/useFullscreen'

interface FullscreenToggleProps {
  /** Extra class applied to whichever element renders (the button, or the unsupported-device message) so callers can match their own surrounding UI. */
  className?: string
}

/**
 * "⛶ เต็มหน้าจอ" control shared by the teacher and student gameplay pages.
 * Renders a real toggle button backed by the browser Fullscreen API when
 * supported, or a small non-blocking Thai explanation when it isn't
 * (notably iPhone Safari) - never a button that silently does nothing.
 */
export const FullscreenToggle = ({ className = '' }: FullscreenToggleProps) => {
  const { isFullscreen, isSupported, toggle } = useFullscreen()

  if (!isSupported) {
    return (
      <p className={`fullscreen-toggle-unsupported ${className}`.trim()} role="note">
        อุปกรณ์นี้ไม่รองรับโหมดเต็มหน้าจอ กรุณาซ่อนแถบที่อยู่เว็บของเบราว์เซอร์แทน
      </p>
    )
  }

  return (
    <button
      aria-label={isFullscreen ? 'ออกจากโหมดเต็มหน้าจอ' : 'เข้าสู่โหมดเต็มหน้าจอ'}
      aria-pressed={isFullscreen}
      className={`fullscreen-toggle-button ${className}`.trim()}
      onClick={() => void toggle()}
      title={isFullscreen ? 'ออกจากโหมดเต็มหน้าจอ' : 'เข้าสู่โหมดเต็มหน้าจอ'}
      type="button"
    >
      <span aria-hidden="true">⛶</span> {isFullscreen ? 'ออกเต็มหน้าจอ' : 'เต็มหน้าจอ'}
    </button>
  )
}
