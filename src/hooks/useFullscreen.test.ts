import { describe, expect, it, vi } from 'vitest'
import { isFullscreenSupported, requestEnterFullscreen, requestFullscreenToggle, type FullscreenCapableDocument } from './useFullscreen'

const stubDocument = (overrides: Partial<FullscreenCapableDocument> = {}): FullscreenCapableDocument => ({
  fullscreenElement: null,
  documentElement: {},
  exitFullscreen: vi.fn(async () => undefined),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  ...overrides,
})

describe('isFullscreenSupported', () => {
  it('is true when documentElement.requestFullscreen exists', () => {
    const doc = stubDocument({ documentElement: { requestFullscreen: async () => undefined } })
    expect(isFullscreenSupported(doc)).toBe(true)
  })

  it('is false when requestFullscreen is missing - the real shape of iPhone Safari, which never exposes it', () => {
    const doc = stubDocument({ documentElement: {} })
    expect(isFullscreenSupported(doc)).toBe(false)
  })
})

describe('requestFullscreenToggle', () => {
  it('requests fullscreen when nothing is currently fullscreen', async () => {
    const requestFullscreen = vi.fn(async () => undefined)
    const doc = stubDocument({ fullscreenElement: null, documentElement: { requestFullscreen } })

    await requestFullscreenToggle(doc)

    expect(requestFullscreen).toHaveBeenCalledTimes(1)
  })

  it('exits fullscreen when already fullscreen, instead of requesting it again', async () => {
    const exitFullscreen = vi.fn(async () => undefined)
    const requestFullscreen = vi.fn(async () => undefined)
    const doc = stubDocument({
      fullscreenElement: {} as Element,
      documentElement: { requestFullscreen },
      exitFullscreen,
    })

    await requestFullscreenToggle(doc)

    expect(exitFullscreen).toHaveBeenCalledTimes(1)
    expect(requestFullscreen).not.toHaveBeenCalled()
  })

  it('is a safe no-op when the Fullscreen API is unsupported, regardless of fullscreenElement state', async () => {
    const exitFullscreen = vi.fn(async () => undefined)
    const doc = stubDocument({ fullscreenElement: {} as Element, documentElement: {}, exitFullscreen })

    await requestFullscreenToggle(doc)

    expect(exitFullscreen).not.toHaveBeenCalled()
  })
})

describe('requestEnterFullscreen', () => {
  it('requests fullscreen when supported and not currently in fullscreen', async () => {
    const requestFullscreen = vi.fn(async () => undefined)
    const doc = stubDocument({ fullscreenElement: null, documentElement: { requestFullscreen } })

    await requestEnterFullscreen(doc)

    expect(requestFullscreen).toHaveBeenCalledTimes(1)
  })

  it('does not request fullscreen when already in fullscreen', async () => {
    const requestFullscreen = vi.fn(async () => undefined)
    const doc = stubDocument({ fullscreenElement: {} as Element, documentElement: { requestFullscreen } })

    await requestEnterFullscreen(doc)

    expect(requestFullscreen).not.toHaveBeenCalled()
  })

  it('is a safe no-op when Fullscreen API is unsupported', async () => {
    const doc = stubDocument({ fullscreenElement: null, documentElement: {} })

    await expect(requestEnterFullscreen(doc)).resolves.toBeUndefined()
  })

  it('safely catches and suppresses rejections when requestFullscreen rejects without throwing', async () => {
    const requestFullscreen = vi.fn(async () => {
      throw new Error('NotAllowedError: Fullscreen request denied')
    })
    const doc = stubDocument({ fullscreenElement: null, documentElement: { requestFullscreen } })

    await expect(requestEnterFullscreen(doc)).resolves.toBeUndefined()
    expect(requestFullscreen).toHaveBeenCalledTimes(1)
  })
})
