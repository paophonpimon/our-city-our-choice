import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CityStage } from '../components/CityStage'
import { CityScene } from '../components/CityScene'
import { CityBirdsAnimation } from '../components/CityBirdsAnimation'
import { CityLoader } from '../components/CityLoader'
import { createClassroomJoinUrl, LOCATION_POSITIONS } from '../components/classroomUi'
import { JoinQrCode } from '../components/JoinQrCode'
import { LiveAnswerImpacts } from '../components/LiveAnswerImpacts'
import { TeacherSoundtrack, type TeacherSoundtrackHandle, type TeacherSoundtrackMode } from '../components/TeacherSoundtrack'
import { useGame } from '../context/GameContext'
import { countAnswersForQuestion, getLiveCityScore, shouldCloseQuestion } from '../domain/classroomGameLoop'
import { createRoomQuestionSnapshot, type ParsedQuestionSheet, type RoomQuestionSnapshot } from '../domain/classroomQuestions'
import type { LocationId } from '../domain/cityScoring'
import { resolveLiveAnswerImpact, type LiveAnswerImpact } from '../domain/liveAnswerImpact'
import { ROLE_CIVIC_GUIDANCE, ROLES, type RoleId } from '../domain/ourCity'
import { BUILDING_IDS, BUILDING_LOCATION, INITIAL_BUILDING_LEVELS, normalizeBuildingLevels, type BuildingId, type BuildingLevels } from '../domain/cityBuildings'
import { useAnswers, useCrisisResults, usePlayers, useRoom, useRounds } from '../hooks/useGameData'
import { useCountdown } from '../hooks/useCountdown'
import { classroomFriendlyError } from '../services'
import { loadGoogleSheetsQuestions } from '../services/googleSheetsQuestions'
import {
  clearClassroomTeacherSession,
  getClassroomTeacherSession,
  saveClassroomTeacherSession,
  saveClassroomViewerRole,
} from '../services/sessionStorage'
import { clearAllTeacherSnapshots, clearTeacherSnapshot, restoreTeacherSnapshot, saveTeacherSnapshot } from '../services/teacherQuestionSnapshot'
import type { ClassroomRoom } from '../types/classroomGame'
import { isQuestionAnswerRecord } from '../types/classroomGame'
import { getCrisisConclusion, getCrisisEvent } from '../domain/cityCrisisEvents'
import { isCrisisAnswerRecord } from '../types/classroomGame'

type SheetStatus = 'loading' | 'ready' | 'error'
type YearCutscenePhase = 'entering' | 'holding' | 'text-leaving' | 'leaving'

interface YearCutsceneState {
  cityYear: number
  phase: YearCutscenePhase
}

interface BuildingChangeStory {
  buildingId: BuildingId
  locationId: LocationId
  label: string
  direction: 'improved' | 'declined'
}

const BUILDING_STORY_LABELS: Record<BuildingId, string> = {
  municipality: 'สำนักงานเทศบาล',
  hospital: 'โรงพยาบาล',
  police: 'สถานีตำรวจ',
  construction: 'ไซต์ก่อสร้าง',
  market: 'ตลาด',
  school: 'โรงเรียน',
  newsAgency: 'สำนักข่าว',
}

const waitForCutscene = (durationMs: number): Promise<void> => new Promise((resolve) => {
  window.setTimeout(resolve, durationMs)
})

const sameBuildingLevels = (left: BuildingLevels | null, right: BuildingLevels): boolean =>
  left !== null && BUILDING_IDS.every((buildingId) => left[buildingId] === right[buildingId])

/* Icons used in the compact room summary; card artwork is used for full cards. */
const ROLE_ICONS: Record<RoleId, string> = {
  doctor: '🩺',
  municipal: '🏛️',
  police: '👮',
  teacher: '🧑‍🏫',
  merchant: '🛍️',
  contractor: '👷',
  student: '🎒',
  journalist: '🎙️',
}

/*
 * Developer-only city layout calibration mode (?layout=1). CityStage already
 * overrides scene/building visuals from local layout state when this mode is
 * active, so this placeholder room only needs to satisfy CityStage's prop
 * type without touching any real room, service, or Firestore state.
 */
const STANDALONE_LAYOUT_ROOM: ClassroomRoom = {
  roomId: 'LAYOUT-CALIBRATION',
  teacherSessionId: 'layout-calibration',
  status: 'playing',
  gameCycle: 0,
  completedGameCount: 0,
  currentQuestionNumber: 1,
  currentCrisisEventIndex: 0,
  currentCrisisEventId: null,
  questionDurationSec: 30,
  questionStartedAt: null,
  questionDeadlineAt: null,
  lockedPlayerCount: 0,
  cityScore: 500,
  cityLevel: 'neutral',
  buildingLevels: INITIAL_BUILDING_LEVELS,
  integrityTotal: 0,
  corruptionTotal: 0,
  timeoutTotal: 0,
  roleRotation: [],
  createdAt: 0,
  updatedAt: 0,
}

const LOBBY_GAME_RULES = [
  'ระบบสุ่มให้นักเรียนคนละ 1 ใน 8 อาชีพอย่างสมดุล',
  'แต่ละชุดมีคำถามปกติ 10 ข้อ และเหตุการณ์วิกฤตเมือง 2 ครั้งหลังข้อ 4 และข้อ 8',
  'ทุกคำตอบส่งผลต่อคะแนนของอาคารที่เกี่ยวข้อง',
  'คะแนนอาคารและเมืองคำนวณจากค่าเฉลี่ยคำตอบของทั้งห้อง',
  'เมื่อจบชุด นักเรียนสามารถเปลี่ยนอาชีพเพื่อเรียนรู้ครบทั้ง 8 บทบาท',
] as const

export const TeacherPage = () => {
  const { service, uid, refreshSession } = useGame()
  const navigate = useNavigate()
  const isStandaloneLayoutMode = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('layout') === '1'
  const storedSession = getClassroomTeacherSession()
  const restoredSnapshot = storedSession?.roomId ? restoreTeacherSnapshot(storedSession.roomId) : null
  const [roomId, setRoomId] = useState(storedSession?.roomId ?? '')
  const [questionDurationSec, setQuestionDurationSec] = useState(30)
  const [sheetStatus, setSheetStatus] = useState<SheetStatus>(restoredSnapshot ? 'ready' : 'loading')
  const [sheet, setSheet] = useState<ParsedQuestionSheet | null>(null)
  const [sheetError, setSheetError] = useState('')
  const [trustedSnapshot, setTrustedSnapshot] = useState<RoomQuestionSnapshot | null>(restoredSnapshot)
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [isLobbyRulesOpen, setIsLobbyRulesOpen] = useState(false)
  const [yearCutscene, setYearCutscene] = useState<YearCutsceneState | null>(null)
  const [visualCityLevel, setVisualCityLevel] = useState<ClassroomRoom['cityLevel'] | null>(null)
  const [visualBuildingLevels, setVisualBuildingLevels] = useState<BuildingLevels | null>(null)
  const [cityRevealLocations, setCityRevealLocations] = useState<LocationId[]>([])
  const [buildingChangeStory, setBuildingChangeStory] = useState<BuildingChangeStory | null>(null)
  const [liveAnswerImpacts, setLiveAnswerImpacts] = useState<LiveAnswerImpact[]>([])
  const [restoringStoredRoom, setRestoringStoredRoom] = useState(Boolean(storedSession?.roomId))
  const closingRef = useRef(false)
  const roomBoundaryRef = useRef(0)
  const seenAnswerIdsRef = useRef(new Set<string>())
  const liveImpactTrackingReadyRef = useRef(false)
  const liveImpactTimersRef = useRef(new Map<string, number>())
  const teacherSoundtrackRef = useRef<TeacherSoundtrackHandle>(null)

  const resetRoomTransientState = useCallback((): void => {
    roomBoundaryRef.current += 1
    setVisualCityLevel(null)
    setVisualBuildingLevels(null)
    setYearCutscene(null)
    setBuildingChangeStory(null)
    setCityRevealLocations([])
    setLiveAnswerImpacts([])
    setActionError('')
    setActionMessage('')
    setIsLobbyRulesOpen(false)
    closingRef.current = false
    seenAnswerIdsRef.current.clear()
    liveImpactTrackingReadyRef.current = false
    for (const timer of liveImpactTimersRef.current.values()) window.clearTimeout(timer)
    liveImpactTimersRef.current.clear()
  }, [])

  // Calibration mode never subscribes to a real room, so it never touches Firebase/Demo state.
  const subscribedRoomId = isStandaloneLayoutMode ? '' : roomId
  const roomState = useRoom(subscribedRoomId)
  const playersState = usePlayers(subscribedRoomId)
  const answersState = useAnswers(subscribedRoomId)
  const roundsState = useRounds(subscribedRoomId)
  const crisisResultsState = useCrisisResults(subscribedRoomId)
  const room = roomState.data
  const teacherSoundtrackMode: TeacherSoundtrackMode = !roomId || restoringStoredRoom
    ? 'off'
    : room?.status === 'lobby' || !room
      ? 'lobby'
      : 'game'
  const remaining = useCountdown(room?.questionDeadlineAt ?? null)
  const answerCount = room && room.currentQuestionNumber > 0
    ? countAnswersForQuestion(answersState.data, room.currentQuestionNumber, room.gameCycle)
    : 0
  const liveCityScore = useMemo(
    () => room?.status === 'playing'
      ? getLiveCityScore(
          room.cityScore,
          room.lockedPlayerCount,
          room.currentQuestionNumber,
          room.gameCycle,
          answersState.data,
          trustedSnapshot,
        )
      : null,
    [answersState.data, room, trustedSnapshot],
  )
  const canAdvanceQuestion = Boolean(
    room && (
      room.status === 'round-result'
      || (
        room.status === 'playing'
        && trustedSnapshot
        && shouldCloseQuestion(answerCount, room.lockedPlayerCount, room.questionDeadlineAt)
      )
    ),
  )
  const crisisAnswerCount = room?.currentCrisisEventId
    ? new Set(answersState.data.filter((answer) => isCrisisAnswerRecord(answer) && answer.gameCycle === room.gameCycle && answer.eventId === room.currentCrisisEventId).map((answer) => answer.playerId)).size
    : 0
  const currentCrisisResult = room && room.currentCrisisEventIndex > 0
    ? crisisResultsState.data.find((result) => result.gameCycle === room.gameCycle && result.eventIndex === room.currentCrisisEventIndex) ?? null
    : null
  const currentRound = room
    ? roundsState.data.find((round) => round.gameCycle === room.gameCycle && round.questionNumber === room.currentQuestionNumber) ?? null
    : null
  const latestRound = room
    ? roundsState.data
        .filter((round) => round.gameCycle === room.gameCycle && round.questionNumber <= room.currentQuestionNumber)
        .sort((left, right) => right.questionNumber - left.questionNumber)[0] ?? null
    : null

  useEffect(() => {
    if (!room) {
      setVisualCityLevel(null)
      setVisualBuildingLevels(null)
      return
    }
    if (visualCityLevel === null) {
      setVisualCityLevel(room.cityLevel)
    }
    if (visualBuildingLevels === null) {
      const nextLevels = normalizeBuildingLevels(room.buildingLevels)
      setVisualBuildingLevels((currentLevels) => sameBuildingLevels(currentLevels, nextLevels) ? currentLevels : nextLevels)
    }
  }, [room, visualBuildingLevels, visualCityLevel])

  useEffect(() => {
    resetRoomTransientState()
    setTrustedSnapshot(roomId ? restoreTeacherSnapshot(roomId) : null)
  }, [resetRoomTransientState, roomId])

  useEffect(() => () => {
    for (const timer of liveImpactTimersRef.current.values()) window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (answersState.loading || !room || !trustedSnapshot) return
    const currentAnswers = answersState.data.filter((answer) =>
      isQuestionAnswerRecord(answer) && answer.gameCycle === room.gameCycle && answer.questionNumber === room.currentQuestionNumber)
    const showImpact = (answer: (typeof currentAnswers)[number], durationMs = 1_500): void => {
      if (room.status !== 'playing') return
      const impact = resolveLiveAnswerImpact(answer, trustedSnapshot)
      if (!impact) return
      setLiveAnswerImpacts((current) => [...current.filter((item) => item.id !== impact.id), impact])
      const existingTimer = liveImpactTimersRef.current.get(impact.id)
      if (existingTimer !== undefined) window.clearTimeout(existingTimer)
      const timer = window.setTimeout(() => {
        setLiveAnswerImpacts((current) => current.filter((item) => item.id !== impact.id))
        liveImpactTimersRef.current.delete(impact.id)
      }, durationMs)
      liveImpactTimersRef.current.set(impact.id, timer)
    }
    if (!liveImpactTrackingReadyRef.current) {
      const now = Date.now()
      for (const answer of currentAnswers) {
        seenAnswerIdsRef.current.add(answer.answerId)
        const remainingDisplayTime = 1_500 - Math.max(0, now - answer.submittedAt)
        if (remainingDisplayTime > 0) showImpact(answer, remainingDisplayTime)
      }
      liveImpactTrackingReadyRef.current = true
      return
    }
    for (const answer of currentAnswers) {
      if (seenAnswerIdsRef.current.has(answer.answerId)) continue
      seenAnswerIdsRef.current.add(answer.answerId)
      showImpact(answer)
    }
  }, [answersState.data, answersState.loading, room, trustedSnapshot])

  const loadQuestions = useCallback(async (): Promise<void> => {
    setSheetStatus('loading')
    setSheetError('')
    try {
      const result = await loadGoogleSheetsQuestions()
      setSheet(result)
      if (!result.valid) {
        const roleErrors = result.errors
          .filter((error) => error.message.includes('requires at least'))
          .map((error) => error.message)
        setSheetError(roleErrors.join(' • ') || `ข้อมูลคำถามไม่ถูกต้อง ${result.errors.length} จุด`)
        setSheetStatus('error')
      } else {
        setSheetStatus('ready')
      }
    } catch (reason) {
      setSheet(null)
      setSheetError(classroomFriendlyError(reason))
      setSheetStatus('error')
    }
  }, [])

  useEffect(() => {
    if (!trustedSnapshot) void loadQuestions()
  }, [loadQuestions, trustedSnapshot])

  useEffect(() => {
    saveClassroomViewerRole('teacher')
  }, [])

  useEffect(() => {
    if (!isLobbyRulesOpen) return
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setIsLobbyRulesOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isLobbyRulesOpen])

  useEffect(() => {
    if (room?.status === 'role-draw') navigate(`/role-draw/${room.roomId}`, { replace: true })
    if (room?.status === 'game-result') navigate(`/result/${room.roomId}`, { replace: true })
  }, [navigate, room])

  useEffect(() => {
    if (!roomId || roomState.identityKey !== roomId || roomState.loading) return
    if (!room || room.status === 'finished' || room.teacherSessionId !== uid) {
      clearTeacherSnapshot(roomId)
      clearClassroomTeacherSession()
      setTrustedSnapshot(null)
      setRoomId('')
    }
    setRestoringStoredRoom(false)
  }, [room, roomId, roomState.identityKey, roomState.loading, uid])

  const closeCurrentQuestion = useCallback(async (): Promise<void> => {
    if (!room || room.status !== 'playing' || !trustedSnapshot || closingRef.current) return
    closingRef.current = true
    setActionError('')
    try {
      await service.closeQuestion(room.roomId, uid, trustedSnapshot)
    } catch (reason) {
      setActionError(classroomFriendlyError(reason))
    } finally {
      closingRef.current = false
    }
  }, [room, service, trustedSnapshot, uid])

  const closeCurrentCrisis = useCallback(async (): Promise<void> => {
    if (!room || room.status !== 'crisis-playing' || closingRef.current) return
    closingRef.current = true; setActionError('')
    try { await service.closeCrisisEvent(room.roomId, uid) }
    catch (reason) { setActionError(classroomFriendlyError(reason)) }
    finally { closingRef.current = false }
  }, [room, service, uid])

  useEffect(() => {
    if (room?.status === 'crisis-playing' && shouldCloseQuestion(crisisAnswerCount, room.lockedPlayerCount, room.questionDeadlineAt)) void closeCurrentCrisis()
  }, [closeCurrentCrisis, crisisAnswerCount, remaining, room])

  const joinLink = useMemo(
    () => (roomId ? createClassroomJoinUrl(window.location.origin, roomId) : ''),
    [roomId],
  )

  const createRoom = async (): Promise<void> => {
    if (sheetStatus !== 'ready' || !sheet?.valid) {
      setActionError('กรุณาโหลดคำถามให้ครบก่อนสร้างห้อง')
      return
    }
    setBusy(true)
    setActionError('')
    teacherSoundtrackRef.current?.playLobby()
    try {
      const activeUid = await refreshSession()
      const created = await service.createRoom(activeUid, questionDurationSec)
      if (roomId) clearTeacherSnapshot(roomId)
      clearClassroomTeacherSession()
      resetRoomTransientState()
      setTrustedSnapshot(null)
      saveClassroomTeacherSession({
        roomId: created.roomId,
        role: 'teacher',
        sessionVersion: 2,
      })
      setRestoringStoredRoom(true)
      setRoomId(created.roomId)
    } catch (reason) {
      teacherSoundtrackRef.current?.stop()
      setActionError(classroomFriendlyError(reason))
    } finally {
      setBusy(false)
    }
  }

  const startGame = async (): Promise<void> => {
    if (!room || !sheet?.valid) return
    setBusy(true)
    setActionError('')
    teacherSoundtrackRef.current?.playGame()
    try {
      const snapshot = createRoomQuestionSnapshot(room.roomId, sheet.questions)
      saveTeacherSnapshot(snapshot)
      setTrustedSnapshot(snapshot)
      await service.startGame(room.roomId, uid, snapshot)
    } catch (reason) {
      teacherSoundtrackRef.current?.playLobby()
      setActionError(classroomFriendlyError(reason))
    } finally {
      setBusy(false)
    }
  }

  const nextOrFinish = async (): Promise<void> => {
    if (!room || !canAdvanceQuestion) return
    const boundary = roomBoundaryRef.current
    const roomAtStart = room.roomId
    const boundaryIsCurrent = (): boolean => roomBoundaryRef.current === boundary && roomId === roomAtStart
    setBusy(true)
    setActionError('')
    try {
      let finalizedRound = currentRound
      if (room.status === 'playing') {
        if (!trustedSnapshot) throw new Error('ผู้ใช้:ไม่พบข้อมูลตรวจคำตอบในเครื่องครู')
        finalizedRound = await service.closeQuestion(room.roomId, uid, trustedSnapshot)
      }
      if (room.currentQuestionNumber === 10) {
        await service.finishGame(room.roomId, uid)
        navigate(`/result/${room.roomId}`)
      } else {
        const cutscene = {
          cityYear: room.gameCycle * 10 + room.currentQuestionNumber,
          phase: 'entering' as const,
        }
        const changedLocations = finalizedRound
          ? Object.entries(finalizedRound.locationSummaries)
              .filter(([, summary]) => summary.scoreAverage !== 0)
              .map(([locationId]) => locationId as LocationId)
          : []
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const timing = reducedMotion
          ? { darken: 80, title: 300, textFade: 80, reveal: 80, highlight: 250 }
          : { darken: 600, title: 1_700, textFade: 700, reveal: 700, highlight: 800 }
        setYearCutscene(cutscene)
        await waitForCutscene(timing.darken)
        if (!boundaryIsCurrent()) return
        setVisualCityLevel(room.cityLevel)
        setYearCutscene({ ...cutscene, phase: 'holding' })
        let nextQuestionError: unknown
        let buildingStories: BuildingChangeStory[] = []
        try {
          const [nextRoom] = await Promise.all([
            service.openNextQuestion(room.roomId, uid),
            waitForCutscene(timing.title),
          ])
          if (!boundaryIsCurrent()) return
          const previousLevels = normalizeBuildingLevels(visualBuildingLevels ?? room.buildingLevels)
          const nextLevels = normalizeBuildingLevels(nextRoom.buildingLevels)
          setVisualCityLevel(nextRoom.cityLevel)
          setVisualBuildingLevels(nextLevels)
          buildingStories = BUILDING_IDS.flatMap((buildingId) => {
            const direction = nextLevels[buildingId] > previousLevels[buildingId]
              ? 'improved'
              : nextLevels[buildingId] < previousLevels[buildingId]
                ? 'declined'
                : null
            return direction ? [{
              buildingId,
              locationId: BUILDING_LOCATION[buildingId],
              label: BUILDING_STORY_LABELS[buildingId],
              direction,
            } satisfies BuildingChangeStory] : []
          })
        } catch (reason) {
          nextQuestionError = reason
        }
        setYearCutscene({ ...cutscene, phase: 'text-leaving' })
        await waitForCutscene(timing.textFade)
        if (!boundaryIsCurrent()) return
        setYearCutscene({ ...cutscene, phase: 'leaving' })
        await waitForCutscene(timing.reveal)
        if (!boundaryIsCurrent()) return
        setYearCutscene(null)
        if (nextQuestionError) throw nextQuestionError
        for (const story of buildingStories) {
          if (!boundaryIsCurrent()) return
          setBuildingChangeStory(story)
          await waitForCutscene(reducedMotion ? 250 : 850)
        }
        if (!boundaryIsCurrent()) return
        setBuildingChangeStory(null)
        setCityRevealLocations(changedLocations)
        await waitForCutscene(timing.highlight)
        if (!boundaryIsCurrent()) return
        setCityRevealLocations([])
      }
    } catch (reason) {
      setActionError(classroomFriendlyError(reason))
    } finally {
      setBusy(false)
    }
  }

  const endCurrentActivity = async (): Promise<void> => {
    if (!roomId || !window.confirm('ยุติห้องนี้ใช่ไหม? รหัสห้องเดิมจะใช้ต่อไม่ได้ และครูจะกลับไปสร้างห้องใหม่ทันที')) return
    setBusy(true)
    setActionError('')
    try {
      // A restored browser session can point at a room owned by an older
      // anonymous Firebase identity. Detach that stale room locally instead
      // of leaving the teacher trapped behind an action they cannot perform.
      if (room && room.status !== 'finished' && room.teacherSessionId === uid) {
        await service.endActivity(room.roomId, uid)
      }
      clearTeacherSnapshot(roomId)
      clearClassroomTeacherSession()
      resetRoomTransientState()
      setTrustedSnapshot(null)
      setRoomId('')
      setActionMessage('ยุติห้องเดิมแล้ว สามารถสร้างห้องใหม่ได้ทันที')
      navigate('/teacher', { replace: true })
    } catch (reason) {
      setActionError(classroomFriendlyError(reason))
    } finally {
      setBusy(false)
    }
  }

  const resetTeacherRoom = (): void => {
    if (!window.confirm('รีเซ็ตห้องและล้างข้อมูลห้องเก่าที่ค้างบนเครื่องนี้ใช่ไหม? ห้องปัจจุบันจะถูกยุติและครูจะกลับไปสร้างห้องใหม่ทันที')) return
    const staleRoomId = roomId || getClassroomTeacherSession()?.roomId || ''
    setBusy(true)
    setActionError('')
    if (staleRoomId) {
      // End the Firestore room on a best-effort basis, but never make a broken
      // or expired old session block the local recovery button.
      void refreshSession()
        .then((activeUid) => service.endActivity(staleRoomId, activeUid))
        .catch(() => undefined)
    }
    clearAllTeacherSnapshots()
    clearClassroomTeacherSession()
    resetRoomTransientState()
    setTrustedSnapshot(null)
    setRestoringStoredRoom(false)
    setRoomId('')
    teacherSoundtrackRef.current?.stop()
    setBusy(false)
    navigate('/teacher', { replace: true })
  }

  const copyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(joinLink)
      setActionMessage('คัดลอกลิงก์แล้ว')
    } catch {
      setActionMessage('เลือกและคัดลอกลิงก์ด้านล่างได้เลย')
    }
  }

  if (isStandaloneLayoutMode) {
    return (
      <>
        <TeacherSoundtrack mode="off" ref={teacherSoundtrackRef} />
        <CityStage
          answerCount={0}
          remainingSeconds={0}
          room={STANDALONE_LAYOUT_ROOM}
          visualCityLevel={STANDALONE_LAYOUT_ROOM.cityLevel}
          visualBuildingLevels={STANDALONE_LAYOUT_ROOM.buildingLevels}
          roundImpact={null}
          locationImpacts={null}
        />
      </>
    )
  }

  if (restoringStoredRoom) {
    return <CityLoader variant="full" message="กำลังตรวจสอบห้องเรียนล่าสุด..." />
  }

  if (room?.currentCrisisEventId && ['crisis-intro', 'crisis-playing', 'crisis-result'].includes(room.status)) {
    const event = getCrisisEvent(room.currentCrisisEventId)
    const result = currentCrisisResult
    const integrityPercent = result && room.lockedPlayerCount ? Math.round(result.integrityCount / room.lockedPlayerCount * 100) : 0
    const corruptionPercent = result && room.lockedPlayerCount ? Math.round(result.corruptionCount / room.lockedPlayerCount * 100) : 0
    const timeoutPercent = result && room.lockedPlayerCount ? Math.round(result.timeoutCount / room.lockedPlayerCount * 100) : 0
    const beginEvent = async (): Promise<void> => { setBusy(true); setActionError(''); try { await service.beginCrisisEvent(room.roomId, uid) } catch (reason) { setActionError(classroomFriendlyError(reason)) } finally { setBusy(false) } }
    const continueAfterEvent = async (): Promise<void> => { setBusy(true); setActionError(''); try { await service.openNextQuestion(room.roomId, uid) } catch (reason) { setActionError(classroomFriendlyError(reason)) } finally { setBusy(false) } }
    return (
      <>
      <TeacherSoundtrack mode={teacherSoundtrackMode} ref={teacherSoundtrackRef} />
      <main className={`teacher-crisis-page teacher-crisis-page--${room.status}`}>
        <div className="teacher-crisis-city" aria-hidden="true"><CityScene buildingLevels={room.buildingLevels} cityLevel={room.cityLevel} /></div>
        <section className="teacher-crisis-panel">
          <p className="teacher-crisis-eyebrow">เหตุการณ์วิกฤตเมือง {event.index}/2</p>
          <h1>{event.title}</h1>
          <p className="teacher-crisis-subtitle">{event.subtitle}</p>
          {room.status === 'crisis-intro' ? (
            <div className="teacher-crisis-intro"><span aria-hidden="true">⚠️</span><p>{event.situation}</p><strong>แต่ละอาชีพจะได้รับสถานการณ์ตัดสินใจที่ต่างกัน</strong></div>
          ) : null}
          {room.status === 'crisis-playing' ? (
            <div className="teacher-crisis-live">
              <div><span>ผู้ตอบแล้ว</span><strong>{crisisAnswerCount} / {room.lockedPlayerCount}</strong></div>
              <div className={remaining <= 5 ? 'is-ending' : ''}><span>เวลาที่เหลือ</span><strong>{remaining} วินาที</strong></div>
              <div className="teacher-crisis-progress"><i style={{ width: `${room.lockedPlayerCount ? crisisAnswerCount / room.lockedPlayerCount * 100 : 0}%` }} /></div>
              <p>หน้าครูจะแสดงเฉพาะจำนวนผู้ตอบ ไม่เปิดเผยคำตอบรายบุคคล</p>
            </div>
          ) : null}
          {room.status === 'crisis-result' && result ? (
            <div className="teacher-crisis-result">
              <div className="teacher-crisis-result__counts">
                <article className="is-integrity"><span>สุจริต</span><strong>{result.integrityCount} คน</strong><small>{integrityPercent}%</small></article>
                <article className="is-corruption"><span>ทุจริต</span><strong>{result.corruptionCount} คน</strong><small>{corruptionPercent}%</small></article>
                <article className="is-timeout"><span>ไม่ตอบ</span><strong>{result.timeoutCount} คน</strong><small>{timeoutPercent}%</small></article>
              </div>
              <div className="teacher-crisis-score-flow"><span>ก่อนวิกฤต<strong>{Math.round(result.previousCityScore)}</strong></span><b>{result.eventAverage >= 0 ? '+' : ''}{Math.round(result.eventAverage)}</b><span>หลังวิกฤต<strong>{Math.round(result.newCityScore)}</strong></span></div>
              <p className="teacher-crisis-conclusion">{getCrisisConclusion(result.eventAverage)}</p>
            </div>
          ) : null}
          {actionError ? <p className="teacher-crisis-error">{actionError}</p> : null}
          <div className="teacher-crisis-actions">
            {room.status === 'crisis-intro' ? <button disabled={busy} onClick={() => void beginEvent()}>เริ่มเหตุการณ์วิกฤต</button> : null}
            {room.status === 'crisis-playing' ? <button disabled={busy || closingRef.current} onClick={() => void closeCurrentCrisis()}>ปิดรับและสรุปผล</button> : null}
            {room.status === 'crisis-result' ? <button disabled={busy || !result} onClick={() => void continueAfterEvent()}>เข้าสู่คำถามข้อ {room.currentQuestionNumber + 1}</button> : null}
            <button className="is-end" disabled={busy} onClick={() => void endCurrentActivity()}>จบกิจกรรม</button>
          </div>
        </section>
      </main>
      </>
    )
  }

  if (room && (room.status === 'playing' || room.status === 'round-result')) {
    const missingTrusted = !trustedSnapshot
    return (
      <>
        <CityStage
        answerCount={answerCount}
        remainingSeconds={remaining}
        room={room}
        previewCityScore={liveCityScore}
        visualCityLevel={visualCityLevel ?? room.cityLevel}
        visualBuildingLevels={visualBuildingLevels ?? normalizeBuildingLevels(room.buildingLevels)}
        roundImpact={currentRound?.roundAverage ?? null}
        locationImpacts={latestRound?.locationSummaries ?? null}
        roundHistory={roundsState.data}
        utilityControls={<TeacherSoundtrack mode={teacherSoundtrackMode} ref={teacherSoundtrackRef} />}
        controls={
          <>
            <button
              className="city-stage__action-button city-stage__action-button--close"
              disabled={room.status !== 'playing' || missingTrusted || closingRef.current}
              onClick={() => void closeCurrentQuestion()}
              title={room.status === 'playing' ? 'ปิดรับคำตอบและสรุปผลรอบปัจจุบัน' : 'รอบปัจจุบันปิดแล้ว'}
            >
              <span aria-hidden="true">■</span> จบรอบ
            </button>
            {canAdvanceQuestion ? (
              <button
                className="city-stage__action-button city-stage__action-button--next"
                disabled={busy || missingTrusted}
                onClick={() => void nextOrFinish()}
              >
                <span aria-hidden="true">{room.currentQuestionNumber === 10 ? '▣' : '▶'}</span>
                {room.currentQuestionNumber === 10 ? ' ดูสรุปชุด' : ' ข้อถัดไป'}
              </button>
            ) : null}
            <button
              className="city-stage__action-button city-stage__action-button--continue"
              disabled
              title="ใช้ได้จากหน้าสรุปหลังเล่นครบ 10 ข้อ โดยคงคะแนนเมืองเดิม"
            >
              <span aria-hidden="true">↻</span> เล่นต่อชุดใหม่
            </button>
            <button
              className="city-stage__action-button city-stage__action-button--end"
              disabled={busy}
              onClick={() => void endCurrentActivity()}
              title="จบห้องปัจจุบันแล้วกลับไปสร้างห้องใหม่"
            >
              <span aria-hidden="true">■</span> จบกิจกรรม
            </button>
          </>
        }
      >
        {missingTrusted ? (
          <div className="mx-auto max-w-2xl rounded-2xl border border-red-300/40 bg-red-950/90 p-5 text-center text-lg font-bold">
            ไม่พบข้อมูลตรวจคำตอบที่บันทึกไว้ในเครื่องครู เครื่องนี้จึงไม่สามารถสรุปคำตอบต่อได้ กรุณากลับมาใช้เครื่องเดิม
          </div>
        ) : null}
        {liveAnswerImpacts.length > 0 ? <LiveAnswerImpacts impacts={liveAnswerImpacts} /> : null}
        {actionError ? <p className="mx-auto mt-3 max-w-xl rounded-xl bg-red-950/85 px-4 py-3 text-center">{actionError}</p> : null}
        </CityStage>
        {yearCutscene ? (
          <div
            className={`teacher-year-cutscene teacher-year-cutscene--${yearCutscene.phase}`}
            role="status"
            aria-live="assertive"
          >
            <div className="teacher-year-cutscene__content">
              <p className="teacher-year-cutscene__eyebrow">1 ปีต่อมา...</p>
              <h2>ปีที่ {yearCutscene.cityYear}</h2>
              <div className="teacher-year-cutscene__line" aria-hidden="true" />
              <p className="teacher-year-cutscene__year">เมืองก้าวเข้าสู่ช่วงเวลาใหม่</p>
              <p className="teacher-year-cutscene__narrative">
                การตัดสินใจของประชาชน<br />กำลังเปลี่ยนแปลงเมือง
              </p>
            </div>
          </div>
        ) : null}
        {cityRevealLocations.length > 0 ? (
          <div className="teacher-city-reveal" aria-hidden="true">
            {cityRevealLocations.map((locationId) => (
              <span
                className="teacher-city-reveal__glow"
                key={locationId}
                style={{
                  '--location-x': `${LOCATION_POSITIONS[locationId].x}%`,
                  '--location-y': `${LOCATION_POSITIONS[locationId].y}%`,
                } as React.CSSProperties}
              />
            ))}
          </div>
        ) : null}
        {buildingChangeStory ? (
          <aside
            className={`teacher-building-story teacher-building-story--${buildingChangeStory.direction}`}
            role="status"
            aria-live="assertive"
          >
            <span aria-hidden="true">{buildingChangeStory.direction === 'improved' ? '🌱' : '⚠️'}</span>
            <div>
              <strong>{buildingChangeStory.label}{buildingChangeStory.direction === 'improved' ? 'ได้รับการพัฒนา' : 'กำลังเสื่อมโทรม'}</strong>
              <p>
                {buildingChangeStory.direction === 'improved'
                  ? 'ความสุจริตและความร่วมมือของคนในเมือง ทำให้อาคารได้รับการดูแล ปรับปรุง และพัฒนาให้ดีขึ้น'
                  : 'การทุจริตที่เกิดขึ้นบ่อยครั้งทำให้งบประมาณและการดูแลสูญหาย อาคารจึงถูกปล่อยปละละเลยและทรุดโทรมตามกาลเวลา'}
              </p>
            </div>
          </aside>
        ) : null}
      </>
    )
  }

  const participantCount = playersState.data.length
  const classroomCapacity = 40
  const roomReady = participantCount > 0

  return (
    <>
    <main className="teacher-lobby-page">
      {roomId && room?.status === 'lobby' ? (
        <div className="teacher-lobby-birds"><CityBirdsAnimation /></div>
      ) : null}
      <header className="teacher-lobby-header">
        <Link className="teacher-lobby-brand" to="/" aria-label="Our City, Our Choice หน้าหลัก">
          <span className="teacher-lobby-brand__mark" aria-hidden="true">🏙️</span>
          <span><strong>OUR CITY<br />OUR CHOICE</strong><small>เมืองนี้...อยู่ที่เรา</small></span>
        </Link>
        <div className="teacher-lobby-title">
          <h1>เตรียมเมืองสำหรับชั้นเรียน</h1>
          <p>ทำความรู้จัก 8 อาชีพ แล้วร่วมกันสร้างเมืองที่โปร่งใส ไร้ทุจริต</p>
        </div>
        <TeacherSoundtrack mode={teacherSoundtrackMode} ref={teacherSoundtrackRef} />
        <Link className="teacher-lobby-home" to="/"><span aria-hidden="true">⌂</span> หน้าหลัก</Link>
      </header>

      <div className="teacher-lobby-layout">
        <section className="teacher-lobby-roles teacher-lobby-roster" aria-labelledby="lobby-roster-title">
          <div className="teacher-lobby-section-heading">
            <div>
              <p className="teacher-lobby-kicker">สมาชิกของเมือง</p>
              <h2 id="lobby-roster-title">รายชื่อนักเรียน</h2>
              <p>เรียงตามเลขที่และชั้นเรียน พร้อมเริ่มกิจกรรมไปด้วยกัน</p>
            </div>
            <strong className="teacher-lobby-roster-count"><span>{participantCount}</span> / {classroomCapacity} คน</strong>
          </div>
          {playersState.data.length > 0 ? (
            <ol className="teacher-lobby-roster-grid">
              {playersState.data.map((player, index) => (
                <li className="teacher-lobby-student-card" key={player.playerId}>
                  <span className="teacher-lobby-student-card__number" aria-label={`ลำดับ ${index + 1}`}>{index + 1}</span>
                  <span className="teacher-lobby-student-card__avatar" aria-hidden="true">{player.nickname.trim().charAt(0).toUpperCase() || 'น'}</span>
                  <span className="teacher-lobby-student-card__identity">
                    <strong title={player.nickname}>{player.nickname}</strong>
                    <small>ชั้น {player.classSection ?? '–'} · เลขที่ {player.studentNumber ?? '–'}</small>
                  </span>
                  <span className="teacher-lobby-student-card__ready"><i aria-hidden="true" />พร้อม</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="teacher-lobby-roster-empty">
              <span aria-hidden="true">👥</span>
              <strong>{roomId ? 'กำลังรอนักเรียนเข้าห้อง' : 'สร้างห้องเพื่อรับนักเรียน'}</strong>
              <p>{roomId ? 'สแกน QR หรือส่งลิงก์ให้นักเรียน รายชื่อจะปรากฏตรงนี้ทันที' : 'เมื่อสร้างห้องแล้ว นักเรียนที่เข้าร่วมจะแสดงเรียงอย่างเป็นระเบียบตรงนี้'}</p>
            </div>
          )}
          <div className="teacher-lobby-roster-note"><span aria-hidden="true">✓</span><p><strong>รองรับนักเรียน 40 คน</strong> รายชื่ออัปเดตอัตโนมัติแบบเรียลไทม์</p></div>
        </section>

        <section className="teacher-lobby-control" aria-label="จัดการห้องเรียน">
          {!roomId ? (
            <div className="teacher-lobby-create-card">
              <span className="teacher-lobby-create-card__icon" aria-hidden="true">⚙️</span>
              <p className="teacher-lobby-kicker">ตั้งค่าห้องเรียน</p>
              <h2>สร้างห้องใหม่</h2>
              <p>กำหนดเวลาตอบของแต่ละคำถาม แล้วระบบจะสร้างรหัสห้องให้ทันที</p>
              <label className="teacher-lobby-duration-field">
                <span>เวลาต่อคำถาม</span>
                <div><input min={1} onChange={(event) => setQuestionDurationSec(Number(event.target.value))} step={1} type="number" value={questionDurationSec} /><b>วินาที</b></div>
              </label>
              <button className="teacher-lobby-primary-button" disabled={busy || sheetStatus !== 'ready' || !Number.isInteger(questionDurationSec) || questionDurationSec <= 0} onClick={() => void createRoom()}>
                <span aria-hidden="true">▶</span> สร้างห้อง
              </button>
              <button className="teacher-lobby-reset-room-button" disabled={busy} onClick={resetTeacherRoom} type="button">
                <span aria-hidden="true">↺</span> รีเซ็ตข้อมูลห้องเก่า
              </button>
            </div>
          ) : (
            <>
              <div className="teacher-lobby-room-card">
                <JoinQrCode joinUrl={joinLink} roomId={roomId} />
                <div className="teacher-lobby-share-row"><span>{joinLink.replace(/^https?:\/\//, '')}</span><button onClick={() => void copyLink()} type="button">คัดลอก</button></div>
                <p className="teacher-lobby-action-message" aria-live="polite">{actionMessage}</p>
              </div>

              <div className="teacher-lobby-summary">
                <div><span className="teacher-lobby-summary__icon" aria-hidden="true">👥</span><p>ผู้เข้าร่วม<strong>{participantCount} / {classroomCapacity} <small>คน</small></strong></p></div>
                <div><span className="teacher-lobby-summary__icon" aria-hidden="true">⏱</span><p>เวลาต่อคำถาม<strong>{room?.questionDurationSec ?? questionDurationSec} <small>วินาที</small></strong></p></div>
                <div className={roomReady ? 'is-ready' : 'is-waiting'}><span className="teacher-lobby-summary__icon" aria-hidden="true">{roomReady ? '✓' : '…'}</span><p>สถานะห้อง<strong>{roomReady ? 'พร้อมเริ่มเกม' : 'รอผู้เล่น'}</strong></p></div>
              </div>

              <div className="teacher-lobby-role-guide">
                <div className="teacher-lobby-card-heading"><div><strong>8 อาชีพในเมือง</strong><p>ระบบจะสุ่มและกระจายบทบาทให้สมดุล</p></div><span aria-hidden="true">⚄</span></div>
                <div className="teacher-lobby-role-guide__grid">
                  {ROLES.map((role) => (
                    <article className={`teacher-lobby-role-guide__item teacher-lobby-role-guide__item--${role.id}`} key={role.id}>
                      <span aria-hidden="true">{ROLE_ICONS[role.id]}</span>
                      <div><strong>{role.label}</strong><p>{ROLE_CIVIC_GUIDANCE[role.id].influence}</p></div>
                    </article>
                  ))}
                </div>
              </div>

              <button
                aria-haspopup="dialog"
                className="teacher-lobby-rules-button"
                onClick={() => setIsLobbyRulesOpen(true)}
                type="button"
              >
                <span aria-hidden="true">📋</span>
                <span><strong>กติกาการสร้างเมือง</strong><small>แตะเพื่อดูกติกาทั้งหมด</small></span>
                <b aria-hidden="true">›</b>
              </button>

              {sheetStatus === 'error' ? <div className="teacher-lobby-error"><p>{sheetError}</p><button onClick={() => void loadQuestions()}>ลองโหลดข้อมูลอีกครั้ง</button></div> : null}
              <button className="teacher-lobby-primary-button teacher-lobby-primary-button--start" disabled={busy || participantCount === 0 || sheetStatus !== 'ready' || room?.status !== 'lobby'} onClick={() => void startGame()}>
                <span aria-hidden="true">▶</span> เริ่มเกม
                <small>{participantCount === 0 ? 'รอให้นักเรียนเข้าห้องก่อน' : 'เริ่มสร้างเมืองของเรากันเลย!'}</small>
              </button>
              <div className="teacher-lobby-secondary-actions">
                <button aria-label="ยุติห้องและสร้างห้องใหม่" className="teacher-lobby-new-room-button" disabled={busy} onClick={() => void endCurrentActivity()} type="button"><span aria-hidden="true">⚙</span> สร้างห้องใหม่</button>
                <button className="teacher-lobby-reset-room-button" disabled={busy} onClick={resetTeacherRoom} type="button"><span aria-hidden="true">↺</span> รีเซ็ตห้อง</button>
              </div>
            </>
          )}
          {actionError || roomState.error || playersState.error ? <p className="teacher-lobby-error">{actionError || roomState.error || playersState.error}</p> : null}
        </section>
      </div>
      {isLobbyRulesOpen ? (
        <div
          className="teacher-lobby-rules-modal"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsLobbyRulesOpen(false)
          }}
          role="presentation"
        >
          <section aria-labelledby="teacher-lobby-rules-title" aria-modal="true" className="teacher-lobby-rules-dialog" role="dialog">
            <header>
              <span aria-hidden="true">📋</span>
              <div><small>OUR CITY, OUR CHOICE</small><h2 id="teacher-lobby-rules-title">กติกาการสร้างเมือง</h2></div>
              <button aria-label="ปิดกติกา" onClick={() => setIsLobbyRulesOpen(false)} type="button">×</button>
            </header>
            <p className="teacher-lobby-rules-dialog__intro">การตัดสินใจของทุกคนส่งผลต่ออาคารและเปลี่ยนทิศทางของเมือง</p>
            <ol>
              {LOBBY_GAME_RULES.map((rule, index) => <li key={rule}><span>{index + 1}</span><p>{rule}</p></li>)}
            </ol>
            <button className="teacher-lobby-rules-dialog__close" onClick={() => setIsLobbyRulesOpen(false)} type="button">เข้าใจแล้ว</button>
          </section>
        </div>
      ) : null}
    </main>
    </>
  )
}
