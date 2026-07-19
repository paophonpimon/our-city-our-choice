import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { LOCATION_BY_ROLE } from '../domain/cityScoring'
import { ROLES, type RoleId } from '../domain/ourCity'
import { usePlayer, usePlayers, useRoom } from '../hooks/useGameData'
import { classroomFriendlyError } from '../services'
import { getClassroomStudentSession, getClassroomTeacherSession } from '../services/sessionStorage'

const LOCATION_LABELS: Record<(typeof LOCATION_BY_ROLE)[RoleId], string> = {
  hospital: 'โรงพยาบาล',
  'municipal-office': 'สำนักเทศบาล',
  'police-station': 'สถานีตำรวจ',
  school: 'โรงเรียน',
  market: 'ตลาด',
  construction: 'พื้นที่ก่อสร้าง',
  'news-office': 'สำนักข่าว',
}

export const RoleDrawPage = () => {
  const roomId = (useParams().roomCode ?? '').toUpperCase()
  const { service, uid } = useGame()
  const navigate = useNavigate()
  const teacherSession = getClassroomTeacherSession()
  const studentSession = getClassroomStudentSession()
  const isTeacher = teacherSession?.roomId === roomId
  const roomState = useRoom(roomId)
  const playersState = usePlayers(roomId)
  const playerState = usePlayer(roomId, studentSession?.roomId === roomId ? studentSession.playerId : '')
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setRevealed(false)
    const timer = window.setTimeout(() => setRevealed(true), 2500)
    return () => window.clearTimeout(timer)
  }, [roomState.data?.gameCycle])

  useEffect(() => {
    if (roomState.data?.status === 'playing' || roomState.data?.status === 'round-result') {
      navigate(isTeacher ? '/teacher' : `/game/${roomId}`, { replace: true })
    } else if (roomState.data?.status === 'game-result' || roomState.data?.status === 'finished') {
      navigate(`/result/${roomId}`, { replace: true })
    }
  }, [isTeacher, navigate, roomId, roomState.data?.status])

  const roleCounts = useMemo(() => Object.fromEntries(ROLES.map((role) => [
    role.id,
    playersState.data.filter((player) => player.roleId === role.id).length,
  ])) as Record<RoleId, number>, [playersState.data])

  if (!roomId) return <Navigate replace to="/" />
  if (!isTeacher && studentSession?.roomId !== roomId) return <Navigate replace to={`/join?room=${roomId}`} />
  if (roomState.loading || playersState.loading || (!isTeacher && playerState.loading)) {
    return <main className="our-city-page grid min-h-dvh place-items-center text-xl">กำลังสุ่มอาชีพ...</main>
  }
  if (!roomState.data || roomState.data.status === 'lobby') return <Navigate replace={isTeacher} to={isTeacher ? '/teacher' : `/lobby/${roomId}`} />

  const room = roomState.data
  const playerRole = ROLES.find((role) => role.id === playerState.data?.roleId)
  const begin = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await service.beginQuestions(roomId, uid)
    } catch (reason) {
      setError(classroomFriendlyError(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="our-city-page grid min-h-dvh place-items-center px-5 py-8 text-center">
      <section className="our-city-panel w-full max-w-4xl p-7 md:p-10">
        <p className="text-sm font-bold tracking-[.18em] text-[#f4c96d] uppercase">ชุดที่ {room.gameCycle + 1}</p>
        <h1 className="mt-3 text-3xl font-black md:text-5xl">
          {isTeacher ? `กำลังสุ่มอาชีพ รอบที่ ${room.gameCycle + 1}` : 'กำลังสุ่มอาชีพของคุณ'}
        </h1>
        <div className={`mt-8 grid grid-cols-2 gap-3 md:grid-cols-4 ${revealed ? '' : 'animate-pulse'}`}>
          {ROLES.map((role) => (
            <div className={`rounded-2xl border p-4 ${revealed && !isTeacher && role.id === playerState.data?.roleId ? 'border-[#f4c96d] bg-[#f4c96d]/15' : 'border-white/15 bg-white/6'}`} key={role.id}>
              <span className="font-black">{role.label}</span>
              {isTeacher ? <strong className="mt-2 block text-2xl text-[#8fc4c5]">{roleCounts[role.id]} คน</strong> : null}
            </div>
          ))}
        </div>
        {!isTeacher && revealed && playerRole ? (
          <div className="mt-8 rounded-2xl bg-white/8 p-6">
            <p className="text-lg">รอบนี้คุณคือ</p>
            <strong className="mt-2 block text-4xl text-[#f4c96d]">{playerRole.label}</strong>
            <p className="mt-3 text-[#c9d7d5]">สถานที่ประจำอาชีพ: {LOCATION_LABELS[LOCATION_BY_ROLE[playerRole.id]]}</p>
            <p className="mt-5 font-bold">รอครูเริ่มคำถาม</p>
          </div>
        ) : null}
        {isTeacher ? (
          <button className="mt-8 w-full rounded-2xl bg-[#f0c866] px-6 py-4 text-lg font-black text-[#102228] disabled:opacity-45" disabled={!revealed || busy || playersState.data.some((player) => !player.roleId)} onClick={() => void begin()}>
            {room.gameCycle === 0 ? 'เริ่มคำถาม' : `เริ่มคำถามชุดที่ ${room.gameCycle + 1}`}
          </button>
        ) : null}
        {error || roomState.error || playersState.error || playerState.error ? <p className="mt-4 text-red-200">{error || roomState.error || playersState.error || playerState.error}</p> : null}
      </section>
    </main>
  )
}
