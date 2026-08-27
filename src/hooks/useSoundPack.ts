import { useEffect } from 'react'
import {
  soundPackController,
  type SoundId,
  type SoundLoopChannel,
} from '../lib/soundPack'

export const useUiClickSound = (): void => {
  useEffect(() => {
    const handleClick = (event: MouseEvent): void => {
      if (/^\/result\/[^/]+\/?$/.test(window.location.pathname)) return
      soundPackController.noteUserGesture()
      const target = event.target instanceof Element ? event.target : null
      const control = target?.closest('button, [role="button"]')
      if (!control || control.matches(':disabled, [aria-disabled="true"]')) return
      soundPackController.playEffect('uiClick')
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])
}

export const useSoundEffectOnce = (soundId: SoundId | null, triggerKey: string | null): void => {
  useEffect(() => {
    if (!soundId || !triggerKey) return undefined
    const effectKey = `${soundId}:${triggerKey}`
    soundPackController.playEffectOnce(soundId, effectKey)
    return () => {
      soundPackController.cancelPendingEffect(effectKey)
      soundPackController.stopEffect(soundId)
    }
  }, [soundId, triggerKey])
}

export const useSoundLoop = (channel: SoundLoopChannel, soundId: SoundId | null): void => {
  useEffect(() => {
    soundPackController.setLoop(channel, soundId)
    if (!soundId) return undefined
    return () => soundPackController.clearLoop(channel, soundId)
  }, [channel, soundId])
}
