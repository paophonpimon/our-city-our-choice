import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { getCityImagePath, getFinalAnswerTotals } from '../domain/classroomGameLoop'
import { MAX_GAME_CYCLES } from '../domain/ourCity'
import { usePlayers, useRoom, useRounds } from '../hooks/useGameData'
import { classroomFriendlyError } from '../services'
import {
  clearClassroomStudentSession,
  clearClassroomTeacherSession,
  getClassroomStudentSession,
  getClassroomTeacherSession,
} from '../services/sessionStorage'
import { clearTeacherSnapshot } from '../services/teacherQuestionSnapshot'

const CITY_LABELS = {
  critical: 'เมืองวิกฤตจากการทุจริต',
  declining: 'เมืองกำลังเสื่อมโทรม',
  neutral: 'เมืองยังอยู่ในภาวะปกติ',
  improving: 'เมืองกำลังเจริญขึ้น',
  prosperous: 'เมืองเจริญอย่างยั่งยืน',
} as const

export const CITY_REFLECTIONS = {
  critical: 'เมืองได้รับผลกระทบรุนแรงจากการตัดสินใจที่ไม่โปร่งใส',
  declining: 'เมืองกำลังเสื่อมถอยและต้องการความร่วมมือจากทุกคน',
  neutral: 'เมืองยังดำเนินต่อไปได้ แต่ยังพัฒนาได้อีกมาก',
  improving: 'เมืองกำลังพัฒนาเพราะประชาชนร่วมกันตัดสินใจอย่างรับผิดชอบ',
  prosperous: 'เมืองเจริญรุ่งเรืองจากความซื่อสัตย์และความร่วมมือของทุกคน',
} as const

export const ResultPage = () => {
  const roomId = (useParams().roomCode ?? '').toUpperCase()
  const navigate = useNavigate()
  const { service, uid } = useGame()
  const roomState = useRoom(roomId)
  const roundsState = useRounds(roomId)
  const playersState = usePlayers(roomId)
  const teacherSession = getClassroomTeacherSession()
  const studentSession = getClassroomStudentSession()
  const isTeacher = teacherSession?.roomId === roomId
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const status = roomState.data?.status
    if (status === 'role-draw') navigate(`/role-draw/${roomId}`, { replace: true })
    if (status === 'playing' || status === 'round-result') navigate(isTeacher ? '/teacher' : `/game/${roomId}`, { replace: true })
    if (status === 'lobby') navigate(isTeacher ? '/teacher' : `/lobby/${roomId}`, { replace: true })
  }, [isTeacher, navigate, roomId, roomState.data?.status])

  if (!roomId) return <Navigate replace to="/" />
  if (roomState.loading || roundsState.loading || playersState.loading) {
    return <main className="our-city-page grid min-h-dvh place-items-center text-xl">กำลังสรุปผลเมือง...</main>
  }
  if (!roomState.data) return <Navigate replace to="/" />

  const room = roomState.data
  const latestTotals = getFinalAnswerTotals(roundsState.data, room.gameCycle)
  const roleProgress = playersState.data.length === 0 ? room.completedGameCount : Math.min(...playersState.data.map((player) => player.roleHistory.length))
  const canContinue = room.status === 'game-result' && room.gameCycle < MAX_GAME_CYCLES - 1

  const continueCity = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await service.continueCityProgress(roomId, uid)
    } catch (reason) {
      setError(classroomFriendlyError(reason))
    } finally {
      setBusy(false)
    }
  }

  const endActivity = async (createNew = false): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      if (room.status === 'game-result') await service.endActivity(roomId, uid)
      if (createNew) {
        clearTeacherSnapshot(roomId)
        clearClassroomTeacherSession()
        navigate('/teacher')
      }
    } catch (reason) {
      setError(classroomFriendlyError(reason))
    } finally {
      setBusy(false)
    }
  }

  const goHome = (): void => {
    if (isTeacher) {
      clearTeacherSnapshot(roomId)
      clearClassroomTeacherSession()
    }
    if (studentSession?.roomId === roomId) clearClassroomStudentSession()
    navigate('/')
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#051017] text-white">
      <img className="absolute inset-0 h-full w-full object-cover" src={getCityImagePath(room.cityLevel)} alt={CITY_LABELS[room.cityLevel]} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,10,15,.25),rgba(2,10,15,.92))]" />
      <section className="relative z-10 flex min-h-dvh items-end justify-center px-5 py-8 md:py-12">
        <div className="final-city-panel our-city-panel w-full max-w-6xl p-7 text-center md:p-10">
          <p className="text-sm font-bold tracking-[.2em] text-[#f4c96d] uppercase">ผลการพัฒนาเมือง • ชุดที่ {room.gameCycle + 1}</p>
          <h1 className="mt-3 text-3xl font-black md:text-5xl">{CITY_LABELS[room.cityLevel]}</h1>
          <p className="mx-auto mt-3 max-w-3xl text-lg text-[#d2dfdd]">{CITY_REFLECTIONS[room.cityLevel]}</p>
          <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl bg-white/7 p-5"><span className="text-sm text-[#b7c9c7]">คะแนนเมืองปัจจุบัน</span><strong className="mt-2 block text-3xl">{Math.round(room.cityScore)} / 1,000</strong></div>
            <div className="rounded-2xl bg-white/7 p-5"><span className="text-sm text-[#b7c9c7]">สุจริตชุดล่าสุด</span><strong className="mt-2 block text-3xl text-emerald-200">{latestTotals.integrityCount}</strong></div>
            <div className="rounded-2xl bg-white/7 p-5"><span className="text-sm text-[#b7c9c7]">ทุจริตชุดล่าสุด</span><strong className="mt-2 block text-3xl text-red-200">{latestTotals.corruptionCount}</strong></div>
            <div className="rounded-2xl bg-white/7 p-5"><span className="text-sm text-[#b7c9c7]">ไม่ตอบชุดล่าสุด</span><strong className="mt-2 block text-3xl text-[#d7d3c8]">{latestTotals.timeoutCount}</strong></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl bg-black/25 p-4">สุจริตสะสม <strong className="block text-2xl">{room.integrityTotal}</strong></div>
            <div className="rounded-xl bg-black/25 p-4">ทุจริตสะสม <strong className="block text-2xl">{room.corruptionTotal}</strong></div>
            <div className="rounded-xl bg-black/25 p-4">ไม่ตอบสะสม <strong className="block text-2xl">{room.timeoutTotal}</strong></div>
            <div className="rounded-xl bg-black/25 p-4">อาชีพที่ผ่านแล้ว <strong className="block text-2xl">{roleProgress} / 8</strong></div>
          </div>
          <p className="mt-5 font-bold text-[#f4c96d]">ระดับเมือง: {room.cityLevel}</p>
          {roleProgress >= MAX_GAME_CYCLES ? <p className="mt-4 text-lg font-black">นักเรียนได้ทดลองครบทั้ง 8 อาชีพแล้ว</p> : null}
          {isTeacher ? (
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {canContinue ? <button className="rounded-2xl bg-[#f0c866] px-6 py-4 text-lg font-black text-[#102228] disabled:opacity-50" disabled={busy} onClick={() => void continueCity()}>เล่นต่อเพื่อพัฒนาเมือง</button> : null}
              <button className="rounded-2xl border border-white/25 bg-white/8 px-6 py-4 text-lg font-black disabled:opacity-50" disabled={busy} onClick={() => void endActivity(false)}>จบกิจกรรม</button>
              {!canContinue ? <button className="rounded-2xl bg-[#f0c866] px-6 py-4 text-lg font-black text-[#102228] disabled:opacity-50" disabled={busy} onClick={() => void endActivity(true)}>สร้างห้องใหม่</button> : null}
            </div>
          ) : (
            <p className="mt-8 font-bold">{room.status === 'game-result' ? 'รอครูเลือกว่าจะเล่นต่อหรือจบกิจกรรม' : 'กิจกรรมสิ้นสุดแล้ว'}</p>
          )}
          {room.status === 'finished' ? <button className="mt-5 rounded-xl border border-white/20 px-5 py-3 font-bold" onClick={goHome}>กลับหน้าหลัก</button> : null}
          {error || roomState.error || roundsState.error || playersState.error ? <p className="mt-4 text-red-200">{error || roomState.error || roundsState.error || playersState.error}</p> : null}
        </div>
      </section>
    </main>
  )
}
