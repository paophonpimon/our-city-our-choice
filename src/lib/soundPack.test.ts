import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  selectCutsceneSound,
  selectGameAmbience,
  selectResultAmbience,
  selectRoleDrawAccent,
  shouldDuckTeacherBgm,
  SOUND_PACK,
  SoundPackController,
  type SoundAudio,
} from './soundPack'
import { getTeacherBgmOutputVolume } from '../components/TeacherSoundtrack'

const fakeAudio = (src: string, play = vi.fn().mockResolvedValue(undefined)): SoundAudio => ({
  src,
  preload: '',
  volume: 1,
  loop: false,
  currentTime: 0,
  play,
  pause: vi.fn(),
})

describe('Sound Pack V1 selection', () => {
  it('references exactly the approved on-demand files that exist in public/audio', () => {
    expect(Object.values(SOUND_PACK)).toHaveLength(9)
    for (const soundUrl of Object.values(SOUND_PACK)) {
      expect(existsSync(fileURLToPath(new URL(`../../public${soundUrl}`, import.meta.url)))).toBe(true)
    }
  })

  it('selects sounds only for their intended presentation states', () => {
    expect(selectGameAmbience('playing', 'contractor')).toBe('ambientConstruction')
    expect(selectGameAmbience('round-result', 'contractor')).toBeNull()
    expect(selectGameAmbience('playing', 'teacher')).toBeNull()

    expect(selectResultAmbience('game-result', 199, 'critical', null)).toBe('ambientCityCritical')
    expect(selectResultAmbience('game-result', 250, 'declining', null)).toBe('ambientWindDegraded')
    expect(selectResultAmbience('finished', 500, 'neutral', null)).toBe('ambientBirdsLong')
    expect(selectResultAmbience('finished', 850, 'prosperous', 'construction')).toBe('ambientConstruction')
    expect(selectResultAmbience('playing', 500, 'neutral', null)).toBeNull()

    expect(selectRoleDrawAccent(0, true)).toBeNull()
    expect(selectRoleDrawAccent(1, true)).toBe('ambientBirdsShort')
    expect(selectRoleDrawAccent(0, false)).toBeNull()
    expect(selectCutsceneSound('entering')).toBe('cutsceneTyping')
    expect(selectCutsceneSound('holding')).toBe('cutsceneTyping')
    expect(selectCutsceneSound('text-leaving')).toBeNull()
    expect(selectCutsceneSound('leaving')).toBeNull()
    expect(selectCutsceneSound(null)).toBeNull()
    expect(shouldDuckTeacherBgm('round-result', false)).toBe(true)
    expect(shouldDuckTeacherBgm('crisis-intro', false)).toBe(true)
    expect(shouldDuckTeacherBgm('playing', true)).toBe(true)
    expect(shouldDuckTeacherBgm('playing', false)).toBe(false)
    expect(shouldDuckTeacherBgm('crisis-playing', false)).toBe(false)
  })

  it('keeps teacher-only presentation sounds off student and role-draw clients', () => {
    const gamePage = readFileSync(new URL('../pages/GamePage.tsx', import.meta.url), 'utf8')
    const teacherPage = readFileSync(new URL('../pages/TeacherPage.tsx', import.meta.url), 'utf8')
    const roleDrawPage = readFileSync(new URL('../pages/RoleDrawPage.tsx', import.meta.url), 'utf8')

    expect(gamePage).not.toContain('alertCrisis')
    expect(teacherPage.match(/useSoundEffectOnce\('alertCrisis'/g)).toHaveLength(1)
    expect(teacherPage).toContain("room?.status === 'crisis-intro'")
    expect(teacherPage).toContain('`${room.roomId}:${room.gameCycle}:${room.currentCrisisEventId}`')
    expect(roleDrawPage).not.toContain('sceneRooster')
    expect(teacherPage).not.toContain('useSoundEffectOnce(yearTransitionAccent')
    expect(teacherPage).toContain('transitionId: `${roomAtStart}:${room.gameCycle}:${questionAtStart}:presentation-${run}`')
    expect(teacherPage).toContain("useSoundLoop('cutscene', selectCutsceneSound(yearCutscene?.phase))")
  })

  it('plays cached rooster directly once at each completed year-cutscene boundary', () => {
    const teacherPage = readFileSync(new URL('../pages/TeacherPage.tsx', import.meta.url), 'utf8')
    const textFadeWait = teacherPage.indexOf('await waitForPresentation(timing.textFade)')
    const currentBoundaryGuard = teacherPage.indexOf('if (!boundaryIsCurrent()) return', textFadeWait)
    const roosterPlayback = teacherPage.indexOf('soundPackController.playEffectOnce(', currentBoundaryGuard)
    const leavingTransition = teacherPage.indexOf("setYearCutscene({ ...cutscene, phase: 'leaving' })", roosterPlayback)

    expect(textFadeWait).toBeGreaterThan(-1)
    expect(currentBoundaryGuard).toBeGreaterThan(textFadeWait)
    expect(roosterPlayback).toBeGreaterThan(currentBoundaryGuard)
    expect(leavingTransition).toBeGreaterThan(roosterPlayback)
    expect(teacherPage.slice(roosterPlayback, leavingTransition)).toContain("'sceneRooster'")
    expect(teacherPage.slice(roosterPlayback, leavingTransition)).toContain('`${cutscene.transitionId}:year-transition`')
    expect(teacherPage).not.toContain('await soundPackController.playEffectOnce')
  })

  it('shows the non-blocking red alert only for teacher Crisis intro with a reduced-motion tint', () => {
    const gamePage = readFileSync(new URL('../pages/GamePage.tsx', import.meta.url), 'utf8')
    const teacherPage = readFileSync(new URL('../pages/TeacherPage.tsx', import.meta.url), 'utf8')
    const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')

    expect(gamePage).not.toContain('teacher-crisis-alert-overlay')
    expect(teacherPage).toContain("room.status === 'crisis-intro' ? <div className=\"teacher-crisis-alert-overlay\" aria-hidden=\"true\" /> : null")
    expect(teacherPage).not.toMatch(/teacher-crisis-alert-overlay[^>]+on(?:Click|AnimationEnd)=/)
    expect(styles).toMatch(/\.teacher-crisis-alert-overlay \{[\s\S]*?pointer-events: none;[\s\S]*?animation: teacher-crisis-alert-pulse 1\.35s ease-out both;/)
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.teacher-crisis-alert-overlay \{ animation: teacher-crisis-alert-reduced \.6s ease-out both; \}/)
    expect(styles).toMatch(/@keyframes teacher-crisis-alert-reduced \{\s*from \{ opacity: \.32; \}\s*to \{ opacity: 0; \}\s*\}/)
  })

  it('reduces normal BGM output by 40%, ducks it during transition, and restores it for gameplay', () => {
    const teacherPage = readFileSync(new URL('../pages/TeacherPage.tsx', import.meta.url), 'utf8')
    const soundtrack = readFileSync(new URL('../components/TeacherSoundtrack.tsx', import.meta.url), 'utf8')

    expect(getTeacherBgmOutputVolume(0.45, false)).toBeCloseTo(0.27)
    expect(getTeacherBgmOutputVolume(0.45, true)).toBeCloseTo(0.0405)
    expect(soundtrack).toContain('setDucked: (ducked: boolean) => void')
    expect(soundtrack).toContain('BGM_FADE_DURATION_MS = 180')
    expect(teacherPage).toContain('teacherSoundtrackRef.current?.setDucked(teacherBgmDucked)')
    expect(shouldDuckTeacherBgm('round-result', false)).toBe(true)
    expect(shouldDuckTeacherBgm('playing', false)).toBe(false)
  })
})

describe('SoundPackController', () => {
  it('constructs no audio until a requested sound has an existing user gesture', () => {
    const created: SoundAudio[] = []
    const controller = new SoundPackController((src) => {
      const audio = fakeAudio(src)
      created.push(audio)
      return audio
    })

    controller.setLoop('ambience', 'ambientBirdsLong')
    expect(created).toHaveLength(0)

    controller.noteUserGesture()
    expect(created.map((audio) => audio.src)).toEqual([SOUND_PACK.ambientBirdsLong])

    controller.playEffect('uiClick')
    controller.playEffect('uiClick')
    expect(created.map((audio) => audio.src)).toEqual([SOUND_PACK.ambientBirdsLong, SOUND_PACK.uiClick])
  })

  it('never throws or blocks when audio construction or playback fails', async () => {
    const rejectedPlay = vi.fn().mockRejectedValue(new Error('autoplay blocked'))
    const rejectedController = new SoundPackController((src) => fakeAudio(src, rejectedPlay))
    rejectedController.noteUserGesture()

    expect(() => rejectedController.playEffect('alertCrisis')).not.toThrow()
    await Promise.resolve()

    const throwingController = new SoundPackController(() => { throw new Error('unsupported audio') })
    throwingController.noteUserGesture()
    expect(() => throwingController.playEffect('uiClick')).not.toThrow()
  })

  it('stops the previous loop on state transition and cleans up the owned channel', () => {
    const created = new Map<string, SoundAudio>()
    const controller = new SoundPackController((src) => {
      const audio = fakeAudio(src)
      created.set(src, audio)
      return audio
    })
    controller.noteUserGesture()

    controller.setLoop('ambience', 'ambientBirdsLong')
    const birds = created.get(SOUND_PACK.ambientBirdsLong)
    expect(birds?.loop).toBe(true)
    expect(birds?.play).toHaveBeenCalledOnce()

    controller.setLoop('ambience', 'ambientWindDegraded')
    const wind = created.get(SOUND_PACK.ambientWindDegraded)
    expect(birds?.pause).toHaveBeenCalledOnce()
    expect(wind?.play).toHaveBeenCalledOnce()

    controller.clearLoop('ambience', 'ambientWindDegraded')
    expect(wind?.pause).toHaveBeenCalledOnce()
  })

  it('plays a state effect once and cancels a pending effect on unmount', () => {
    const created: SoundAudio[] = []
    const controller = new SoundPackController((src) => {
      const audio = fakeAudio(src)
      created.push(audio)
      return audio
    })

    controller.playEffectOnce('alertCrisis', 'crisis-room-a-event-1')
    controller.cancelPendingEffect('crisis-room-a-event-1')
    controller.noteUserGesture()
    expect(created).toHaveLength(0)

    controller.playEffectOnce('alertCrisis', 'crisis-room-a-event-1')
    controller.playEffectOnce('alertCrisis', 'crisis-room-a-event-1')
    expect(created).toHaveLength(1)
    expect(created[0]?.play).toHaveBeenCalledOnce()
  })

  it('plays rooster once for each unique year-cutscene presentation identity', () => {
    const rooster = fakeAudio(SOUND_PACK.sceneRooster)
    const createAudio = vi.fn(() => rooster)
    const controller = new SoundPackController(createAudio)
    controller.noteUserGesture()

    controller.playEffectOnce('sceneRooster', 'sceneRooster:ROOM:0:1:presentation-1:year-transition')
    controller.playEffectOnce('sceneRooster', 'sceneRooster:ROOM:0:1:presentation-1:year-transition')
    rooster.currentTime = 7
    controller.playEffectOnce('sceneRooster', 'sceneRooster:ROOM:0:2:presentation-2:year-transition')
    rooster.currentTime = 9
    controller.playEffectOnce('sceneRooster', 'sceneRooster:ROOM:1:1:presentation-3:year-transition')

    expect(createAudio).toHaveBeenCalledOnce()
    expect(createAudio).toHaveBeenCalledWith(SOUND_PACK.sceneRooster)
    expect(rooster.play).toHaveBeenCalledTimes(3)
    expect(rooster.currentTime).toBe(0)
  })
})
