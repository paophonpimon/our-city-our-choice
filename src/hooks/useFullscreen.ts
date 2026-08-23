import { useCallback, useEffect, useState } from 'react'

/** The slice of the DOM `Document` interface this hook actually needs - kept narrow so tests can pass a plain stub without a DOM/jsdom environment. */
export interface FullscreenCapableDocument {
  fullscreenElement: Element | null
  documentElement: { requestFullscreen?: () => Promise<void> }
  exitFullscreen?: () => Promise<void>
  addEventListener: (type: 'fullscreenchange', listener: () => void) => void
  removeEventListener: (type: 'fullscreenchange', listener: () => void) => void
}

/**
 * Feature-detects the standard Fullscreen API via a plain property check
 * rather than sniffing the user agent. iPhone Safari genuinely does not
 * expose `Element.requestFullscreen` for arbitrary elements (only iPadOS
 * Safari and desktop browsers do), so this naturally resolves to `false`
 * there with no platform-specific branching required.
 */
export const isFullscreenSupported = (doc: FullscreenCapableDocument): boolean =>
  typeof doc.documentElement.requestFullscreen === 'function'

/**
 * Decides which native call a toggle should make (enter vs exit vs a safe
 * no-op when unsupported) and makes it. Exported separately from the hook so
 * this decision is directly testable against a stub document.
 */
export const requestFullscreenToggle = async (doc: FullscreenCapableDocument): Promise<void> => {
  if (!isFullscreenSupported(doc)) return
  if (doc.fullscreenElement) await doc.exitFullscreen?.()
  else await doc.documentElement.requestFullscreen?.()
}

const getDocument = (): FullscreenCapableDocument | null =>
  typeof document === 'undefined' ? null : (document as unknown as FullscreenCapableDocument)

export interface UseFullscreenResult {
  /** True only while the browser reports an active fullscreen element - always kept in sync with the native `fullscreenchange` event, never assumed from the last toggle call. */
  isFullscreen: boolean
  /** False when the Fullscreen API is unavailable (notably iPhone Safari) - callers should show an explanation instead of a non-functional control. */
  isSupported: boolean
  /** Enters fullscreen if not already in it, exits if already in it. Must be called from a user gesture (e.g. a click handler) - browsers reject fullscreen requests otherwise. Never called automatically by this hook. */
  toggle: () => Promise<void>
}

/**
 * Thin wrapper around the browser Fullscreen API for the whole document.
 * Reusable by both the teacher and student pages so fullscreen logic exists
 * in exactly one place.
 */
export const useFullscreen = (): UseFullscreenResult => {
  const [isFullscreen, setIsFullscreen] = useState(() => {
    const doc = getDocument()
    return doc !== null && doc.fullscreenElement !== null
  })

  useEffect(() => {
    const doc = getDocument()
    if (!doc) return
    const handleFullscreenChange = (): void => setIsFullscreen(doc.fullscreenElement !== null)
    doc.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => doc.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggle = useCallback(async (): Promise<void> => {
    const doc = getDocument()
    if (!doc) return
    try {
      await requestFullscreenToggle(doc)
    } catch {
      // Rejected (e.g. missing user-gesture context, or a platform
      // restriction) - fullscreenchange simply never fires, so `isFullscreen`
      // naturally stays in sync with reality without any extra handling here.
    }
  }, [])

  const doc = getDocument()
  const isSupported = doc !== null && isFullscreenSupported(doc)

  return { isFullscreen, isSupported, toggle }
}
