import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { getRoleQuestion } from '../domain/classroomGameLoop'
import { orderChoicesForPlayer } from '../domain/classroomQuestions'
import { ROLES } from '../domain/ourCity'
import { usePlayer, usePlayerAnswers, useQuestions, useRoom } from '../hooks/useGameData'
import { useCountdown } from '../hooks/useCountdown'
import { classroomFriendlyError } from '../services'
import { getClassroomStudentSession } from '../services/sessionStorage'

export const GamePage = () => {
  const roomId = (useParams().roomCode ?? '').toUpperCase()
  const session = getClassroomStudentSession()
  const { service, uid } = useGame()
  const navigate = useNavigate()
  const roomState = useRoom(roomId)
  const playerState = usePlayer(roomId, session?.roomId === roomId ? session.playerId : '')
  const questionsState = useQuestions(roomId)
  const answersState = usePlayerAnswers(roomId, session?.playerId ?? '', uid)
  const remaining = useCountdown(roomState.data?.questionDeadlineAt ?? null)
  const [savingChoiceId, setSavingChoiceId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (roomState.data?.status === 'finished') navigate(`/result/${roomId}`, { replace: true })
  }, [navigate, roomId, roomState.data?.status])

  const question = useMemo(() => {
    const room = roomState.data
    const player = playerState.data
    if (!room || !player?.roleId) return null
    return getRoleQuestion(questionsState.data, player.roleId, room.currentQuestionNumber)
  }, [playerState.data, questionsState.data, roomState.data])

  const orderedChoices = useMemo(
    () => (question && session ? orderChoicesForPlayer(question, roomId, session.playerId) : []),
    [question, roomId, session],
  )
  const existingAnswer = question
    ? answersState.data.find((answer) => answer.questionId === question.questionId)
    : undefined
  const role = ROLES.find((item) => item.id === playerState.data?.roleId)
  const expired = roomState.data?.status === 'question' && remaining === 0 && !existingAnswer

  if (!session || session.roomId !== roomId) return <Navigate replace to={`/join?room=${roomId}`} />
  if (roomState.data?.status === 'waiting') return <Navigate replace to={`/lobby/${roomId}`} />

  const answer = async (choiceId: string): Promise<void> => {
    if (!roomState.data || !question || existingAnswer || expired) return
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
      setError(classroomFriendlyError(reason))
    } finally {
      setSavingChoiceId('')
    }
  }

  if (roomState.loading || playerState.loading || questionsState.loading) {
    return <main className="our-city-page grid min-h-dvh place-items-center text-xl">กำลังเตรียมคำถาม…</main>
  }
  if (!roomState.data || !playerState.data) {
    return <Navigate replace to={`/join?room=${roomId}`} />
  }
  if (!playerState.data.roleId || !question) {
    return <main className="our-city-page grid min-h-dvh place-items-center px-5 text-center"><p>กำลังรับอาชีพและคำถามจากครู…</p></main>
  }

  return (
    <main className="our-city-page min-h-dvh px-4 py-5 md:px-7 md:py-7">
      <section className="mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-4xl flex-col">
        <header className="our-city-panel flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-sm font-bold text-[#f4c96d]">{role?.label}</p>
            <h1 className="text-2xl font-black">คำถามข้อที่ {roomState.data.currentQuestionNumber}/10</h1>
          </div>
          <div className={`rounded-2xl px-5 py-3 text-center ${remaining <= 5 ? 'bg-red-400/15 text-red-100' : 'bg-white/8'}`}>
            <span className="block text-xs text-current/70">เวลาที่เหลือ</span>
            <strong className="text-2xl">{roomState.data.status === 'question' ? remaining : 0} วิ</strong>
          </div>
        </header>

        <article className="our-city-panel mt-4 flex flex-1 flex-col p-6 md:p-9">
          {question.imageUrl ? <img className="mb-6 max-h-64 w-full rounded-2xl object-cover" src={question.imageUrl} alt="ภาพประกอบสถานการณ์" /> : null}
          <p className="text-sm font-bold tracking-[.14em] text-[#8fc4c5] uppercase">สถานการณ์ของคุณ</p>
          <h2 className="mt-4 text-2xl leading-relaxed font-black md:text-4xl">{question.prompt}</h2>

          <div className="mt-auto grid gap-4 pt-8 md:grid-cols-2">
            {orderedChoices.map((choice, index) => (
              <button
                className={`min-h-32 rounded-2xl border p-5 text-left text-lg font-bold transition ${
                  existingAnswer?.choiceId === choice.id
                    ? 'border-[#f4c96d] bg-[#f4c96d]/12'
                    : 'border-white/18 bg-white/7 hover:border-white/40 hover:bg-white/10'
                } disabled:cursor-not-allowed disabled:opacity-55`}
                disabled={Boolean(existingAnswer) || Boolean(savingChoiceId) || expired || roomState.data?.status !== 'question'}
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

          <div className="mt-6 min-h-14 text-center" aria-live="polite">
            {existingAnswer && roomState.data.status === 'question' ? (
              <p className="rounded-xl bg-[#8fc4c5]/12 px-4 py-3 font-bold text-[#bce2df]">
                ส่งคำตอบแล้ว <span className="block text-sm font-medium text-[#a9c5c3]">รอผลจากเมือง</span>
              </p>
            ) : null}
            {expired ? <p className="rounded-xl bg-white/8 px-4 py-3 font-bold text-[#d6d2c7]">หมดเวลา <span className="block text-sm font-medium">รอครูสรุปรอบ</span></p> : null}
            {roomState.data.status === 'question-closed' ? <p className="rounded-xl bg-[#f4c96d]/12 px-4 py-3 font-bold text-[#f9dda0]">จบคำถามข้อนี้แล้ว • รอครูกดข้อถัดไป</p> : null}
            {error ? <p className="mt-2 text-red-200">{error}</p> : null}
          </div>
        </article>
      </section>
    </main>
  )
}
