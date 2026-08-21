import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { CityLoader } from '../components/CityLoader'
import { getRoleQuestion } from '../domain/classroomGameLoop'
import { orderChoicesForPlayer } from '../domain/classroomQuestions'
import { ROLES } from '../domain/ourCity'
import { usePlayer, usePlayerAnswers, useQuestions, useRoom } from '../hooks/useGameData'
import { useCountdown } from '../hooks/useCountdown'
import { classroomFriendlyError } from '../services'
import { getClassroomStudentSession, saveClassroomViewerRole } from '../services/sessionStorage'
import { getCrisisEvent } from '../domain/cityCrisisEvents'
import { isCrisisAnswerRecord, isQuestionAnswerRecord } from '../types/classroomGame'

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

  const question = useMemo(() => {
    const room = roomState.data
    const player = playerState.data
    if (!room || !player?.roleId || room.currentQuestionNumber === 0) return null
    return getRoleQuestion(questionsState.data, player.roleId, room.currentQuestionNumber)
  }, [playerState.data, questionsState.data, roomState.data])

  const orderedChoices = useMemo(
    () => (question && session ? orderChoicesForPlayer(question, roomId, session.playerId) : []),
    [question, roomId, session],
  )
  const existingAnswer = question
    ? answersState.data.find((answer) => isQuestionAnswerRecord(answer) && answer.gameCycle === roomState.data?.gameCycle && answer.questionNumber === roomState.data?.currentQuestionNumber && answer.questionId === question.questionId)
    : undefined
  const crisisEvent = roomState.data?.currentCrisisEventId ? getCrisisEvent(roomState.data.currentCrisisEventId) : null
  const crisisDilemma = crisisEvent && playerState.data?.roleId ? crisisEvent.dilemmas[playerState.data.roleId] : null
  const existingCrisisAnswer = crisisEvent
    ? answersState.data.find((answer) => isCrisisAnswerRecord(answer) && answer.gameCycle === roomState.data?.gameCycle && answer.eventId === crisisEvent.id)
    : undefined
  const role = ROLES.find((item) => item.id === playerState.data?.roleId)
  const countdownEnded = roomState.data?.status === 'playing' && remaining === 0 && !existingAnswer

  if (!session || session.roomId !== roomId) return <Navigate replace to={`/join?room=${roomId}`} />
  if (roomState.data?.status === 'lobby') return <Navigate replace to={`/lobby/${roomId}`} />
  if (roomState.data?.status === 'role-draw') return <Navigate replace to={`/role-draw/${roomId}`} />

  const answer = async (choiceId: string): Promise<void> => {
    if (!roomState.data || roomState.data.status !== 'playing' || !question || existingAnswer) return
    const submittedForIdentity = interactionIdentityRef.current
    setSavingChoiceId(choiceId)
    setError('')
    try {
      await service.submitAnswer(
        roomId,
        session.playerId,
        uid,
        roomState.data.currentQuestionNumber,
        question.questionId,
        choiceId,
      )
    } catch (reason) {
      if (interactionIdentityRef.current === submittedForIdentity) setError(classroomFriendlyError(reason))
    } finally {
      if (interactionIdentityRef.current === submittedForIdentity) setSavingChoiceId('')
    }
  }

  const answerCrisis = async (choiceId: string): Promise<void> => {
    if (!roomState.data || roomState.data.status !== 'crisis-playing' || !crisisDilemma || existingCrisisAnswer) return
    const submittedForIdentity = interactionIdentityRef.current
    setSavingChoiceId(choiceId); setError('')
    try { await service.submitCrisisAnswer(roomId, session.playerId, uid, choiceId) }
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
    return (
      <main className="our-city-page crisis-student-page min-h-dvh px-4 py-5 md:px-7 md:py-7">
        <section className="crisis-student-shell mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-4xl flex-col">
          <div className="game-play-brandbar"><Link className="game-brand" to="/"><span className="game-brand__mark" aria-hidden="true">🏙️</span><strong>OUR CITY<br /><b>OUR CHOICE</b></strong></Link><span>ห้อง {roomId}</span></div>
          <header className="crisis-student-header">
            <p>เหตุการณ์วิกฤตเมือง {crisisEvent.index}/2</p>
            <h1>{crisisEvent.title}</h1>
            <span>อาชีพของคุณ: {role?.label} • <b>ผลกระทบ ×2</b></span>
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
                <div className="crisis-student-choices">
                  {crisisDilemma.choices.map((choice, index) => (
                    <button disabled={!active || Boolean(existingCrisisAnswer) || Boolean(savingChoiceId)} key={choice.id} onClick={() => void answerCrisis(choice.id)}>
                      <span>{index === 0 ? 'ก.' : 'ข.'}</span>{choice.text}
                    </button>
                  ))}
                </div>
                <div className="crisis-student-feedback" aria-live="polite">
                  {existingCrisisAnswer ? <p>ส่งการตัดสินใจแล้ว<br /><small>รอเพื่อนและครูสรุปผลวิกฤต</small></p> : null}
                  {active && remaining === 0 && !existingCrisisAnswer ? <p>กำลังตรวจสอบเวลาจากห้องเรียน…</p> : null}
                  {roomState.data.status === 'crisis-result' ? <p>วิกฤตนี้สิ้นสุดแล้ว<br /><small>รอครูพาเมืองเข้าสู่คำถามถัดไป</small></p> : null}
                  {error ? <p className="text-red-200">{error}</p> : null}
                </div>
              </>
            )}
          </article>
        </section>
      </main>
    )
  }
  if (!playerState.data.roleId || !question) {
    return <main className="our-city-page grid min-h-dvh place-items-center px-5 text-center"><p>กำลังรับอาชีพและคำถามจากครู…</p></main>
  }

  return (
    <main className="our-city-page game-play-page min-h-dvh px-4 py-5 md:px-7 md:py-7">
      <section className="game-play-shell mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-4xl flex-col">
        <div className="game-play-brandbar"><Link className="game-brand" to="/"><span className="game-brand__mark" aria-hidden="true">🏙️</span><strong>OUR CITY<br /><b>OUR CHOICE</b></strong></Link><span>ห้อง {roomId}</span></div>
        <header className="our-city-panel game-play-header flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-sm font-bold text-[#f4c96d]">ชุดที่ {roomState.data.gameCycle + 1} • อาชีพ: {role?.label}</p>
            <h1 className="text-2xl font-black">คำถามข้อที่ {roomState.data.currentQuestionNumber}/10</h1>
          </div>
          <div className={`rounded-2xl px-5 py-3 text-center ${remaining <= 5 ? 'bg-red-400/15 text-red-100' : 'bg-white/8'}`}>
            <span className="block text-xs text-current/70">เวลาที่เหลือ</span>
            <strong className="text-2xl">{roomState.data.status === 'playing' ? remaining : 0} วิ</strong>
          </div>
        </header>

        <article className="our-city-panel game-play-card mt-4 flex flex-1 flex-col p-6 md:p-9">
          {question.imageUrl ? <img className="game-play-image mb-6 max-h-64 w-full rounded-2xl object-cover" src={question.imageUrl} alt="ภาพประกอบสถานการณ์" /> : null}
          <p className="text-sm font-bold tracking-[.14em] text-[#8fc4c5] uppercase">สถานการณ์ของคุณ</p>
          <h2 className="game-play-prompt mt-4 text-2xl leading-relaxed font-black md:text-4xl">{question.prompt}</h2>

          <div className="game-play-choices mt-auto grid gap-4 pt-8 md:grid-cols-2">
            {orderedChoices.map((choice, index) => (
              <button
                className={`game-play-choice min-h-32 rounded-2xl border p-5 text-left text-lg font-bold transition ${
                  existingAnswer?.choiceId === choice.id
                    ? 'border-[#f4c96d] bg-[#f4c96d]/12'
                    : 'border-white/18 bg-white/7 hover:border-white/40 hover:bg-white/10'
                } disabled:cursor-not-allowed disabled:opacity-55`}
                disabled={Boolean(existingAnswer) || Boolean(savingChoiceId) || roomState.data?.status !== 'playing'}
                key={choice.id}
                onClick={() => void answer(choice.id)}
              >
                <span className="mr-3 inline-grid h-10 w-10 place-items-center rounded-full border border-white/25 text-[#f4c96d]">
                  {index === 0 ? 'ก.' : 'ข.'}
                </span>
                {choice.text}
              </button>
            ))}
          </div>

          <div className="game-play-feedback mt-6 min-h-14 text-center" aria-live="polite">
            {existingAnswer && roomState.data.status === 'playing' ? (
              <p className="rounded-xl bg-[#8fc4c5]/12 px-4 py-3 font-bold text-[#bce2df]">
                ส่งคำตอบแล้ว <span className="block text-sm font-medium text-[#a9c5c3]">รอผลจากเมือง</span>
              </p>
            ) : null}
            {countdownEnded ? <p className="rounded-xl bg-white/8 px-4 py-3 font-bold text-[#d6d2c7]">กำลังตรวจสอบเวลาจากห้องเรียน…</p> : null}
            {roomState.data.status === 'round-result' ? <p className="rounded-xl bg-[#f4c96d]/12 px-4 py-3 font-bold text-[#f9dda0]">จบคำถามข้อนี้แล้ว • รอครูกดข้อถัดไป</p> : null}
            {error ? <p className="mt-2 text-red-200">{error}</p> : null}
          </div>
        </article>
      </section>
    </main>
  )
}
