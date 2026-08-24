import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { CityLoader } from '../components/CityLoader'
import { FullscreenToggle } from '../components/FullscreenToggle'
import { getRoleQuestion } from '../domain/classroomGameLoop'
import { orderChoicesForPlayer } from '../domain/classroomQuestions'
import { ROLES } from '../domain/ourCity'
import { usePlayer, usePlayerAnswers, useQuestions, useRoom } from '../hooks/useGameData'
import { useCountdown } from '../hooks/useCountdown'
import { useSoundLoop } from '../hooks/useSoundPack'
import { selectGameAmbience } from '../lib/soundPack'
import { classroomFriendlyError } from '../services'
import { getClassroomStudentSession, saveClassroomViewerRole } from '../services/sessionStorage'
import { getCrisisEvent, orderCrisisChoicesForPlayer } from '../domain/cityCrisisEvents'
import { isCrisisAnswerRecord, isQuestionAnswerRecord } from '../types/classroomGame'
import { hideFailedQuestionScene, resolveQuestionSceneImageUrl } from './gameQuestionScenes'
// TEMPORARY DIAGNOSTIC — remove alongside src/debug when done
import { debugLog, isDebugMode } from '../debug/useDebugLog'
// DIAGNOSTIC FLIGHT RECORDER — opt-in via ?debug=2, see src/debug/flightRecorder.ts
import { withActionTiming } from '../debug/flightRecorder'

/**
 * Full-coverage lock shown the instant a countdown hits zero. Not a dismiss-
 * able notice: it sits over the answer area so an unanswered student cannot
 * mistake a disabled button for a live one, and it disappears on its own the
 * moment classroom state moves past this question.
 */
const TimeoutLockOverlay = () => (
  <div
    aria-live="assertive"
    className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-[#050b14]/93 px-6 text-center backdrop-blur-sm"
    role="status"
  >
    <div>
      <p className="text-xl font-black text-[#f4c96d]">หมดเวลาสำหรับข้อนี้</p>
      <p className="mt-2 text-base font-bold text-white">ระบบปิดรับคำตอบแล้ว</p>
      <p className="mt-1 text-sm text-[#a9c5c3]">รอครูเข้าสู่ข้อถัดไป</p>
    </div>
  </div>
)

type StudentWaitingVariant = 'normal' | 'crisis'

interface StudentQuestionStageProps {
  children: ReactNode
  waitingVariant: StudentWaitingVariant | null
}

export const QuestionSceneImage = ({ src }: { src: string }) => (
  <figure className="game-play-question-media">
    <img
      alt="ภาพประกอบสถานการณ์"
      decoding="async"
      fetchPriority="high"
      height={960}
      loading="eager"
      onError={(event) => hideFailedQuestionScene(event.currentTarget)}
      src={src}
      width={1280}
    />
  </figure>
)

export const StudentImpactWaitingPresentation = ({ variant }: { variant: StudentWaitingVariant }) => {
  const crisis = variant === 'crisis'
  return (
    <section
      aria-live="polite"
      className={`student-impact-waiting${crisis ? ' student-impact-waiting--crisis' : ''}`}
      role="status"
    >
      <div className="student-impact-waiting__city" aria-hidden="true">
        <img alt="" src="/images/new-city/backgrounds/city-overview-normal.webp" />
        <span className="student-impact-waiting__glow" />
      </div>
      <div className="student-impact-waiting__content">
        <span className="student-impact-waiting__status"><i aria-hidden="true">✓</i> ส่งคำตอบแล้ว</span>
        <span className="student-impact-waiting__icon" aria-hidden="true">{crisis ? '⚠' : '🏙️'}</span>
        <h1>{crisis ? 'กำลังประเมินผลกระทบจากวิกฤต' : 'กำลังสรุปผลการตัดสินใจของเมือง'}</h1>
        <p>{crisis ? 'ผลของการตัดสินใจครั้งนี้ส่งผลต่อเมือง ×2' : 'การตัดสินใจของทุกคนกำลังส่งผลต่อเมือง'}</p>
        <strong>{crisis ? 'ดูผลกระทบที่หน้าจอครู' : 'ดูการเปลี่ยนแปลงที่หน้าจอครู'}</strong>
        <span className="student-impact-waiting__progress" aria-hidden="true"><i /><i /><i /></span>
      </div>
    </section>
  )
}

export const StudentQuestionStage = ({ children, waitingVariant }: StudentQuestionStageProps) => (
  waitingVariant
    ? <StudentImpactWaitingPresentation variant={waitingVariant} />
    : <div className="student-question-entry">{children}</div>
)

export const GamePage = () => {
  const roomId = (useParams().roomCode ?? '').toUpperCase()
  const session = getClassroomStudentSession()
  const { service, uid } = useGame()
  const navigate = useNavigate()
  const roomState = useRoom(roomId)
  const activePlayerId = session?.roomId === roomId ? session.playerId : ''
  const playerState = usePlayer(roomId, activePlayerId)
  const questionsState = useQuestions(roomId)
  const answersState = usePlayerAnswers(activePlayerId ? roomId : '', activePlayerId, activePlayerId ? uid : '')
  const remaining = useCountdown(roomState.data?.questionDeadlineAt ?? null)
  const [savingChoiceId, setSavingChoiceId] = useState('')
  const [error, setError] = useState('')
  const interactionIdentity = `${roomId}:${roomState.data?.gameCycle ?? 'loading'}:${roomState.data?.currentQuestionNumber ?? 'loading'}:${roomState.data?.currentCrisisEventId ?? 'question'}`
  const interactionIdentityRef = useRef(interactionIdentity)

  useEffect(() => {
    interactionIdentityRef.current = interactionIdentity
    setSavingChoiceId('')
    setError('')
  }, [interactionIdentity])

  useEffect(() => {
    saveClassroomViewerRole('student')
  }, [])

  useEffect(() => {
    if (roomState.data?.status === 'role-draw') navigate(`/role-draw/${roomId}`, { replace: true })
    if (roomState.data?.status === 'game-result' || roomState.data?.status === 'finished') navigate(`/result/${roomId}`, { replace: true })
  }, [navigate, roomId, roomState.data?.status])

  // TEMPORARY DIAGNOSTIC — track Student-side room snapshot changes
  useEffect(() => {
    if (!isDebugMode() || !roomState.data) return
    debugLog('student', 'room render', `status=${roomState.data.status} q=${roomState.data.currentQuestionNumber} deadline=${roomState.data.questionDeadlineAt ?? 'null'}`)
  }, [roomState.data?.status, roomState.data?.currentQuestionNumber, roomState.data?.questionDeadlineAt, roomState.data])

  const question = useMemo(() => {
    const room = roomState.data
    const player = playerState.data
    if (!room || !player?.roleId || room.currentQuestionNumber === 0) return null
    return getRoleQuestion(questionsState.data, player.roleId, room.currentQuestionNumber)
  }, [playerState.data, questionsState.data, roomState.data])

  const orderedChoices = useMemo(
    () => (question && session ? orderChoicesForPlayer(question, session.playerId) : []),
    [question, session],
  )
  const existingAnswer = question
    ? answersState.data.find((answer) => isQuestionAnswerRecord(answer) && answer.gameCycle === roomState.data?.gameCycle && answer.questionNumber === roomState.data?.currentQuestionNumber && answer.questionId === question.questionId)
    : undefined
  const crisisEvent = roomState.data?.currentCrisisEventId ? getCrisisEvent(roomState.data.currentCrisisEventId) : null
  const crisisDilemma = crisisEvent && playerState.data?.roleId ? crisisEvent.dilemmas[playerState.data.roleId] : null
  const orderedCrisisChoices = useMemo(
    () => (crisisDilemma && crisisEvent && session ? orderCrisisChoicesForPlayer(crisisDilemma, roomId, session.playerId, crisisEvent.id) : []),
    [crisisDilemma, crisisEvent, roomId, session],
  )
  const existingCrisisAnswer = crisisEvent
    ? answersState.data.find((answer) => isCrisisAnswerRecord(answer)
      && answer.gameCycle === roomState.data?.gameCycle
      && answer.eventId === crisisEvent.id
      && answer.playerId === activePlayerId)
    : undefined
  const role = ROLES.find((item) => item.id === playerState.data?.roleId)
  const countdownEnded = roomState.data?.status === 'playing' && remaining === 0 && !existingAnswer
  useSoundLoop('ambience', selectGameAmbience(roomState.data?.status, playerState.data?.roleId))

  if (!session || session.roomId !== roomId) return <Navigate replace to={`/join?room=${roomId}`} />
  if (roomState.data?.status === 'lobby') return <Navigate replace to={`/lobby/${roomId}`} />
  if (roomState.data?.status === 'role-draw') return <Navigate replace to={`/role-draw/${roomId}`} />

  const answer = async (choiceId: string): Promise<void> => {
    // Defense in depth: the countdown disables the buttons, but a click
    // queued in the same tick the deadline passes must still be rejected
    // here rather than reaching the (authoritative, server-enforced) write.
    if (!roomState.data || roomState.data.status !== 'playing' || !question || existingAnswer || remaining <= 0) return
    const submittedForIdentity = interactionIdentityRef.current
    const currentQuestionNumber = roomState.data.currentQuestionNumber
    if (isDebugMode()) debugLog('student', 'answer tap', `q=${currentQuestionNumber}`)
    setSavingChoiceId(choiceId)
    setError('')
    try {
      if (isDebugMode()) debugLog('student', 'submit START', `q=${currentQuestionNumber}`)
      await withActionTiming('submitAnswer', roomId, () => service.submitAnswer(
        roomId,
        session.playerId,
        uid,
        currentQuestionNumber,
        question.questionId,
        choiceId,
      ), { questionNumber: currentQuestionNumber })
      if (isDebugMode()) debugLog('student', 'submit OK')
    } catch (reason) {
      if (isDebugMode()) debugLog('student', 'submit ERR', String(reason))
      if (interactionIdentityRef.current === submittedForIdentity) setError(classroomFriendlyError(reason))
    } finally {
      if (interactionIdentityRef.current === submittedForIdentity) setSavingChoiceId('')
    }
  }

  const answerCrisis = async (choiceId: string): Promise<void> => {
    if (!roomState.data || roomState.data.status !== 'crisis-playing' || !crisisDilemma || existingCrisisAnswer || remaining <= 0) return
    const submittedForIdentity = interactionIdentityRef.current
    setSavingChoiceId(choiceId); setError('')
    try { await withActionTiming('submitCrisisAnswer', roomId, () => service.submitCrisisAnswer(roomId, session.playerId, uid, choiceId)) }
    catch (reason) { if (interactionIdentityRef.current === submittedForIdentity) setError(classroomFriendlyError(reason)) }
    finally { if (interactionIdentityRef.current === submittedForIdentity) setSavingChoiceId('') }
  }

  if (roomState.loading || playerState.loading || questionsState.loading) {
    return <CityLoader variant="full" message="กำลังเตรียมคำถาม..." />
  }
  if (!roomState.data || !playerState.data) {
    return <Navigate replace to={`/join?room=${roomId}`} />
  }
  if (crisisEvent && crisisDilemma) {
    const active = roomState.data.status === 'crisis-playing'
    const intro = roomState.data.status === 'crisis-intro'
    // A local pending snapshot may expose the answer before the submit
    // promise settles. Keep the question composition until that existing
    // operation confirms; refresh/re-entry records have no saving id.
    const waitingVariant = (existingCrisisAnswer && !savingChoiceId) || roomState.data.status === 'crisis-result' ? 'crisis' : null
    return (
      <main className="our-city-page crisis-student-page min-h-dvh px-4 py-5 md:px-7 md:py-7">
        <section className="crisis-student-shell mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-4xl flex-col">
          <div className="game-play-brandbar"><Link className="game-brand" to="/"><span className="game-brand__mark" aria-hidden="true">🏙️</span><strong>OUR CITY<br /><b>OUR CHOICE</b></strong></Link><div className="game-play-brandbar__actions"><span>ห้อง {roomId}</span><FullscreenToggle className="game-play-fullscreen-button" /></div></div>
          <StudentQuestionStage key={`${interactionIdentity}:${roomState.data.status}`} waitingVariant={waitingVariant}>
            <header className="crisis-student-header">
              <p><span aria-hidden="true">⚠</span> สถานการณ์วิกฤต <small>เหตุการณ์ {crisisEvent.index}/2</small></p>
              <h1>{crisisEvent.title}</h1>
              <div className="crisis-student-meta"><span>อาชีพของคุณ: {role?.label}</span><b>ผลกระทบ ×2</b></div>
              <small className="crisis-student-impact-note">การตัดสินใจในวิกฤตส่งผลต่อเมืองรุนแรงกว่าคำถามปกติ</small>
              {active ? <strong className={remaining <= 5 ? 'is-ending' : ''}>{remaining} วินาที</strong> : null}
            </header>
            <article className="crisis-student-card">
              {intro ? (
                <div className="crisis-student-intro">
                  <span aria-hidden="true">⚠️</span><h2>{crisisEvent.subtitle}</h2><p>{crisisEvent.situation}</p>
                  <strong>รอครูเปิดการตัดสินใจ…</strong>
                </div>
              ) : (
                <>
                  <p className="crisis-student-summary">{crisisEvent.situation}</p>
                  <p className="crisis-student-kicker">สถานการณ์เฉพาะบทบาท</p>
                  <h2>{crisisDilemma.prompt}</h2>
                  <div className="crisis-student-choices relative">
                    {orderedCrisisChoices.map((choice, index) => (
                      <button className={existingCrisisAnswer?.choiceId === choice.id ? 'is-selected' : ''} disabled={!active || Boolean(existingCrisisAnswer) || Boolean(savingChoiceId) || remaining <= 0} key={choice.id} onClick={() => void answerCrisis(choice.id)}>
                        <span>{index === 0 ? 'ก.' : 'ข.'}</span>{choice.text}
                      </button>
                    ))}
                    {active && remaining === 0 && !existingCrisisAnswer ? <TimeoutLockOverlay /> : null}
                  </div>
                  <div className="crisis-student-feedback" aria-live="polite">
                    {error ? <p className="text-red-200">{error}</p> : null}
                  </div>
                </>
              )}
            </article>
          </StudentQuestionStage>
        </section>
      </main>
    )
  }
  if (!playerState.data.roleId || !question) {
    return <main className="our-city-page grid min-h-dvh place-items-center px-5 text-center"><p>กำลังรับอาชีพและคำถามจากครู…</p></main>
  }
  const questionSceneImageUrl = resolveQuestionSceneImageUrl(question.questionId, question.imageUrl)

  return (
    <main className="our-city-page game-play-page min-h-dvh px-4 py-5 md:px-7 md:py-7">
      <section className="game-play-shell mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-4xl flex-col">
        <div className="game-play-brandbar"><Link className="game-brand" to="/"><span className="game-brand__mark" aria-hidden="true">🏙️</span><strong>OUR CITY<br /><b>OUR CHOICE</b></strong></Link><span>ห้อง {roomId}</span></div>
        <StudentQuestionStage key={interactionIdentity} waitingVariant={(existingAnswer && !savingChoiceId) || roomState.data.status === 'round-result' ? 'normal' : null}>
          <header className="our-city-panel game-play-header flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-sm font-bold text-[#f4c96d]">รอบที่ {roomState.data.gameCycle + 1} • อาชีพ: {role?.label}</p>
              <h1 className="text-2xl font-black">คำถามข้อที่ {roomState.data.currentQuestionNumber}/10</h1>
            </div>
            <div className={`rounded-2xl px-5 py-3 text-center ${remaining <= 5 ? 'bg-red-400/15 text-red-100' : 'bg-white/8'}`}>
              <span className="block text-xs text-current/70">เวลาที่เหลือ</span>
              <strong className="text-2xl">{roomState.data.status === 'playing' ? remaining : 0} วิ</strong>
            </div>
          </header>

          <article className="our-city-panel game-play-card mt-4 flex flex-1 flex-col p-6 md:p-9">
            <div className={`game-play-question-layout${questionSceneImageUrl ? ' has-scene' : ''}`}>
              <div className="game-play-question-copy">
                <p className="text-sm font-bold tracking-[.14em] text-[#8fc4c5] uppercase">สถานการณ์ของคุณ</p>
                <h2 className="game-play-prompt mt-4 text-2xl leading-relaxed font-black md:text-4xl">{question.prompt}</h2>
              </div>
              {questionSceneImageUrl ? <QuestionSceneImage key={questionSceneImageUrl} src={questionSceneImageUrl} /> : null}

              <div className="game-play-choices relative mt-auto grid gap-4 pt-8 md:grid-cols-2">
                {orderedChoices.map((choice, index) => (
                  <button
                    className={`game-play-choice min-h-32 rounded-2xl border p-5 text-left text-lg font-bold transition ${
                      existingAnswer?.choiceId === choice.id
                        ? 'is-selected'
                        : 'is-unanswered'
                    } disabled:cursor-not-allowed disabled:opacity-55`}
                    disabled={Boolean(existingAnswer) || Boolean(savingChoiceId) || roomState.data?.status !== 'playing' || remaining <= 0}
                    key={choice.id}
                    onClick={() => void answer(choice.id)}
                  >
                    <span className="mr-3 inline-grid h-10 w-10 place-items-center rounded-full border border-white/25 text-[#f4c96d]">
                      {index === 0 ? 'ก.' : 'ข.'}
                    </span>
                    {choice.text}
                  </button>
                ))}
                {countdownEnded ? <TimeoutLockOverlay /> : null}
              </div>

              <div className="game-play-feedback mt-6 min-h-14 text-center" aria-live="polite">
                {error ? <p className="mt-2 text-red-200">{error}</p> : null}
              </div>
            </div>
          </article>
        </StudentQuestionStage>
      </section>
    </main>
  )
}
