import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CityStage } from '../components/CityStage'
import { CityScene } from '../components/CityScene'
import { CityBirdsAnimation } from '../components/CityBirdsAnimation'
import { CityLoader } from '../components/CityLoader'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { createClassroomJoinUrl, LOCATION_POSITIONS } from '../components/classroomUi'
import { FullscreenToggle } from '../components/FullscreenToggle'
import { JoinQrCode } from '../components/JoinQrCode'
import { LiveAnswerImpacts } from '../components/LiveAnswerImpacts'
import { TeacherSoundtrack, type TeacherSoundtrackHandle, type TeacherSoundtrackMode } from '../components/TeacherSoundtrack'
import { TeacherEmergencyEndControl } from '../components/TeacherEmergencyEndControl'
import { useGame } from '../context/GameContext'
import { countAnswersForQuestion, countCompletedPreAssessments, countCrisisAnswersForEvent, getLiveCityScore, shouldAutoCloseCrisis, shouldCloseQuestion } from '../domain/classroomGameLoop'
import { createRoomQuestionSnapshot, type ParsedQuestionSheet, type RoomQuestionSnapshot } from '../domain/classroomQuestions'
import type { LocationId } from '../domain/cityScoring'
import { deriveBuildingLevelTransitions, getCrisisPresentationTiming, getNormalPresentationTiming, LIVE_ANSWER_IMPACT_DURATION_MS, resolvePostPresentationAction, resolveTeacherRoundProgressionAction, type BuildingTransitionDirection } from '../domain/cityPresentation'
import { resolveLiveAnswerImpact, type LiveAnswerImpact } from '../domain/liveAnswerImpact'
import { ROLE_CIVIC_GUIDANCE, ROLES, type RoleId } from '../domain/ourCity'
import { BUILDING_IDS, BUILDING_LOCATION, INITIAL_BUILDING_LEVELS, normalizeBuildingLevels, type BuildingId, type BuildingLevels } from '../domain/cityBuildings'
import { useAnswers, useCrisisResults, usePlayers, usePreAssessments, useRoom, useRounds } from '../hooks/useGameData'
import { useCountdown } from '../hooks/useCountdown'
import { enterFullscreenSafely } from '../hooks/useFullscreen'
import { useSoundEffectOnce, useSoundLoop } from '../hooks/useSoundPack'
import { selectCutsceneSound, shouldDuckTeacherBgm, soundPackController } from '../lib/soundPack'
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
// TEMPORARY DIAGNOSTIC — remove alongside src/debug when done
import { debugLog, isDebugMode } from '../debug/useDebugLog'
// DIAGNOSTIC FLIGHT RECORDER — opt-in via ?debug=2, see src/debug/flightRecorder.ts
import {
  checkRealtimeGap,
  CRISIS_AUTOCLOSE_GRACE_MS,
  getLastActionResult,
  getSnapshotAgeMs,
  isCrisisAutocloseBlocked,
  isFlightRecorderEnabled,
  isNormalAdvanceBlocked,
  NORMAL_ADVANCE_GRACE_MS,
  publishTeacherDiagnosticSnapshot,
  record,
  recordAnomalyOnce,
  SNAPSHOT_MISSING_GRACE_MS,
  withActionTiming,
} from '../debug/flightRecorder'

type SheetStatus = 'loading' | 'ready' | 'error'
type YearCutscenePhase = 'entering' | 'holding' | 'text-leaving' | 'leaving'
type CrisisRevealPhase = 'holding' | 'resolving' | 'revealing' | 'revealed'

interface YearCutsceneState {
  cityYear: number
  phase: YearCutscenePhase
  transitionId: string
}

interface BuildingChangeStory {
  buildingId: BuildingId
  locationId: LocationId
  label: string
  direction: BuildingTransitionDirection
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

const sameBuildingLevels = (left: BuildingLevels | null, right: BuildingLevels): boolean =>
  left !== null && BUILDING_IDS.every((buildingId) => left[buildingId] === right[buildingId])

const toBuildingChangeStories = (
  previousLevels: BuildingLevels,
  nextLevels: BuildingLevels,
): BuildingChangeStory[] => deriveBuildingLevelTransitions(previousLevels, nextLevels).map((transition) => ({
  ...transition,
  locationId: BUILDING_LOCATION[transition.buildingId],
  label: BUILDING_STORY_LABELS[transition.buildingId],
}))

const toBuildingTransitionMap = (
  stories: readonly BuildingChangeStory[],
): Partial<Record<BuildingId, BuildingTransitionDirection>> => Object.fromEntries(
  stories.map((story) => [story.buildingId, story.direction]),
) as Partial<Record<BuildingId, BuildingTransitionDirection>>

const BuildingChangeSummary = ({
  stories,
  crisis = false,
}: {
  stories: readonly BuildingChangeStory[]
  crisis?: boolean
}) => stories.length > 0 ? (
  <aside
    className={`teacher-building-story teacher-building-story--grouped${crisis ? ' teacher-building-story--crisis' : ''}`}
    role="status"
    aria-live="assertive"
  >
    <span aria-hidden="true">🏙️</span>
    <ul>
      {stories.map((story) => (
        <li className={`is-${story.direction}`} key={story.buildingId}>
          <strong>{story.label}</strong>
          <small>{story.direction === 'improved' ? 'ได้รับการพัฒนา' : 'กำลังเสื่อมโทรม'}</small>
        </li>
      ))}
    </ul>
  </aside>
) : null

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
  preAssessmentOpened: false,
  createdAt: 0,
  updatedAt: 0,
}

const LOBBY_GAME_RULES = [
  'ระบบสุ่มให้นักเรียนคนละ 1 ใน 8 อาชีพอย่างสมดุล',
  'แต่ละรอบมีคำถามปกติ 10 ข้อ และเหตุการณ์วิกฤตเมือง 2 ครั้งหลังข้อ 4 และข้อ 8',
  'ทุกคำตอบส่งผลต่อคะแนนของอาคารที่เกี่ยวข้อง',
  'คะแนนอาคารและเมืองคำนวณจากค่าเฉลี่ยคำตอบของทั้งห้อง',
  'เมื่อจบรอบ นักเรียนสามารถเปลี่ยนอาชีพเพื่อเรียนรู้ครบทั้ง 8 บทบาท',
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
  const [buildingTransitions, setBuildingTransitions] = useState<Partial<Record<BuildingId, BuildingTransitionDirection>>>({})
  const [buildingChangeStories, setBuildingChangeStories] = useState<BuildingChangeStory[]>([])
  const [crisisRevealPhase, setCrisisRevealPhase] = useState<CrisisRevealPhase | null>(null)
  const [liveAnswerImpacts, setLiveAnswerImpacts] = useState<LiveAnswerImpact[]>([])
  const [restoringStoredRoom, setRestoringStoredRoom] = useState(Boolean(storedSession?.roomId))
  const [isHardRecoveryDialogOpen, setIsHardRecoveryDialogOpen] = useState(false)
  const [isPreAssessmentIncompleteDialogOpen, setIsPreAssessmentIncompleteDialogOpen] = useState(false)
  const [roundCheckpointReadyKey, setRoundCheckpointReadyKey] = useState('')
  const closingRef = useRef(false)
  const roomBoundaryRef = useRef(0)
  const seenAnswerIdsRef = useRef(new Set<string>())
  const liveImpactTrackingReadyRef = useRef(false)
  const liveImpactTimersRef = useRef(new Map<string, number>())
  const presentationTimersRef = useRef(new Map<number, () => void>())
  const presentationRunRef = useRef(0)
  const roomRef = useRef<ClassroomRoom | null>(null)
  const visualCityLevelRef = useRef<ClassroomRoom['cityLevel'] | null>(null)
  const visualBuildingLevelsRef = useRef<BuildingLevels | null>(null)
  const teacherSoundtrackRef = useRef<TeacherSoundtrackHandle>(null)
  // DIAGNOSTIC FLIGHT RECORDER — opt-in via ?debug=2, see src/debug/flightRecorder.ts
  const progressionFingerprintRef = useRef('')
  const previousRemainingRef = useRef(0)

  const cancelPresentationTimers = useCallback((): void => {
    presentationRunRef.current += 1
    for (const [timer, resolve] of presentationTimersRef.current) {
      window.clearTimeout(timer)
      resolve()
    }
    presentationTimersRef.current.clear()
  }, [])

  const waitForPresentation = useCallback((durationMs: number): Promise<void> => new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      presentationTimersRef.current.delete(timer)
      resolve()
    }, durationMs)
    presentationTimersRef.current.set(timer, resolve)
  }), [])

  const resetRoomTransientState = useCallback((): void => {
    roomBoundaryRef.current += 1
    cancelPresentationTimers()
    visualCityLevelRef.current = null
    visualBuildingLevelsRef.current = null
    setVisualCityLevel(null)
    setVisualBuildingLevels(null)
    setYearCutscene(null)
    setBuildingTransitions({})
    setBuildingChangeStories([])
    setCrisisRevealPhase(null)
    setLiveAnswerImpacts([])
    setActionError('')
    setActionMessage('')
    setIsLobbyRulesOpen(false)
    setIsHardRecoveryDialogOpen(false)
    setIsPreAssessmentIncompleteDialogOpen(false)
    closingRef.current = false
    seenAnswerIdsRef.current.clear()
    liveImpactTrackingReadyRef.current = false
    for (const timer of liveImpactTimersRef.current.values()) window.clearTimeout(timer)
    liveImpactTimersRef.current.clear()
  }, [cancelPresentationTimers])

  // Calibration mode never subscribes to a real room, so it never touches Firebase/Demo state.
  const subscribedRoomId = isStandaloneLayoutMode ? '' : roomId
  const roomState = useRoom(subscribedRoomId)
  const playersState = usePlayers(subscribedRoomId)
  const answersState = useAnswers(subscribedRoomId)
  const roundsState = useRounds(subscribedRoomId)
  const crisisResultsState = useCrisisResults(subscribedRoomId)
  const room = roomState.data
  const crisisAlertTrigger = room?.status === 'crisis-intro' && room.currentCrisisEventId
    ? `${room.roomId}:${room.gameCycle}:${room.currentCrisisEventId}`
    : null
  const teacherBgmDucked = shouldDuckTeacherBgm(room?.status, yearCutscene !== null)
  useSoundEffectOnce('alertCrisis', crisisAlertTrigger)
  useSoundLoop('cutscene', selectCutsceneSound(yearCutscene?.phase))
  useEffect(() => {
    teacherSoundtrackRef.current?.setDucked(teacherBgmDucked)
  }, [teacherBgmDucked])
  roomRef.current = room
  visualCityLevelRef.current = visualCityLevel
  visualBuildingLevelsRef.current = visualBuildingLevels
  const preAssessmentListenerEnabled = room?.status === 'lobby' && room.preAssessmentOpened === true
  const preAssessmentsState = usePreAssessments(subscribedRoomId, preAssessmentListenerEnabled)
  const completedPreAssessmentCount = countCompletedPreAssessments(playersState.data, preAssessmentsState.data)
  const completedPreAssessmentPlayerIds = useMemo(
    () => new Set(preAssessmentsState.data.map((assessment) => assessment.playerId)),
    [preAssessmentsState.data],
  )
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
    ? countCrisisAnswersForEvent(answersState.data, room.gameCycle, room.currentCrisisEventId)
    : 0
  const currentCrisisResult = room && room.currentCrisisEventIndex > 0
    ? crisisResultsState.data.find((result) => result.gameCycle === room.gameCycle && result.eventIndex === room.currentCrisisEventIndex) ?? null
    : null
  const currentRound = room
    ? roundsState.data.find((round) => round.gameCycle === room.gameCycle && round.questionNumber === room.currentQuestionNumber) ?? null
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

  // TEMPORARY DIAGNOSTIC — track key Teacher-side derived values on each render
  useEffect(() => {
    if (!isDebugMode() || !room) return
    debugLog('teacher', 'answerCount', `${answerCount}/${room.lockedPlayerCount}`)
  }, [answerCount, room])

  useEffect(() => {
    if (!isDebugMode()) return
    debugLog('teacher', 'canAdvance', String(canAdvanceQuestion))
  }, [canAdvanceQuestion])

  useEffect(() => {
    if (!isDebugMode() || !room) return
    debugLog('teacher', 'room render', `status=${room.status} q=${room.currentQuestionNumber} deadline=${room.questionDeadlineAt ?? 'null'}`)
  }, [room?.status, room?.currentQuestionNumber, room?.questionDeadlineAt, room])

  // DIAGNOSTIC FLIGHT RECORDER — section 3: room/progression state telemetry.
  // Logs only on a meaningful change to the tracked fields (fingerprint
  // dedup), never on every render.
  useEffect(() => {
    if (!isFlightRecorderEnabled() || !room) return
    const fingerprint = JSON.stringify([
      room.status, room.currentQuestionNumber, room.gameCycle, room.currentCrisisEventId,
      room.lockedPlayerCount, answerCount, crisisAnswerCount, Boolean(trustedSnapshot),
      Boolean(currentRound), Boolean(currentCrisisResult), canAdvanceQuestion,
    ])
    if (progressionFingerprintRef.current === fingerprint) return
    progressionFingerprintRef.current = fingerprint
    record('teacher', 'PROGRESSION_STATE', {
      roomId: room.roomId,
      gameCycle: room.gameCycle,
      roomStatus: room.status,
      questionNumber: room.currentQuestionNumber,
      crisisEventId: room.currentCrisisEventId,
      details: {
        lockedPlayerCount: room.lockedPlayerCount,
        answerCount,
        crisisAnswerCount,
        trustedSnapshotPresent: Boolean(trustedSnapshot),
        currentRoundPresent: Boolean(currentRound),
        currentCrisisResultPresent: Boolean(currentCrisisResult),
        canAdvanceQuestion,
      },
    })
  }, [room, answerCount, crisisAnswerCount, trustedSnapshot, currentRound, currentCrisisResult, canAdvanceQuestion])

  // DIAGNOSTIC FLIGHT RECORDER — deadline-crossing boundary event, plus a
  // REALTIME_GAP check piggybacked on the same tick (useCountdown already
  // re-renders every 250ms during timed phases; this adds no new timer).
  useEffect(() => {
    if (isFlightRecorderEnabled() && room) {
      if (previousRemainingRef.current > 0 && remaining === 0 && (room.status === 'playing' || room.status === 'crisis-playing')) {
        record('teacher', 'DEADLINE_REACHED', {
          roomId: room.roomId,
          gameCycle: room.gameCycle,
          roomStatus: room.status,
          questionNumber: room.currentQuestionNumber,
          crisisEventId: room.currentCrisisEventId,
        })
      }
      checkRealtimeGap('room', room.roomId)
      checkRealtimeGap('answers', room.roomId)
    }
    previousRemainingRef.current = remaining
  }, [remaining, room])

  // DIAGNOSTIC FLIGHT RECORDER — anomaly A: NORMAL_ADVANCE_BLOCKED. Never
  // auto-fixes or auto-clicks anything; only observes and records.
  useEffect(() => {
    if (!isFlightRecorderEnabled() || !room || room.status !== 'playing' || room.lockedPlayerCount <= 0 || answerCount < room.lockedPlayerCount) return
    const { roomId: currentRoomId, gameCycle, currentQuestionNumber, questionDeadlineAt } = room
    const timer = window.setTimeout(() => {
      if (!isNormalAdvanceBlocked({ roomStatus: room.status, lockedPlayerCount: room.lockedPlayerCount, answerCount, canAdvanceQuestion })) return
      recordAnomalyOnce(`normal-advance-blocked:${currentRoomId}:${gameCycle}:${currentQuestionNumber}`, 'NORMAL_ADVANCE_BLOCKED', {
        roomId: currentRoomId,
        gameCycle,
        roomStatus: room.status,
        questionNumber: currentQuestionNumber,
        details: {
          answerCount,
          lockedPlayerCount: room.lockedPlayerCount,
          trustedSnapshotPresent: Boolean(trustedSnapshot),
          shouldCloseQuestionResult: shouldCloseQuestion(answerCount, room.lockedPlayerCount, questionDeadlineAt),
          canAdvanceQuestion,
          answersListenerAgeMs: getSnapshotAgeMs('answers', currentRoomId),
        },
      })
    }, NORMAL_ADVANCE_GRACE_MS)
    return () => window.clearTimeout(timer)
  }, [room, answerCount, canAdvanceQuestion, trustedSnapshot])

  // DIAGNOSTIC FLIGHT RECORDER — anomaly B: CRISIS_AUTOCLOSE_BLOCKED.
  //
  // Field reconciliation: this effect's own deps are [room, crisisAnswerCount]
  // (no `remaining`), so once those stop changing, the grace-period timer
  // below is scheduled once and fires once - it is a SINGLE point-in-time
  // sample taken CRISIS_AUTOCLOSE_GRACE_MS after the block was first
  // detected, not a continuously live read. A prior report showed this
  // sample as `false` in a run a later review believed had an in-flight
  // close attempt - those are not actually in conflict: `false` here only
  // proves closingRef was unset AT THAT ONE SAMPLED INSTANT, not that no
  // attempt was ever made before or after it. The field is renamed to say
  // exactly that, and paired with the action-timing tracker's status
  // (itself updated live by every real closeCrisisEvent call, independent
  // of this timer), which is a much less ambiguous signal of whether an
  // attempt actually happened.
  useEffect(() => {
    if (!isFlightRecorderEnabled() || !room || room.status !== 'crisis-playing' || room.lockedPlayerCount <= 0 || crisisAnswerCount < room.lockedPlayerCount) return
    const { roomId: currentRoomId, gameCycle, currentCrisisEventIndex, currentCrisisEventId, questionDeadlineAt } = room
    const timer = window.setTimeout(() => {
      if (!isCrisisAutocloseBlocked({ roomStatus: room.status, lockedPlayerCount: room.lockedPlayerCount, crisisAnswerCount })) return
      const closingRefSampledAtDetection = closingRef.current
      const lastCloseAction = getLastActionResult('closeCrisisEvent')
      recordAnomalyOnce(`crisis-autoclose-blocked:${currentRoomId}:${gameCycle}:${currentCrisisEventIndex}`, 'CRISIS_AUTOCLOSE_BLOCKED', {
        roomId: currentRoomId,
        gameCycle,
        roomStatus: room.status,
        crisisEventId: currentCrisisEventId,
        details: {
          crisisAnswerCount,
          lockedPlayerCount: room.lockedPlayerCount,
          eventIndex: currentCrisisEventIndex,
          questionDeadlineAt,
          closingRefSampledAtDetection,
          lastCloseCrisisEventStatus: lastCloseAction?.status ?? 'never-started',
          lastCloseCrisisEventAgeMs: lastCloseAction ? Date.now() - lastCloseAction.ts : null,
          crisisResultsListenerAgeMs: getSnapshotAgeMs('crisisResults', currentRoomId),
        },
      })
    }, CRISIS_AUTOCLOSE_GRACE_MS)
    return () => window.clearTimeout(timer)
  }, [room, crisisAnswerCount])

  // DIAGNOSTIC FLIGHT RECORDER — anomaly C: SNAPSHOT_MISSING.
  useEffect(() => {
    if (!isFlightRecorderEnabled() || !room || room.status !== 'playing' || trustedSnapshot) return
    const { roomId: currentRoomId, gameCycle, currentQuestionNumber } = room
    const timer = window.setTimeout(() => {
      recordAnomalyOnce(`snapshot-missing:${currentRoomId}:${gameCycle}:${currentQuestionNumber}`, 'SNAPSHOT_MISSING', {
        roomId: currentRoomId,
        gameCycle,
        roomStatus: room.status,
        questionNumber: currentQuestionNumber,
        details: { sheetStatus, hasStoredSnapshot: Boolean(restoreTeacherSnapshot(currentRoomId)) },
      })
    }, SNAPSHOT_MISSING_GRACE_MS)
    return () => window.clearTimeout(timer)
  }, [room, trustedSnapshot, sheetStatus])

  // DIAGNOSTIC FLIGHT RECORDER — publishes the compact state the debug
  // panel renders. Cheap object build, guarded so it costs nothing when
  // disabled.
  useEffect(() => {
    if (!isFlightRecorderEnabled()) return
    publishTeacherDiagnosticSnapshot({
      roomId: room?.roomId ?? null,
      roomStatus: room?.status ?? null,
      questionNumber: room?.currentQuestionNumber ?? null,
      gameCycle: room?.gameCycle ?? null,
      crisisEventId: room?.currentCrisisEventId ?? null,
      answerCount,
      lockedPlayerCount: room?.lockedPlayerCount ?? 0,
      crisisAnswerCount,
      trustedSnapshotPresent: Boolean(trustedSnapshot),
      canAdvanceQuestion,
    })
  }, [room, answerCount, crisisAnswerCount, trustedSnapshot, canAdvanceQuestion])

  useEffect(() => {
    resetRoomTransientState()
    setTrustedSnapshot(roomId ? restoreTeacherSnapshot(roomId) : null)
  }, [resetRoomTransientState, roomId])

  useEffect(() => () => {
    cancelPresentationTimers()
    for (const timer of liveImpactTimersRef.current.values()) window.clearTimeout(timer)
  }, [cancelPresentationTimers])

  useEffect(() => {
    if (answersState.loading || !room || !trustedSnapshot) return
    const currentAnswers = answersState.data.filter((answer) =>
      isQuestionAnswerRecord(answer) && answer.gameCycle === room.gameCycle && answer.questionNumber === room.currentQuestionNumber)
    const showImpact = (answer: (typeof currentAnswers)[number], durationMs = LIVE_ANSWER_IMPACT_DURATION_MS): void => {
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
        const remainingDisplayTime = LIVE_ANSWER_IMPACT_DURATION_MS - Math.max(0, now - answer.submittedAt)
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
    if (room?.status === 'game-result' || room?.status === 'finished') navigate(`/result/${room.roomId}`, { replace: true })
  }, [navigate, room])

  useEffect(() => {
    if (!roomId || roomState.identityKey !== roomId || roomState.loading) return
    if (!room || room.teacherSessionId !== uid) {
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
      await withActionTiming('closeQuestion', room.roomId, () => service.closeQuestion(room.roomId, uid, trustedSnapshot))
    } catch (reason) {
      setActionError(classroomFriendlyError(reason))
    } finally {
      closingRef.current = false
    }
  }, [room, service, trustedSnapshot, uid])

  const closeCurrentCrisis = useCallback(async (): Promise<void> => {
    if (!room || room.status !== 'crisis-playing' || closingRef.current) return
    closingRef.current = true; setActionError('')
    const preCrisisLevels = normalizeBuildingLevels(room.buildingLevels)
    visualCityLevelRef.current = room.cityLevel
    visualBuildingLevelsRef.current = preCrisisLevels
    setVisualCityLevel(room.cityLevel)
    setVisualBuildingLevels(preCrisisLevels)
    try { await withActionTiming('closeCrisisEvent', room.roomId, () => service.closeCrisisEvent(room.roomId, uid)) }
    catch (reason) { setActionError(classroomFriendlyError(reason)) }
    finally { closingRef.current = false }
  }, [room, service, uid])

  useEffect(() => {
    if (room?.status === 'crisis-playing' && shouldAutoCloseCrisis(
      crisisAnswerCount,
      room.lockedPlayerCount,
      room.questionStartedAt,
      room.questionDeadlineAt,
    )) void closeCurrentCrisis()
  }, [closeCurrentCrisis, crisisAnswerCount, remaining, room])

  useEffect(() => {
    const isCrisisResult = room?.status === 'crisis-result' && currentCrisisResult !== null
    if (!isCrisisResult) {
      setCrisisRevealPhase(null)
      setBuildingTransitions({})
      setBuildingChangeStories([])
      return
    }

    const run = ++presentationRunRef.current
    const boundary = roomBoundaryRef.current
    const previousLevels = normalizeBuildingLevels(visualBuildingLevelsRef.current ?? room.buildingLevels)
    const nextLevels = normalizeBuildingLevels(room.buildingLevels)
    const stories = toBuildingChangeStories(previousLevels, nextLevels)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timing = getCrisisPresentationTiming(reducedMotion)
    const presentationIsCurrent = (): boolean =>
      presentationRunRef.current === run
      && roomBoundaryRef.current === boundary
      && roomRef.current?.roomId === room.roomId
      && roomRef.current.status === 'crisis-result'

    setCrisisRevealPhase('holding')
    setBuildingTransitions({})
    setBuildingChangeStories([])

    void (async () => {
      await waitForPresentation(timing.preRevealHold)
      if (!presentationIsCurrent()) return
      setCrisisRevealPhase('resolving')
      await waitForPresentation(timing.resolutionCue)
      if (!presentationIsCurrent()) return

      visualCityLevelRef.current = room.cityLevel
      visualBuildingLevelsRef.current = nextLevels
      setVisualCityLevel(room.cityLevel)
      setVisualBuildingLevels(nextLevels)
      setBuildingTransitions(toBuildingTransitionMap(stories))
      setBuildingChangeStories(stories)
      setCrisisRevealPhase('revealing')

      await waitForPresentation(timing.settle)
      if (!presentationIsCurrent()) return
      setBuildingTransitions({})
      setCrisisRevealPhase('revealed')
    })()

    return () => {
      if (presentationRunRef.current === run) cancelPresentationTimers()
    }
  }, [
    cancelPresentationTimers,
    currentCrisisResult,
    room?.buildingLevels,
    room?.cityLevel,
    room?.currentCrisisEventIndex,
    room?.roomId,
    room?.status,
    waitForPresentation,
  ])

  const joinLink = useMemo(
    () => (roomId ? createClassroomJoinUrl(window.location.origin, roomId) : ''),
    [roomId],
  )

  const createRoom = async (): Promise<void> => {
    if (sheetStatus !== 'ready' || !sheet?.valid) {
      setActionError('กรุณาโหลดคำถามให้ครบก่อนสร้างห้อง')
      return
    }
    void enterFullscreenSafely()
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

  const openPreAssessment = async (): Promise<void> => {
    if (!room) return
    setBusy(true)
    setActionError('')
    try {
      await service.openPreAssessment(room.roomId, uid)
    } catch (reason) {
      setActionError(classroomFriendlyError(reason))
    } finally {
      setBusy(false)
    }
  }

  const startGame = async (): Promise<void> => {
    if (!room || !sheet?.valid) return
    setIsPreAssessmentIncompleteDialogOpen(false)
    setBusy(true)
    setActionError('')
    teacherSoundtrackRef.current?.playGame()
    try {
      const snapshot = createRoomQuestionSnapshot(room.roomId, sheet.questions)
      saveTeacherSnapshot(snapshot)
      setTrustedSnapshot(snapshot)
      await withActionTiming('startGame', room.roomId, () => service.startGame(room.roomId, uid, snapshot))
    } catch (reason) {
      teacherSoundtrackRef.current?.playLobby()
      setActionError(classroomFriendlyError(reason))
    } finally {
      setBusy(false)
    }
  }

  const requestStartGame = (): void => {
    if (!room) return
    if (completedPreAssessmentCount < participantCount) {
      setIsPreAssessmentIncompleteDialogOpen(true)
      return
    }
    void startGame()
  }

  const currentRoundProgressionKey = room ? `${room.roomId}:${room.gameCycle}:${room.currentQuestionNumber}` : ''
  const isCheckpointReady = Boolean(room && roundCheckpointReadyKey === currentRoundProgressionKey)
  const progressionAction = room
    ? resolveTeacherRoundProgressionAction(room.status, room.currentQuestionNumber, isCheckpointReady)
    : 'none'

  const nextOrFinish = async (): Promise<void> => {
    if (!room || !canAdvanceQuestion) return
    const checkpointKey = `${room.roomId}:${room.gameCycle}:${room.currentQuestionNumber}`
    const roomAtStart = room.roomId
    if (progressionAction === 'enter-crisis') {
      setBusy(true)
      setActionError('')
      try {
        await withActionTiming('openNextQuestion', roomAtStart, () => service.openNextQuestion(roomAtStart, uid))
      } catch (reason) {
        setActionError(classroomFriendlyError(reason))
      } finally {
        setBusy(false)
      }
      return
    }
    if (progressionAction === 'finish-game') {
      setBusy(true)
      setActionError('')
      try {
        await withActionTiming('finishGame', roomAtStart, () => service.finishGame(roomAtStart, uid))
        navigate(`/result/${roomAtStart}`)
      } catch (reason) {
        setActionError(classroomFriendlyError(reason))
      } finally {
        setBusy(false)
      }
      return
    }
    cancelPresentationTimers()
    const run = ++presentationRunRef.current
    const boundary = roomBoundaryRef.current
    const questionAtStart = room.currentQuestionNumber
    const boundaryIsCurrent = (): boolean =>
      presentationRunRef.current === run
      && roomBoundaryRef.current === boundary
      && roomId === roomAtStart
    setBusy(true)
    setActionError('')
    try {
      if (room.status === 'playing') {
        if (!trustedSnapshot) throw new Error('ผู้ใช้:ไม่พบข้อมูลตรวจคำตอบในเครื่องครู')
        await withActionTiming('closeQuestion', room.roomId, () => service.closeQuestion(room.roomId, uid, trustedSnapshot))
      }

      let finalizedRoom = room.status === 'round-result' ? room : null
      for (let attempt = 0; !finalizedRoom && attempt < 60; attempt += 1) {
        if (!boundaryIsCurrent()) return
        const latestRoom = roomRef.current
        if (
          latestRoom?.roomId === roomAtStart
          && latestRoom.status === 'round-result'
          && latestRoom.currentQuestionNumber === questionAtStart
        ) {
          finalizedRoom = latestRoom
          break
        }
        await waitForPresentation(50)
      }
      if (!finalizedRoom) throw new Error('ผู้ใช้:ยังไม่ได้รับสถานะสรุปรอบล่าสุด กรุณาลองอีกครั้ง')

      const previousLevels = normalizeBuildingLevels(visualBuildingLevelsRef.current ?? room.buildingLevels)
      const nextLevels = normalizeBuildingLevels(finalizedRoom.buildingLevels)
      const stories = toBuildingChangeStories(previousLevels, nextLevels)
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const timing = getNormalPresentationTiming(stories.length > 0, reducedMotion)
      const cutscene = {
        cityYear: room.gameCycle * 10 + room.currentQuestionNumber,
        phase: 'entering' as const,
        transitionId: `${roomAtStart}:${room.gameCycle}:${questionAtStart}:presentation-${run}`,
      }

      setYearCutscene(cutscene)
      await waitForPresentation(timing.darken)
      if (!boundaryIsCurrent()) return
      setYearCutscene({ ...cutscene, phase: 'holding' })
      await waitForPresentation(timing.title)
      if (!boundaryIsCurrent()) return

      visualCityLevelRef.current = finalizedRoom.cityLevel
      visualBuildingLevelsRef.current = nextLevels
      setVisualCityLevel(finalizedRoom.cityLevel)
      setVisualBuildingLevels(nextLevels)
      setBuildingTransitions(toBuildingTransitionMap(stories))
      setYearCutscene({ ...cutscene, phase: 'text-leaving' })
      await waitForPresentation(timing.textFade)
      if (!boundaryIsCurrent()) return
      soundPackController.playEffectOnce(
        'sceneRooster',
        `${cutscene.transitionId}:year-transition`,
      )
      setYearCutscene({ ...cutscene, phase: 'leaving' })
      await waitForPresentation(timing.reveal)
      if (!boundaryIsCurrent()) return
      setYearCutscene(null)
      setBuildingChangeStories(stories)

      if (timing.settle > 0) await waitForPresentation(timing.settle)
      if (!boundaryIsCurrent()) return
      setBuildingTransitions({})
      setBuildingChangeStories([])

      if (resolvePostPresentationAction(questionAtStart) === 'open-next-question') {
        await withActionTiming('openNextQuestion', roomAtStart, () => service.openNextQuestion(roomAtStart, uid))
      } else {
        setRoundCheckpointReadyKey(checkpointKey)
      }
    } catch (reason) {
      setActionError(classroomFriendlyError(reason))
    } finally {
      if (roomBoundaryRef.current === boundary && roomId === roomAtStart) setBusy(false)
    }
  }

  const hardRecoverStaleRoom = (): void => {
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

  const confirmHardRecovery = (): void => {
    setIsHardRecoveryDialogOpen(false)
    hardRecoverStaleRoom()
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
    const beginEvent = async (): Promise<void> => { setBusy(true); setActionError(''); try { await withActionTiming('beginCrisisEvent', room.roomId, () => service.beginCrisisEvent(room.roomId, uid)) } catch (reason) { setActionError(classroomFriendlyError(reason)) } finally { setBusy(false) } }
    const continueAfterEvent = async (): Promise<void> => { setBusy(true); setActionError(''); try { await withActionTiming('openNextQuestion', room.roomId, () => service.openNextQuestion(room.roomId, uid)) } catch (reason) { setActionError(classroomFriendlyError(reason)) } finally { setBusy(false) } }
    return (
      <>
      <TeacherSoundtrack mode={teacherSoundtrackMode} ref={teacherSoundtrackRef} />
      <main className={`teacher-crisis-page teacher-crisis-page--${room.status}${crisisRevealPhase ? ` teacher-crisis-page--${crisisRevealPhase}` : ''}`}>
        {room.status === 'crisis-intro' ? <div className="teacher-crisis-alert-overlay" aria-hidden="true" /> : null}
        <TeacherEmergencyEndControl className="teacher-emergency-end--crisis" disabled={busy} roomId={room.roomId} />
        <div className="teacher-crisis-city" aria-hidden="true">
          <CityScene
            buildingLevels={visualBuildingLevels ?? room.buildingLevels}
            buildingTransitions={buildingTransitions}
            cityLevel={visualCityLevel ?? room.cityLevel}
          />
        </div>
        {crisisRevealPhase === 'resolving' ? <div className="teacher-crisis-resolution-cue" aria-hidden="true"><span /></div> : null}
        {buildingChangeStories.length > 0 ? (
          <div className="teacher-city-reveal teacher-city-reveal--crisis" aria-hidden="true">
            {buildingChangeStories.map((story) => (
              <span
                className={`teacher-city-reveal__glow is-${story.direction}`}
                key={story.buildingId}
                style={{
                  '--location-x': `${LOCATION_POSITIONS[story.locationId].x}%`,
                  '--location-y': `${LOCATION_POSITIONS[story.locationId].y}%`,
                } as React.CSSProperties}
              />
            ))}
          </div>
        ) : null}
        <section className="teacher-crisis-panel">
          <p className="teacher-crisis-eyebrow">สถานการณ์วิกฤต • เหตุการณ์ {event.index}/2</p>
          <h1>{event.title}</h1>
          <p className="teacher-crisis-subtitle">{event.subtitle}</p>
          {room.status === 'crisis-intro' ? (
            <div className="teacher-crisis-intro"><span aria-hidden="true">⚠️</span><b>ผลกระทบ ×2</b><p>{event.situation}</p><strong>แต่ละอาชีพจะได้รับสถานการณ์ตัดสินใจที่ต่างกัน</strong></div>
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
              <p className="teacher-crisis-result__heading">ผลกระทบหลังวิกฤต <b>คะแนน ×2 สรุปแล้ว</b></p>
              <div className="teacher-crisis-result__counts">
                <article className="is-integrity"><span>สุจริต</span><strong>{result.integrityCount} คน</strong><small>{integrityPercent}%</small></article>
                <article className="is-corruption"><span>ทุจริต</span><strong>{result.corruptionCount} คน</strong><small>{corruptionPercent}%</small></article>
                <article className="is-timeout"><span>ไม่ตอบ</span><strong>{result.timeoutCount} คน</strong><small>{timeoutPercent}%</small></article>
              </div>
              <div className="teacher-crisis-score-flow"><span>ก่อนวิกฤต<strong>{Math.round(result.previousCityScore)}</strong></span><b>{result.eventAverage >= 0 ? '+' : ''}{Math.round(result.eventAverage)}</b><span>หลังวิกฤต<strong>{Math.round(result.newCityScore)}</strong></span></div>
              <p className="teacher-crisis-conclusion">{getCrisisConclusion(result.eventAverage)}</p>
              <BuildingChangeSummary crisis stories={buildingChangeStories} />
            </div>
          ) : null}
          {actionError ? <p className="teacher-crisis-error">{actionError}</p> : null}
          <div className="teacher-crisis-actions">
            {room.status === 'crisis-intro' ? <button disabled={busy} onClick={() => void beginEvent()}>เริ่มเหตุการณ์วิกฤต</button> : null}
            {room.status === 'crisis-playing' ? <button disabled={busy || closingRef.current} onClick={() => void closeCurrentCrisis()}>ปิดรับและสรุปผล</button> : null}
            {room.status === 'crisis-result' ? <button disabled={busy || !result || crisisRevealPhase !== 'revealed'} onClick={() => void continueAfterEvent()}>เข้าสู่คำถามข้อ {room.currentQuestionNumber + 1}</button> : null}
          </div>
        </section>
      </main>
      </>
    )
  }

  if (room && (room.status === 'playing' || room.status === 'round-result')) {
    const missingTrusted = !trustedSnapshot
    const nextActionLabel = progressionAction === 'enter-crisis'
      ? 'เข้าสู่เหตุการณ์วิกฤต'
      : progressionAction === 'finish-game'
        ? 'ดูผลรอบนี้'
        : room.status === 'playing'
          ? (room.currentQuestionNumber === 10 ? 'สรุปผลข้อสุดท้าย' : 'ไปข้อถัดไป')
          : (room.currentQuestionNumber === 10 ? 'ดูผลรอบนี้' : 'ไปข้อถัดไป')
    return (
      <>
        <CityStage
        answerCount={answerCount}
        remainingSeconds={remaining}
        room={room}
        previewCityScore={liveCityScore}
        visualCityLevel={visualCityLevel ?? room.cityLevel}
        visualBuildingLevels={visualBuildingLevels ?? normalizeBuildingLevels(room.buildingLevels)}
        buildingTransitions={buildingTransitions}
        roundImpact={currentRound?.roundAverage ?? null}
        locationImpacts={room.status === 'round-result' ? currentRound?.locationSummaries ?? null : null}
        roundHistory={roundsState.data}
        utilityControls={(
          <div className="city-stage__teacher-utilities">
            <TeacherSoundtrack mode={teacherSoundtrackMode} ref={teacherSoundtrackRef} />
            <TeacherEmergencyEndControl className="teacher-emergency-end--stage" roomId={room.roomId} />
          </div>
        )}
        controls={
          <>
            <button
              className="city-stage__action-button city-stage__action-button--close"
              disabled={room.status !== 'playing' || missingTrusted || closingRef.current}
              onClick={() => void closeCurrentQuestion()}
              title={room.status === 'playing' ? 'ปิดรับคำตอบและสรุปผลข้อปัจจุบัน' : 'ข้อปัจจุบันปิดแล้ว'}
            >
              <span aria-hidden="true">■</span> ปิดรับคำตอบ
            </button>
            <button
              className="city-stage__action-button city-stage__action-button--next"
              disabled={busy || missingTrusted || !canAdvanceQuestion}
              onClick={() => void nextOrFinish()}
            >
              <span aria-hidden="true">{room.currentQuestionNumber === 10 ? '▣' : '▶'}</span>
              {' '}{nextActionLabel}
            </button>
            <button
              className="city-stage__action-button city-stage__action-button--continue"
              disabled
              title="ใช้ได้จากหน้าสรุปหลังเล่นครบ 10 ข้อ โดยคงคะแนนเมืองเดิม"
            >
              <span aria-hidden="true">↻</span> เล่นรอบต่อไป
            </button>
          </>
        }
      >
        {missingTrusted ? (
          <div className="mx-auto max-w-2xl rounded-2xl border border-red-300/40 bg-red-950/90 p-5 text-center text-lg font-bold">
            ไม่สามารถเปิดห้องนี้ต่อจากเครื่องนี้ได้ กรุณากลับไปใช้เครื่องที่สร้างห้อง หรือเริ่มห้องใหม่
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
        {buildingChangeStories.length > 0 ? (
          <div className="teacher-city-reveal" aria-hidden="true">
            {buildingChangeStories.map((story) => (
              <span
                className={`teacher-city-reveal__glow is-${story.direction}`}
                key={story.buildingId}
                style={{
                  '--location-x': `${LOCATION_POSITIONS[story.locationId].x}%`,
                  '--location-y': `${LOCATION_POSITIONS[story.locationId].y}%`,
                } as React.CSSProperties}
              />
            ))}
          </div>
        ) : null}
        <BuildingChangeSummary stories={buildingChangeStories} />
      </>
    )
  }

  const participantCount = playersState.data.length
  const classroomCapacity = 40
  const roomReady = participantCount > 0

  return (
    <>
    <main className={`teacher-lobby-page${!roomId ? ' teacher-lobby-page--create' : ''}`}>
      {!roomId || room?.status === 'lobby' ? (
        <div className="teacher-lobby-birds"><CityBirdsAnimation /></div>
      ) : null}
      <header className="teacher-lobby-header">
        <Link className="teacher-lobby-brand" to="/" aria-label="Our City, Our Choice หน้าหลัก">
          <span className="teacher-lobby-brand__mark" aria-hidden="true">🏙️</span>
          <span><strong>OUR CITY<br />OUR CHOICE</strong><small>เมืองนี้...อยู่ที่เรา</small></span>
        </Link>
        <div className="teacher-lobby-title">
          <h1>{roomId ? 'เตรียมเมืองสำหรับชั้นเรียน' : 'สร้างห้องเรียนจำลอง'}</h1>
          <p>{roomId ? 'ทำความรู้จัก 8 อาชีพ แล้วร่วมกันสร้างเมืองที่โปร่งใส ไร้ทุจริต' : 'เตรียมพื้นที่เรียนรู้ความสุจริตและการตัดสินใจเพื่อส่วนรวมสำหรับชั้นเรียน'}</p>
        </div>
        <TeacherSoundtrack mode={teacherSoundtrackMode} ref={teacherSoundtrackRef} />
        {roomId ? <FullscreenToggle className="teacher-lobby-fullscreen" /> : null}
        <Link className="teacher-lobby-home" to="/"><span aria-hidden="true">⌂</span> หน้าหลัก</Link>
      </header>

      {!roomId ? (
        <div className="teacher-lobby-layout teacher-lobby-layout--create">
          <section className="teacher-lobby-create-hero" aria-label="ข้อมูลกิจกรรมสร้างเมือง">
            <div className="teacher-lobby-create-hero__content">
              <span className="teacher-lobby-create-hero__tag">
                <img alt="" aria-hidden="true" src="/images/home/home-classroom.png" />
                กิจกรรมห้องเรียน · เมืองโปร่งใส ไร้ทุจริต
              </span>
              <h2>เปิดห้องเรียนเพื่อเริ่มกิจกรรม</h2>
              <p>
                ให้นักเรียนสวมบทบาท 8 อาชีพ ร่วมตัดสินใจในสถานการณ์จำลอง
                และเรียนรู้ว่าทุกทางเลือกส่งผลต่อความเจริญและตึกรามบ้านช่องของเมืองอย่างไร
              </p>
              <div className="teacher-lobby-create-hero__features">
                <article>
                  <span aria-hidden="true">👥</span>
                  <div><strong>รองรับ 40 คน</strong><small>กระจาย 8 บทบาทอย่างสมดุล</small></div>
                </article>
                <article>
                  <span aria-hidden="true">📝</span>
                  <div><strong>มีแบบประเมินในตัว</strong><small>วัดผลก่อน-หลังกิจกรรม</small></div>
                </article>
                <article>
                  <span aria-hidden="true">📊</span>
                  <div><strong>สรุปผลเรียลไทม์</strong><small>ดูภาพรวมเมืองและสถิติชั้นเรียน</small></div>
                </article>
              </div>
            </div>
          </section>

          <section className="teacher-lobby-control" aria-label="จัดการห้องเรียน">
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
              <details className="teacher-lobby-more-options">
                <summary>ตัวเลือกเพิ่มเติม</summary>
                <button className="teacher-lobby-reset-room-button" disabled={busy} onClick={() => setIsHardRecoveryDialogOpen(true)} type="button">
                  <span aria-hidden="true">↺</span> แก้ปัญหาห้องค้าง
                </button>
              </details>
            </div>
            {actionError || roomState.error || playersState.error ? <p className="teacher-lobby-error">{actionError || roomState.error || playersState.error}</p> : null}
          </section>
        </div>
      ) : (
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
                    {room?.preAssessmentOpened ? (
                      completedPreAssessmentPlayerIds.has(player.playerId)
                        ? <span className="teacher-lobby-student-card__ready"><i aria-hidden="true" />ทำแบบประเมินแล้ว</span>
                        : <span className="teacher-lobby-student-card__pending"><i aria-hidden="true" />ยังไม่ได้ทำแบบประเมิน</span>
                    ) : (
                      <span className="teacher-lobby-student-card__ready"><i aria-hidden="true" />พร้อม</span>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="teacher-lobby-roster-empty">
                <span aria-hidden="true">👥</span>
                <strong>กำลังรอนักเรียนเข้าห้อง</strong>
                <p>สแกน QR หรือส่งลิงก์ให้นักเรียน รายชื่อจะปรากฏตรงนี้ทันที</p>
              </div>
            )}
            <div className="teacher-lobby-roster-note"><span aria-hidden="true">✓</span><p><strong>รองรับนักเรียน 40 คน</strong> รายชื่ออัปเดตอัตโนมัติแบบเรียลไทม์</p></div>
          </section>

          <section className="teacher-lobby-control" aria-label="จัดการห้องเรียน">
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

            {room?.preAssessmentOpened ? (
              <div className="teacher-lobby-summary">
                <div className={completedPreAssessmentCount === participantCount && participantCount > 0 ? 'is-ready' : 'is-waiting'}>
                  <span className="teacher-lobby-summary__icon" aria-hidden="true">📝</span>
                  <p>แบบประเมินก่อนกิจกรรม<strong>ทำเสร็จ {completedPreAssessmentCount} / {participantCount} <small>คน</small></strong></p>
                </div>
              </div>
            ) : (
              <button className="teacher-lobby-primary-button" disabled={busy || room?.status !== 'lobby'} onClick={() => void openPreAssessment()} type="button">
                <span aria-hidden="true">📝</span> เริ่มแบบประเมินก่อนกิจกรรม
              </button>
            )}

            <details className="teacher-lobby-role-guide">
              <summary className="teacher-lobby-card-heading">
                <div><strong>8 อาชีพในเมือง</strong><p>ระบบจะสุ่มและกระจายบทบาทให้สมดุล (แตะเพื่อดู)</p></div>
                <span aria-hidden="true">⚄</span>
              </summary>
              <div className="teacher-lobby-role-guide__grid">
                {ROLES.map((role) => (
                  <article className={`teacher-lobby-role-guide__item teacher-lobby-role-guide__item--${role.id}`} key={role.id}>
                    <span aria-hidden="true">{ROLE_ICONS[role.id]}</span>
                    <div><strong>{role.label}</strong><p>{ROLE_CIVIC_GUIDANCE[role.id].influence}</p></div>
                  </article>
                ))}
              </div>
            </details>

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
            {room?.preAssessmentOpened ? (
              <button className="teacher-lobby-primary-button teacher-lobby-primary-button--start" disabled={busy || participantCount === 0 || sheetStatus !== 'ready' || room?.status !== 'lobby'} onClick={requestStartGame}>
                <span aria-hidden="true">▶</span> เริ่มกิจกรรม
                <small>{participantCount === 0 ? 'รอให้นักเรียนเข้าห้องก่อน' : 'เริ่มสร้างเมืองของเรากันเลย!'}</small>
              </button>
            ) : null}
            <details className="teacher-lobby-more-options">
              <summary>ตัวเลือกเพิ่มเติม</summary>
              <button className="teacher-lobby-reset-room-button" disabled={busy} onClick={() => setIsHardRecoveryDialogOpen(true)} type="button"><span aria-hidden="true">↺</span> แก้ปัญหาห้องค้าง</button>
            </details>
            {actionError || roomState.error || playersState.error ? <p className="teacher-lobby-error">{actionError || roomState.error || playersState.error}</p> : null}
          </section>
        </div>
      )}
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
      <ConfirmDialog
        body="ใช้เมนูนี้เมื่อห้องเดิมค้างหรือไม่สามารถใช้งานต่อได้ ระบบจะล้างข้อมูลห้องที่ค้างอยู่บนเครื่องนี้และพากลับไปเริ่มห้องใหม่"
        busy={busy}
        confirmLabel="ล้างห้องที่ค้าง"
        destructive
        onCancel={() => setIsHardRecoveryDialogOpen(false)}
        onConfirm={confirmHardRecovery}
        open={isHardRecoveryDialogOpen}
        title="แก้ปัญหาห้องค้าง"
      />
      <ConfirmDialog
        body={`มีนักเรียน ${Math.max(participantCount - completedPreAssessmentCount, 0)} คนยังทำแบบประเมินก่อนกิจกรรมไม่เสร็จ\nต้องการเริ่มกิจกรรมต่อหรือไม่?`}
        busy={busy}
        confirmLabel="เริ่มกิจกรรมต่อ"
        onCancel={() => setIsPreAssessmentIncompleteDialogOpen(false)}
        onConfirm={() => void startGame()}
        open={isPreAssessmentIncompleteDialogOpen}
        title="นักเรียนบางคนยังทำแบบประเมินไม่เสร็จ"
      />
    </main>
    </>
  )
}
