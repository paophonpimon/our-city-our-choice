import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { FullscreenToggle } from './FullscreenToggle'

/**
 * This project has no jsdom/DOM test environment configured, so component
 * tests use `renderToStaticMarkup` (as the rest of the codebase already
 * does) and a plain stub assigned to the global `document` - just enough
 * for the hook's render-time feature-detection and initial-state read to
 * see a realistic Document shape, without pulling in a new test dependency.
 */
const setStubDocument = (options: {
  supported: boolean
  fullscreenElement?: Element | null
}): void => {
  (globalThis as { document?: unknown }).document = {
    fullscreenElement: options.fullscreenElement ?? null,
    documentElement: {
      requestFullscreen: options.supported ? async () => undefined : undefined,
    },
    exitFullscreen: async () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }
}

afterEach(() => {
  delete (globalThis as { document?: unknown }).document
})

describe('FullscreenToggle', () => {
  it('renders a real toggle button, not fake CSS fullscreen, when the Fullscreen API is supported', () => {
    setStubDocument({ supported: true })
    const markup = renderToStaticMarkup(<FullscreenToggle />)

    expect(markup).toContain('<button')
    expect(markup).toContain('เต็มหน้าจอ')
    expect(markup).toMatch(/aria-pressed="false"/)
  })

  it('reflects an already-active fullscreen state in aria-pressed and the label', () => {
    setStubDocument({ supported: true, fullscreenElement: {} as Element })
    const markup = renderToStaticMarkup(<FullscreenToggle />)

    expect(markup).toContain('ออกเต็มหน้าจอ')
    expect(markup).toMatch(/aria-pressed="true"/)
  })

  it('shows a small non-blocking Thai explanation instead of a button when unsupported (e.g. iPhone Safari), rather than failing', () => {
    setStubDocument({ supported: false })
    const markup = renderToStaticMarkup(<FullscreenToggle />)

    expect(markup).not.toContain('<button')
    expect(markup).toContain('ไม่รองรับโหมดเต็มหน้าจอ')
  })

  it('applies the caller-provided className to whichever element actually renders, for both states', () => {
    setStubDocument({ supported: true })
    expect(renderToStaticMarkup(<FullscreenToggle className="city-stage__zoom-fit" />))
      .toContain('city-stage__zoom-fit')

    setStubDocument({ supported: false })
    expect(renderToStaticMarkup(<FullscreenToggle className="game-play-fullscreen-button" />))
      .toContain('game-play-fullscreen-button')
  })
})
