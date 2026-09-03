import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { CityLoader } from '../components/CityLoader'
import { CityScene } from '../components/CityScene'
import { FinishedLearningEvidenceSection } from '../components/FinishedLearningEvidenceSection'
import { BrandHeader, ErrorPanel, ScenePage } from '../components/Layout'
import { TeacherObservationSection } from '../components/TeacherObservationSection'
import {
  getTeacherObservationEvidence,
  shouldShowTeacherObservationSection,
} from '../components/TeacherEvidenceSummarySection'
import { useGame } from '../context/GameContext'
import { LOCATION_BUILDING, normalizeBuildingLevels, type BuildingId, type BuildingLevel } from '../domain/cityBuildings'
import type { LocationId, LocationSummary } from '../domain/cityScoring'
import { formatCityLevel, MAX_GAME_CYCLES, ROLES, type CityLevel } from '../domain/ourCity'
import { countPersonalDecisionOutcomes, derivePersonalImpactNarrative } from '../domain/personalDecisionResults'
import { useCrisisResults, usePersonalDecisionResults, usePlayer, usePlayers, useRoom, useRounds } from '../hooks/useGameData'
import { useTeacherLearningEvidencePublisher } from '../hooks/useTeacherLearningEvidencePublisher'
import { classroomFriendlyError } from '../services'
import {
  clearClassroomStudentSession,
  clearClassroomTeacherSession,
  getClassroomStudentSession,
  getClassroomTeacherSession,
  getClassroomViewerRole,
} from '../services/sessionStorage'
import { clearTeacherSnapshot } from '../services/teacherQuestionSnapshot'
// DIAGNOSTIC FLIGHT RECORDER — opt-in via ?debug=2, see src/debug/flightRecorder.ts
import { withActionTiming } from '../debug/flightRecorder'


// eslint-disable-next-line react-refresh/only-export-components
export const CITY_REFLECTIONS: Record<CityLevel, string> = {
  critical: 'เมืองได้รับผลกระทบรุนแรงจากการตัดสินใจที่ไม่โปร่งใส และต้องเร่งฟื้นฟูร่วมกัน',
  declining: 'เมืองกำลังเสื่อมถอยและต้องการความร่วมมือจากทุกคน',
  neutral: 'เมืองยังอยู่ในภาวะปกติ ทุกการตัดสินใจต่อจากนี้จะกำหนดทิศทางของเมือง',
  improving: 'เมืองกำลังพัฒนาเพราะประชาชนร่วมกันตัดสินใจอย่างรับผิดชอบ',
  prosperous: 'เมืองพัฒนาอย่างมั่นคงจากความซื่อสัตย์และความร่วมมือของทุกคน',
}

const CITY_LEVEL_STEPS: readonly { id: CityLevel; range: string }[] = [
  { id: 'critical', range: '0–199' },
  { id: 'declining', range: '200–299' },
  { id: 'neutral', range: '300–599' },
  { id: 'improving', range: '600–799' },
  { id: 'prosperous', range: '800–1,000' },
]

const CITY_RESULT_EMOJI: Record<CityLevel, string> = {
  critical: '😰', declining: '😟', neutral: '🏙️', improving: '🙂', prosperous: '🌟',
}

const BUILDING_LEVEL_LABELS: Record<BuildingLevel, string> = {
  [-2]: 'ทรุดโทรมมาก', [-1]: 'เริ่มทรุดโทรม', 0: 'ปกติ', 1: 'กำลังพัฒนา', 2: 'พัฒนาเต็มที่',
}

const RESULT_BUILDINGS: readonly { id: LocationId; buildingId: BuildingId; icon: string; label: string }[] = [
  { id: 'school', buildingId: 'school', icon: '🏫', label: 'โรงเรียน' },
  { id: 'construction', buildingId: 'construction', icon: '🏗️', label: 'ไซต์ก่อสร้าง' },
  { id: 'market', buildingId: 'market', icon: '🏪', label: 'ตลาด' },
  { id: 'hospital', buildingId: 'hospital', icon: '🏥', label: 'โรงพยาบาล' },
  { id: 'police-station', buildingId: 'police', icon: '👮', label: 'สถานีตำรวจ' },
  { id: 'municipal-office', buildingId: 'municipality', icon: '🏛️', label: 'สำนักงานเทศบาล' },
  { id: 'news-office', buildingId: 'newsAgency', icon: '🛰️', label: 'สำนักข่าว' },
]

const signed = (value: number): string => `${value > 0 ? '+' : ''}${Math.round(value)}`
const emptyLocationSummary = (): LocationSummary => ({ integrityCount: 0, corruptionCount: 0, timeoutCount: 0, participantCount: 0, scoreTotal: 0, scoreAverage: 0 })
const addLocationSummary = (target: LocationSummary, source: LocationSummary): LocationSummary => {
  const participantCount = target.participantCount + source.participantCount
  const scoreTotal = target.scoreTotal + source.scoreTotal
  return {
    integrityCount: target.integrityCount + source.integrityCount,
    corruptionCount: target.corruptionCount + source.corruptionCount,
    timeoutCount: target.timeoutCount + source.timeoutCount,
    participantCount,
    scoreTotal,
    scoreAverage: participantCount > 0 ? scoreTotal / participantCount : 0,
  }
}
const PERSONAL_RESULTS_READ_ERROR = 'ไม่สามารถโหลดผลการตัดสินใจส่วนตัวได้ กรุณาลองใหม่'
type TeacherResultTab = 'summary' | 'learning' | 'city'

export const ResultPage = () => {
  const roomId = (useParams().roomCode ?? '').toUpperCase()
  const navigate = useNavigate()
  const { service, uid } = useGame()
  const teacherSession = getClassroomTeacherSession()
  const studentSession = getClassroomStudentSession()
  const viewerRole = getClassroomViewerRole()
  const hasStudentSession = studentSession?.roomId === roomId
  const isTeacher = teacherSession?.roomId === roomId && (viewerRole === 'teacher' || (viewerRole === null && !hasStudentSession))
  const studentPlayerId = hasStudentSession ? studentSession.playerId : ''
  const roomState = useRoom(roomId)
  const roundsState = useRounds(isTeacher ? roomId : '')
  const crisisResultsState = useCrisisResults(isTeacher ? roomId : '')
  const playersState = usePlayers(isTeacher ? roomId : '')
  const learningEvidencePublisher = useTeacherLearningEvidencePublisher(
    roomState.data,
    isTeacher && roomState.data?.status === 'finished',
  )
  const assessmentEvidenceState = learningEvidencePublisher.evidenceState
  const playerState = usePlayer(hasStudentSession ? roomId : '', studentPlayerId)
  const personalResultsState = usePersonalDecisionResults(hasStudentSession ? roomId : '', studentPlayerId, hasStudentSession ? uid : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [activeTeacherTab, setActiveTeacherTab] = useState<TeacherResultTab>('summary')
  const [activeBuildingId, setActiveBuildingId] = useState<LocationId | null>(null)
  const publishingLearningEvidence = learningEvidencePublisher.publishing
  const room = roomState.data
  const liveLearningEvidence = learningEvidencePublisher.liveEvidence

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [])

  useEffect(() => {
    const status = roomState.data?.status
    if (status === 'role-draw') navigate(`/role-draw/${roomId}`, { replace: true })
    if (status === 'playing' || status === 'round-result') navigate(isTeacher ? '/teacher' : `/game/${roomId}`, { replace: true })
    if (status === 'lobby') navigate(isTeacher ? '/teacher' : `/lobby/${roomId}`, { replace: true })
  }, [isTeacher, navigate, roomId, roomState.data?.status])

  useEffect(() => {
    if (roomState.data?.status !== 'finished' || isTeacher || !hasStudentSession) return
    navigate(`/assessment/post/${roomId}`, { replace: true })
  }, [hasStudentSession, isTeacher, navigate, roomId, roomState.data?.status])

  useEffect(() => {
    if (!activeBuildingId) return undefined
    const closeOnEscape = (event: KeyboardEvent): void => { if (event.key === 'Escape') setActiveBuildingId(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [activeBuildingId])

  const cycleRounds = useMemo(() => room ? roundsState.data.filter((round) => round.gameCycle === room.gameCycle).sort((a, b) => a.questionNumber - b.questionNumber) : [], [room, roundsState.data])
  const cycleCrises = useMemo(() => room ? crisisResultsState.data.filter((result) => result.gameCycle === room.gameCycle).sort((a, b) => a.eventIndex - b.eventIndex) : [], [crisisResultsState.data, room])

  if (!roomId) return <Navigate replace to="/" />
  const loadingTeacher = isTeacher && (roundsState.loading || crisisResultsState.loading || playersState.loading)
  const loadingStudent = hasStudentSession && (playerState.loading || personalResultsState.loading)
  if (roomState.loading || loadingTeacher || loadingStudent) return <CityLoader variant="full" message="กำลังสรุปผลเมือง..." />
  if (!room) return <Navigate replace to="/" />
  const isPublicFinishedResult = !isTeacher && !hasStudentSession && room.status === 'finished'
  if (isPublicFinishedResult) {
    const publicBuildingLevels = normalizeBuildingLevels(room.buildingLevels)
    const publicTabs: readonly [TeacherResultTab, string][] = [
      ['summary', 'สรุป'],
      ['learning', 'ผลการเรียนรู้'],
      ['city', 'รายละเอียดเมือง'],
    ]
    return (
      <main className={`teacher-result-page public-result-page is-${room.cityLevel}`}>
        <div className="result-city-art" aria-hidden="true"><CityScene buildingLevels={publicBuildingLevels} cityLevel={room.cityLevel} /></div><div className="result-city-veil" aria-hidden="true" />
        <header className="teacher-result-topbar"><div><span>✓</span><p>รอบที่เล่นจบ<strong>{room.completedGameCount.toLocaleString('th-TH')}</strong></p></div><div><span>⭐</span><p>คะแนนเมือง<strong>{Math.round(room.cityScore).toLocaleString('th-TH')}</strong></p></div><div><span>👥</span><p>ผู้เข้าร่วม<strong>{room.lockedPlayerCount.toLocaleString('th-TH')} คน</strong></p></div><div><span>🏙️</span><p>ห้องกิจกรรม<strong>{room.roomId}</strong></p></div></header>
        <section className="teacher-result-shell">
          <nav className="teacher-result-tabs" aria-label="ส่วนข้อมูลผลลัพธ์สาธารณะ" role="tablist">
            {publicTabs.map(([tab, label]) => (
              <button aria-controls={`public-result-panel-${tab}`} aria-selected={activeTeacherTab === tab} className={activeTeacherTab === tab ? 'is-active' : ''} id={`public-result-tab-${tab}`} key={tab} onClick={() => setActiveTeacherTab(tab)} role="tab" type="button">{label}</button>
            ))}
          </nav>
          <div className="teacher-result-panels">
            {activeTeacherTab === 'summary' ? <article className="teacher-result-summary" aria-labelledby="public-result-tab-summary" id="public-result-panel-summary" role="tabpanel">
              <header className="teacher-result-hero"><div className="teacher-result-hero__level"><span>{CITY_RESULT_EMOJI[room.cityLevel]}</span><div><small>สถานะเมืองสุดท้าย</small><h1>{formatCityLevel(room.cityLevel)}</h1></div></div><div className="teacher-result-hero__score"><span>คะแนนเมือง</span><strong>{Math.round(room.cityScore).toLocaleString('th-TH')} <small>/ 1,000</small></strong></div><div className="teacher-result-hero__delta"><span>ผู้เข้าร่วมกิจกรรม</span><strong>{room.lockedPlayerCount.toLocaleString('th-TH')} คน</strong></div><p>{CITY_REFLECTIONS[room.cityLevel]}</p></header>
              <section className="teacher-result-city-preview public-result-summary-city" aria-labelledby="public-result-summary-city-title"><div className="teacher-section-heading"><div><h2 id="public-result-summary-city-title">ภาพเมืองล่าสุด</h2><p>{formatCityLevel(room.cityLevel)} • {Math.round(room.cityScore).toLocaleString('th-TH')} / 1,000 คะแนน</p></div></div><div className="teacher-result-city-preview__scene"><CityScene buildingLevels={publicBuildingLevels} cityLevel={room.cityLevel} /></div></section>
              <section className="teacher-answer-summary" aria-labelledby="public-answer-summary-title"><h2 id="public-answer-summary-title">ผลการตัดสินใจสะสม</h2><div><article className="is-integrity"><span>✓</span><p>สุจริต<strong>{room.integrityTotal.toLocaleString('th-TH')}</strong></p></article><article className="is-corruption"><span>!</span><p>ทุจริต<strong>{room.corruptionTotal.toLocaleString('th-TH')}</strong></p></article><article className="is-timeout"><span>?</span><p>ไม่ตอบ<strong>{room.timeoutTotal.toLocaleString('th-TH')}</strong></p></article></div></section>
              <section className="teacher-building-summary" aria-labelledby="public-building-summary-title"><div className="teacher-section-heading"><div><h2 id="public-building-summary-title">สถานะอาคารทั้ง 7 แห่ง</h2><p>แสดงเฉพาะระดับอาคารสุดท้ายจากข้อมูลรวมระดับห้อง</p></div></div><div className="teacher-building-summary__grid">{RESULT_BUILDINGS.map((building) => { const level = publicBuildingLevels[building.buildingId]; return <article className={level > 0 ? 'is-positive' : level < 0 ? 'is-negative' : 'is-neutral'} key={building.id}><span>{building.icon}</span><p>{building.label}<small>{BUILDING_LEVEL_LABELS[level]}</small></p><strong>ระดับ {level > 0 ? '+' : ''}{level}</strong></article> })}</div></section>
            </article> : null}
            {activeTeacherTab === 'learning' ? <section aria-labelledby="public-result-tab-learning" id="public-result-panel-learning" role="tabpanel"><FinishedLearningEvidenceSection evidence={room.publicLearningEvidence ?? null} room={room} /></section> : null}
            {activeTeacherTab === 'city' ? <section className="teacher-result-details public-result-details" aria-labelledby="public-result-tab-city" id="public-result-panel-city" role="tabpanel">
              <section className="public-result-city-preview"><div className="teacher-section-heading"><div><h2>ภาพเมืองสุดท้าย</h2><p>{formatCityLevel(room.cityLevel)} • {Math.round(room.cityScore).toLocaleString('th-TH')} / 1,000 คะแนน</p></div></div><div className="public-result-city-preview__scene"><CityScene buildingLevels={publicBuildingLevels} cityLevel={room.cityLevel} /></div></section>
              <section className="teacher-result-levels"><div className="teacher-section-heading"><div><h2>ระดับเมือง</h2><p>เกณฑ์คะแนนรวมของเมือง</p></div></div><div className="teacher-result-levels__grid">{CITY_LEVEL_STEPS.map((step) => <article className={step.id === room.cityLevel ? 'is-current' : ''} key={step.id}><span>{CITY_RESULT_EMOJI[step.id]}</span><strong>{formatCityLevel(step.id)}</strong><small>{step.range} คะแนน</small></article>)}</div></section>
              <section className="teacher-answer-summary" aria-labelledby="public-city-totals-title"><h2 id="public-city-totals-title">ผลรวมระดับห้อง</h2><div><article className="is-integrity"><span>✓</span><p>สุจริต<strong>{room.integrityTotal.toLocaleString('th-TH')}</strong></p></article><article className="is-corruption"><span>!</span><p>ทุจริต<strong>{room.corruptionTotal.toLocaleString('th-TH')}</strong></p></article><article className="is-timeout"><span>?</span><p>ไม่ตอบ<strong>{room.timeoutTotal.toLocaleString('th-TH')}</strong></p></article></div></section>
              <section className="teacher-building-summary" aria-labelledby="public-city-buildings-title"><div className="teacher-section-heading"><div><h2 id="public-city-buildings-title">ระดับอาคารสุดท้าย</h2><p>ไม่มีการแสดงตัวเลขรายอาคารที่ต้องอ่านข้อมูลรอบส่วนตัว</p></div></div><div className="teacher-building-summary__grid">{RESULT_BUILDINGS.map((building) => { const level = publicBuildingLevels[building.buildingId]; return <article className={level > 0 ? 'is-positive' : level < 0 ? 'is-negative' : 'is-neutral'} key={building.id}><span>{building.icon}</span><p>{building.label}<small>{BUILDING_LEVEL_LABELS[level]}</small></p><strong>ระดับ {level > 0 ? '+' : ''}{level}</strong></article> })}</div></section>
            </section> : null}
          </div>
          <footer className="teacher-result-actions"><Link className="public-result-home-link teacher-result-home-button" to="/"><span aria-hidden="true">⌂</span> กลับหน้าหลัก</Link></footer>
        </section>
      </main>
    )
  }
  if (!isTeacher && !hasStudentSession) {
    return (
      <ScenePage compact>
        <BrandHeader backTo="/" />
        <div className="flex flex-1 items-center px-5 pb-8">
          <ErrorPanel
            action={<Link className="primary-button inline-flex w-full items-center justify-center" to="/">กลับหน้าหลัก</Link>}
            message="หน้านี้แสดงผลเฉพาะครูเจ้าของห้องหรือผู้เรียนที่เข้าร่วมจากอุปกรณ์นี้"
          />
        </div>
      </ScenePage>
    )
  }

  const cycleResults = [...cycleRounds, ...cycleCrises]
  const latestTotals = cycleResults.reduce((totals, result) => ({ integrityCount: totals.integrityCount + result.integrityCount, corruptionCount: totals.corruptionCount + result.corruptionCount, timeoutCount: totals.timeoutCount + result.timeoutCount }), { integrityCount: 0, corruptionCount: 0, timeoutCount: 0 })
  const latestAnswerTotal = latestTotals.integrityCount + latestTotals.corruptionCount + latestTotals.timeoutCount
  const percentage = (count: number): number => latestAnswerTotal > 0 ? Math.round(count / latestAnswerTotal * 100) : 0
  const cycleStartScore = cycleRounds[0]?.previousCityScore ?? cycleCrises[0]?.previousCityScore ?? room.cityScore
  const cycleScoreDelta = room.cityScore - cycleStartScore
  const roleProgress = playersState.data.length === 0 ? room.completedGameCount : Math.min(...playersState.data.map((player) => player.roleHistory.length))
  const canContinue = room.status === 'game-result' && room.gameCycle < MAX_GAME_CYCLES - 1
  const buildingLevels = normalizeBuildingLevels(room.buildingLevels)
  const buildingResults = RESULT_BUILDINGS.map((building) => {
    const summary = cycleResults.reduce((total, result) => addLocationSummary(total, result.locationSummaries[building.id]), emptyLocationSummary())
    const average = summary.participantCount > 0 ? summary.scoreTotal / summary.participantCount : 0
    const level = buildingLevels[LOCATION_BUILDING[building.id]]
    return { ...building, summary, average, level, direction: average > 0 ? 'กำลังดีขึ้น' : average < 0 ? 'กำลังถดถอย' : 'ทรงตัว' }
  })
  const activeBuilding = activeBuildingId ? buildingResults.find((building) => building.id === activeBuildingId) ?? null : null
  const observationEvidence = getTeacherObservationEvidence(assessmentEvidenceState.data)
  const showTeacherObservationSection = shouldShowTeacherObservationSection(
    room.status === 'finished',
    assessmentEvidenceState.loading,
    observationEvidence,
  )

  const continueCity = async (): Promise<void> => {
    setBusy(true); setError('')
    try { await withActionTiming('continueCityProgress', roomId, () => service.continueCityProgress(roomId, uid)) } catch (reason) { setError(classroomFriendlyError(reason)) } finally { setBusy(false) }
  }
  const endActivity = async (createNew = false): Promise<void> => {
    setBusy(true); setError('')
    try {
      if (room.status === 'game-result') await service.endActivity(roomId, uid)
      if (createNew) { clearTeacherSnapshot(roomId); clearClassroomTeacherSession(); navigate('/teacher') }
    } catch (reason) { setError(classroomFriendlyError(reason)) } finally { setBusy(false) }
  }
  const goHome = (): void => {
    if (isTeacher) { clearTeacherSnapshot(roomId); clearClassroomTeacherSession() }
    if (studentSession?.roomId === roomId) clearClassroomStudentSession()
    navigate('/')
  }
  const teacherError = error || learningEvidencePublisher.publicationError || roomState.error || roundsState.error || crisisResultsState.error || playersState.error

  if (!isTeacher && hasStudentSession) {
    const personalCurrent = personalResultsState.data.filter((result) => result.gameCycle === room.gameCycle)
    const personalCumulative = personalResultsState.data.filter((result) => result.gameCycle <= room.gameCycle)
    const currentTotals = countPersonalDecisionOutcomes(personalCurrent)
    const cumulativeTotals = countPersonalDecisionOutcomes(personalCumulative)
    const currentTotal = currentTotals.integrity + currentTotals.corruption + currentTotals.timeout
    const cumulativeTotal = cumulativeTotals.integrity + cumulativeTotals.corruption + cumulativeTotals.timeout
    const role = ROLES.find((candidate) => candidate.id === playerState.data?.roleId)
    const hasPrivateResults = personalCurrent.length > 0
    const personalResultsFailed = Boolean(personalResultsState.error)
    const personalNarrative = derivePersonalImpactNarrative(currentTotals, room.cityLevel)
    return (
      <main className={`student-cycle-result is-${room.cityLevel}`}>
        <div className="result-city-art" aria-hidden="true"><CityScene buildingLevels={room.buildingLevels} cityLevel={room.cityLevel} /></div><div className="result-city-veil" aria-hidden="true" />
        <section className="student-cycle-result__card">
          <header className="student-cycle-result__header"><p>ผลลัพธ์ส่วนตัว • รอบที่ {room.gameCycle + 1}</p><h1>ผลการตัดสินใจของฉัน</h1><span>ข้อมูลนี้แสดงเฉพาะการตัดสินใจของคุณเท่านั้น</span></header>
          {personalResultsFailed ? (
            <section className="student-cycle-result__data-state is-error" role="alert">{PERSONAL_RESULTS_READ_ERROR}</section>
          ) : hasPrivateResults ? (
            <>
              <section className="student-decision-counters" aria-label="การตัดสินใจของฉันในรอบนี้">
                <article className="is-integrity"><span aria-hidden="true">✓</span><p>เลือกทางสุจริต<strong>{currentTotals.integrity}</strong></p></article>
                <article className="is-corruption"><span aria-hidden="true">!</span><p>เลือกทางทุจริต<strong>{currentTotals.corruption}</strong></p></article>
                <article className="is-timeout"><span aria-hidden="true">?</span><p>ไม่ได้ตอบ<strong>{currentTotals.timeout}</strong></p></article>
              </section>
              <div className="student-cycle-result__total"><span>รอบนี้</span><strong>{currentTotal} การตัดสินใจ</strong><small>รวมคำถามปกติและเหตุการณ์วิกฤตที่สรุปผลแล้ว</small></div>
              <section className={`student-personal-impact is-${personalNarrative.kind}`} aria-labelledby="personal-impact-title">
                <h2 id="personal-impact-title">ผลจากการตัดสินใจของฉัน</h2>
                <p>{personalNarrative.decisionMessage}</p>
                <small>{personalNarrative.cityMessage}</small>
              </section>
            </>
          ) : (
            <section className="student-cycle-result__data-state">ยังไม่มีข้อมูลผลส่วนตัวสำหรับรอบนี้</section>
          )}
          <section className="student-cycle-result__secondary"><article><span>อาชีพของฉัน</span><strong>{role?.label ?? 'รอข้อมูลอาชีพ'}</strong></article><article><span>ผลเมืองร่วมกัน</span><strong>{formatCityLevel(room.cityLevel)}</strong><small>{Math.round(room.cityScore).toLocaleString('th-TH')} / 1,000 คะแนน</small></article></section>
          {personalResultsFailed || !hasPrivateResults ? null : <details className="student-cycle-result__cumulative"><summary>ดูผลสะสมทั้งหมด</summary><div><span>เลือกทางสุจริต <strong>{cumulativeTotals.integrity}</strong></span><span>เลือกทางทุจริต <strong>{cumulativeTotals.corruption}</strong></span><span>ไม่ได้ตอบ <strong>{cumulativeTotals.timeout}</strong></span><span>รวม <strong>{cumulativeTotal} การตัดสินใจ</strong></span></div></details>}
          <p className="student-cycle-result__reflection">{CITY_REFLECTIONS[room.cityLevel]}</p>
          {room.status === 'game-result' ? <strong className="student-cycle-result__waiting">รอครูเลือกว่าจะเล่นต่อหรือจบกิจกรรม</strong> : <button className="student-cycle-result__home" onClick={goHome} type="button">กลับหน้าหลัก</button>}
        </section>
      </main>
    )
  }

  return (
    <main className={`teacher-result-page is-${room.cityLevel}`}>
      <div className="result-city-art" aria-hidden="true"><CityScene buildingLevels={room.buildingLevels} cityLevel={room.cityLevel} /></div><div className="result-city-veil" aria-hidden="true" />
      <header className="teacher-result-topbar"><div><span>🚩</span><p>รอบที่<strong>{room.gameCycle + 1} / {MAX_GAME_CYCLES}</strong></p></div><div><span>⭐</span><p>คะแนนเมือง<strong>{Math.round(room.cityScore).toLocaleString('th-TH')}</strong></p></div><div><span>🏆</span><p>อาชีพที่ผ่านแล้ว<strong>{roleProgress} / {MAX_GAME_CYCLES}</strong></p></div><div><span>👥</span><p>ห้องเรียน<strong>{room.roomId}</strong></p></div></header>
      <section className="teacher-result-shell">
        <nav className="teacher-result-tabs" aria-label="ส่วนข้อมูลผลลัพธ์" role="tablist">
          {([
            ['summary', 'สรุป'],
            ['learning', 'ผลการเรียนรู้'],
            ['city', 'รายละเอียดเมือง'],
          ] as const).map(([tab, label]) => (
            <button aria-controls={`teacher-result-panel-${tab}`} aria-selected={activeTeacherTab === tab} className={activeTeacherTab === tab ? 'is-active' : ''} id={`teacher-result-tab-${tab}`} key={tab} onClick={() => setActiveTeacherTab(tab)} role="tab" type="button">{label}</button>
          ))}
        </nav>
        <div className="teacher-result-panels">
          {activeTeacherTab === 'summary' ? <article className="teacher-result-summary" aria-labelledby="teacher-result-tab-summary" id="teacher-result-panel-summary" role="tabpanel">
            <header className="teacher-result-hero"><div className="teacher-result-hero__level"><span>{CITY_RESULT_EMOJI[room.cityLevel]}</span><div><small>ผลเมืองรอบที่ {room.gameCycle + 1}</small><h1>{formatCityLevel(room.cityLevel)}</h1></div></div><div className="teacher-result-hero__score"><span>คะแนนเมือง</span><strong>{Math.round(room.cityScore).toLocaleString('th-TH')} <small>/ 1,000</small></strong></div><div className={`teacher-result-hero__delta ${cycleScoreDelta >= 0 ? 'is-positive' : 'is-negative'}`}><span>ผลสุทธิรอบนี้</span><strong>{signed(cycleScoreDelta)} คะแนน</strong></div><p>{CITY_REFLECTIONS[room.cityLevel]}</p></header>
            <section className="teacher-result-city-preview" aria-labelledby="teacher-result-city-preview-title"><div className="teacher-section-heading"><div><h2 id="teacher-result-city-preview-title">ภาพเมืองล่าสุด</h2><p>{formatCityLevel(room.cityLevel)} • {Math.round(room.cityScore).toLocaleString('th-TH')} / 1,000 คะแนน</p></div></div><div className="teacher-result-city-preview__scene"><CityScene buildingLevels={buildingLevels} cityLevel={room.cityLevel} /></div></section>
            <section className="teacher-answer-summary" aria-labelledby="answer-summary-title"><h2 id="answer-summary-title">สรุปคำตอบรอบนี้</h2><div><article className="is-integrity"><span>✓</span><p>สุจริต<strong>{latestTotals.integrityCount}</strong></p></article><article className="is-corruption"><span>!</span><p>ทุจริต<strong>{latestTotals.corruptionCount}</strong></p></article><article className="is-timeout"><span>?</span><p>ไม่ตอบ<strong>{latestTotals.timeoutCount}</strong></p></article></div></section>
            <section className="teacher-building-summary" aria-labelledby="building-summary-title"><div className="teacher-section-heading"><div><h2 id="building-summary-title">ภาพรวมอาคารทั้ง 7 แห่ง</h2><p>ผลกระทบเฉลี่ยจากคำตอบในรอบนี้</p></div></div><div className="teacher-building-summary__grid">{buildingResults.map((building) => <article className={building.average > 0 ? 'is-positive' : building.average < 0 ? 'is-negative' : 'is-neutral'} key={building.id}><span>{building.icon}</span><p>{building.label}<small>ระดับ {building.level > 0 ? '+' : ''}{building.level} • {building.direction}</small></p><strong>{signed(building.average)}</strong></article>)}</div></section>
            {roleProgress >= MAX_GAME_CYCLES ? <strong className="teacher-result-complete">✓ นักเรียนได้ทดลองครบทั้ง 8 อาชีพแล้ว</strong> : null}{teacherError ? <output className="teacher-result-error">{teacherError}</output> : null}
          </article> : null}
          {activeTeacherTab === 'city' ? <section className="teacher-result-details" aria-labelledby="teacher-result-tab-city" id="teacher-result-panel-city" role="tabpanel">
            <section className="teacher-result-levels"><div className="teacher-section-heading"><div><h2>ระดับเมือง</h2><p>เกณฑ์คะแนนรวมของเมือง</p></div></div><div className="teacher-result-levels__grid">{CITY_LEVEL_STEPS.map((step) => <article className={step.id === room.cityLevel ? 'is-current' : ''} key={step.id}><span>{CITY_RESULT_EMOJI[step.id]}</span><strong>{formatCityLevel(step.id)}</strong><small>{step.range} คะแนน</small></article>)}</div></section>
            <section className="teacher-result-answer-details"><div className="teacher-section-heading"><div><h2>สรุปคำตอบ</h2><p>ข้อมูลรวมของห้องเรียน ไม่แสดงผลรายบุคคล</p></div></div><div className="teacher-result-answer-table" role="table"><div className="is-heading" role="row"><span role="columnheader">ประเภทการตัดสินใจ</span><span role="columnheader">รอบล่าสุด</span><span role="columnheader">สัดส่วน</span><span role="columnheader">สะสมทั้งหมด</span></div><div role="row"><strong role="cell">สุจริตรอบล่าสุด</strong><span role="cell">{latestTotals.integrityCount}</span><span role="cell">{percentage(latestTotals.integrityCount)}%</span><span role="cell">สุจริตสะสม {room.integrityTotal}</span></div><div role="row"><strong role="cell">ทุจริตรอบล่าสุด</strong><span role="cell">{latestTotals.corruptionCount}</span><span role="cell">{percentage(latestTotals.corruptionCount)}%</span><span role="cell">ทุจริตสะสม {room.corruptionTotal}</span></div><div role="row"><strong role="cell">ไม่ตอบรอบล่าสุด</strong><span role="cell">{latestTotals.timeoutCount}</span><span role="cell">{percentage(latestTotals.timeoutCount)}%</span><span role="cell">ไม่ตอบสะสม {room.timeoutTotal}</span></div></div></section>
            <section className="teacher-result-building-details"><div className="teacher-section-heading"><div><h2>ผลลัพธ์อาคาร</h2><p>รายละเอียดจากข้อมูลจริงที่สรุปแล้วในรอบนี้</p></div></div><div className="teacher-result-building-details__grid">{buildingResults.map((building) => <article className={building.average > 0 ? 'is-positive' : building.average < 0 ? 'is-negative' : 'is-neutral'} key={building.id}><header><span>{building.icon}</span><div><h3>{building.label}</h3><p>ระดับ {building.level > 0 ? '+' : ''}{building.level} • {BUILDING_LEVEL_LABELS[building.level]}</p></div><strong>{signed(building.average)}</strong></header><dl><div><dt>สุจริต</dt><dd>{building.summary.integrityCount}</dd></div><div><dt>ทุจริต</dt><dd>{building.summary.corruptionCount}</dd></div><div><dt>ไม่ตอบ</dt><dd>{building.summary.timeoutCount}</dd></div></dl><button onClick={() => setActiveBuildingId(building.id)} type="button">ดูรายละเอียด</button></article>)}</div></section>
          </section> : null}
          {activeTeacherTab === 'learning' ? <section className="teacher-result-evidence-panel" aria-labelledby="teacher-result-tab-learning" id="teacher-result-panel-learning" role="tabpanel">
            {room.status === 'finished' ? <FinishedLearningEvidenceSection evidence={liveLearningEvidence ?? room.publicLearningEvidence ?? null} publishing={publishingLearningEvidence} room={room} /> : null}
            {showTeacherObservationSection ? <TeacherObservationSection isTeacher={isTeacher} providedObservation={observationEvidence} roomId={roomId} useProvidedObservation={room.status === 'finished'} /> : null}
          </section> : null}
        </div>
        <footer className="teacher-result-actions">{canContinue ? <button className="is-primary" disabled={busy} onClick={() => void continueCity()} type="button">▶ เล่นต่อเพื่อพัฒนาเมือง</button> : null}{room.status === 'game-result' ? <button disabled={busy} onClick={() => void endActivity(false)} type="button">จบกิจกรรม</button> : null}{room.status === 'finished' ? <Link className="teacher-evidence-dashboard-link" to={`/teacher/evidence/${roomId}`}>หลักฐานการเรียนรู้และพัฒนา</Link> : null}{!canContinue ? <button className="is-primary" disabled={busy} onClick={() => void endActivity(true)} type="button">เริ่มห้องใหม่</button> : null}<button className="teacher-result-home-button" disabled={busy} onClick={goHome} type="button"><span aria-hidden="true">⌂</span> กลับหน้าหลัก</button></footer>
      </section>
      {activeBuilding ? <div className="teacher-building-modal" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setActiveBuildingId(null) }}><section aria-labelledby="building-detail-title" aria-modal="true" role="dialog"><button aria-label="ปิดรายละเอียดอาคาร" className="teacher-building-modal__close" onClick={() => setActiveBuildingId(null)} type="button">×</button><header><span>{activeBuilding.icon}</span><div><small>รายละเอียดอาคาร</small><h2 id="building-detail-title">{activeBuilding.label}</h2></div></header><div className="teacher-building-modal__state"><span>สถานะปัจจุบัน</span><strong>ระดับ {activeBuilding.level > 0 ? '+' : ''}{activeBuilding.level} • {BUILDING_LEVEL_LABELS[activeBuilding.level]}</strong><small>{activeBuilding.direction}</small></div><div className="teacher-building-modal__metrics"><article><span>ผลกระทบเฉลี่ยรอบนี้</span><strong>{signed(activeBuilding.average)}</strong></article><article><span>จำนวนคำตอบ</span><strong>{activeBuilding.summary.participantCount}</strong></article></div><dl><div><dt>เลือกทางสุจริต</dt><dd>{activeBuilding.summary.integrityCount}</dd></div><div><dt>เลือกทางทุจริต</dt><dd>{activeBuilding.summary.corruptionCount}</dd></div><div><dt>ไม่ได้ตอบ</dt><dd>{activeBuilding.summary.timeoutCount}</dd></div></dl><button className="teacher-building-modal__done" onClick={() => setActiveBuildingId(null)} type="button">ปิดรายละเอียด</button></section></div> : null}
    </main>
  )
}
