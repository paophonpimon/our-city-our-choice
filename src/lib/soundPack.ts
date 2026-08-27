import type { LocationId } from '../domain/cityScoring'
import type { CityLevel, RoleId } from '../domain/ourCity'
import type { ClassroomRoomStatus } from '../types/classroomGame'

export const SOUND_PACK = {
  uiClick: '/audio/ui/ui-click.mp3',
  alertCrisis: '/audio/sfx/alert-crisis.mp3',
  cutsceneTyping: '/audio/sfx/cutscene-typing.mp3',
  sceneRooster: '/audio/sfx/scene-rooster.mp3',
  ambientConstruction: '/audio/ambience/ambient-construction.mp3',
  ambientWindDegraded: '/audio/ambience/ambient-wind-degraded.mp3',
  ambientCityCritical: '/audio/ambience/ambient-city-critical-under-200.mp3',
  ambientBirdsShort: '/audio/ambience/ambient-birds-short.mp3',
  ambientBirdsLong: '/audio/ambience/ambient-birds-long.mp3',
} as const

export type SoundId = keyof typeof SOUND_PACK
export type SoundLoopChannel = 'ambience' | 'cutscene'

const SOUND_VOLUME: Record<SoundId, number> = {
  uiClick: 0.12,
  alertCrisis: 0.3,
  cutsceneTyping: 0.16,
  sceneRooster: 0.22,
  ambientConstruction: 0.12,
  ambientWindDegraded: 0.12,
  ambientCityCritical: 0.14,
  ambientBirdsShort: 0.14,
  ambientBirdsLong: 0.1,
}

export interface SoundAudio {
  src: string
  preload: string
  volume: number
  loop: boolean
  currentTime: number
  play: () => Promise<void> | void
  pause: () => void
}

export type SoundAudioFactory = (src: string) => SoundAudio

const createBrowserAudio: SoundAudioFactory = (src) => {
  const audio = new Audio()
  audio.preload = 'none'
  audio.src = src
  return audio
}

const safelyReset = (audio: SoundAudio): void => {
  try {
    audio.currentTime = 0
  } catch {
    // A browser may reject seeking before metadata is available.
  }
}

const safelyPause = (audio: SoundAudio): void => {
  try {
    audio.pause()
    safelyReset(audio)
  } catch {
    // Audio is presentation-only and must never block navigation/gameplay.
  }
}

const safelyPlay = (audio: SoundAudio): void => {
  try {
    const result = audio.play()
    if (result) void result.catch(() => undefined)
  } catch {
    // Includes unsupported media and autoplay failures.
  }
}

export class SoundPackController {
  private readonly cache = new Map<SoundId, SoundAudio>()
  private readonly desiredLoops = new Map<SoundLoopChannel, SoundId>()
  private readonly activeLoops = new Map<SoundLoopChannel, SoundId>()
  private readonly pendingEffects = new Map<string, SoundId>()
  private readonly playedEffects = new Set<string>()
  private userActivated = false

  constructor(private readonly createAudio: SoundAudioFactory = createBrowserAudio) {}

  private getAudio(soundId: SoundId): SoundAudio | null {
    const cached = this.cache.get(soundId)
    if (cached) return cached
    try {
      const audio = this.createAudio(SOUND_PACK[soundId])
      audio.preload = 'none'
      audio.volume = SOUND_VOLUME[soundId]
      this.cache.set(soundId, audio)
      return audio
    } catch {
      return null
    }
  }

  private startLoop(channel: SoundLoopChannel, soundId: SoundId): void {
    if (!this.userActivated) return
    const audio = this.getAudio(soundId)
    if (!audio) return
    audio.loop = true
    safelyReset(audio)
    this.activeLoops.set(channel, soundId)
    safelyPlay(audio)
  }

  private stopActiveLoop(channel: SoundLoopChannel): void {
    const activeSound = this.activeLoops.get(channel)
    if (!activeSound) return
    const audio = this.cache.get(activeSound)
    if (audio) safelyPause(audio)
    this.activeLoops.delete(channel)
  }

  noteUserGesture(): void {
    this.userActivated = true
    for (const [channel, soundId] of this.desiredLoops) {
      if (this.activeLoops.get(channel) !== soundId) this.startLoop(channel, soundId)
    }
    for (const [effectKey, soundId] of [...this.pendingEffects]) {
      this.pendingEffects.delete(effectKey)
      this.playEffectOnce(soundId, effectKey)
    }
  }

  playEffect(soundId: SoundId): void {
    if (!this.userActivated) return
    const audio = this.getAudio(soundId)
    if (!audio) return
    audio.loop = false
    safelyReset(audio)
    safelyPlay(audio)
  }

  playEffectOnce(soundId: SoundId, effectKey: string): void {
    if (this.playedEffects.has(effectKey)) return
    if (!this.userActivated) {
      this.pendingEffects.set(effectKey, soundId)
      return
    }
    this.playedEffects.add(effectKey)
    this.playEffect(soundId)
  }

  cancelPendingEffect(effectKey: string): void {
    this.pendingEffects.delete(effectKey)
  }

  stopEffect(soundId: SoundId): void {
    const audio = this.cache.get(soundId)
    if (audio) safelyPause(audio)
  }

  setLoop(channel: SoundLoopChannel, soundId: SoundId | null): void {
    if (this.desiredLoops.get(channel) === soundId) return
    this.stopActiveLoop(channel)
    if (!soundId) {
      this.desiredLoops.delete(channel)
      return
    }
    this.desiredLoops.set(channel, soundId)
    this.startLoop(channel, soundId)
  }

  clearLoop(channel: SoundLoopChannel, expectedSound: SoundId): void {
    if (this.desiredLoops.get(channel) !== expectedSound) return
    this.desiredLoops.delete(channel)
    this.stopActiveLoop(channel)
  }
}

export const soundPackController = new SoundPackController()

export const selectGameAmbience = (
  status: ClassroomRoomStatus | undefined,
  roleId: RoleId | null | undefined,
): SoundId | null => status === 'playing' && roleId === 'contractor' ? 'ambientConstruction' : null

export const selectResultAmbience = (
  status: ClassroomRoomStatus | undefined,
  cityScore: number | undefined,
  cityLevel: CityLevel | undefined,
  activeLocation: LocationId | null,
): SoundId | null => {
  if (status !== 'game-result' && status !== 'finished') return null
  if (activeLocation === 'construction') return 'ambientConstruction'
  if (typeof cityScore === 'number' && cityScore < 200) return 'ambientCityCritical'
  if (cityLevel === 'declining' || cityLevel === 'critical') return 'ambientWindDegraded'
  return cityLevel ? 'ambientBirdsLong' : null
}

export const selectRoleDrawAccent = (
  gameCycle: number | undefined,
  revealed: boolean,
): SoundId | null => !revealed || gameCycle === undefined
  ? null
  : gameCycle > 0 ? 'ambientBirdsShort' : null

export const selectCutsceneSound = (phase: string | null | undefined): SoundId | null =>
  phase === 'entering' || phase === 'holding' ? 'cutsceneTyping' : null

export const shouldDuckTeacherBgm = (
  status: ClassroomRoomStatus | undefined,
  cutsceneActive: boolean,
): boolean => cutsceneActive || status === 'round-result' || status === 'crisis-intro'
