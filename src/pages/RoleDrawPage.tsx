import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { CityLoader } from '../components/CityLoader'
import { TeacherEmergencyEndControl } from '../components/TeacherEmergencyEndControl'
import { LOCATION_BY_ROLE } from '../domain/cityScoring'
import { ROLE_CIVIC_GUIDANCE, ROLES, type RoleId } from '../domain/ourCity'
import { ROLE_CARD_ASSETS, ROLE_CARD_BACK_ASSET } from '../domain/roleCards'
import { usePlayer, usePlayers, useRoom } from '../hooks/useGameData'
import { useSoundEffectOnce } from '../hooks/useSoundPack'
import { selectRoleDrawAccent } from '../lib/soundPack'
import { classroomFriendlyError } from '../services'
import { getClassroomStudentSession, getClassroomTeacherSession, getClassroomViewerRole } from '../services/sessionStorage'
// DIAGNOSTIC FLIGHT RECORDER — opt-in via ?debug=2, see src/debug/flightRecorder.ts
import { withActionTiming } from '../debug/flightRecorder'

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
  const viewerRole = getClassroomViewerRole()
  const hasStudentSession = studentSession?.roomId === roomId
  const isTeacher = teacherSession?.roomId === roomId && (viewerRole === 'teacher' || (viewerRole === null && !hasStudentSession))
  const roomState = useRoom(roomId)
  const playersState = usePlayers(roomId)
  const playerState = usePlayer(roomId, studentSession?.roomId === roomId ? studentSession.playerId : '')
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sceneAccent = selectRoleDrawAccent(roomState.data?.gameCycle, revealed)
  const sceneAccentTrigger = sceneAccent && roomState.data
    ? `${roomId}:${roomState.data.gameCycle}:role-draw`
    : null
  useSoundEffectOnce(sceneAccent, sceneAccentTrigger)

  useEffect(() => {
    setRevealed(false)
    const timer = window.setTimeout(() => setRevealed(true), 2500)
    return () => window.clearTimeout(timer)
  }, [roomState.data?.gameCycle])

  useEffect(() => {
    if (['playing', 'round-result', 'crisis-intro', 'crisis-playing', 'crisis-result'].includes(roomState.data?.status ?? '')) {
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
    return <CityLoader variant="full" message="กำลังสุ่มอาชีพ..." />
  }
  if (!roomState.data || roomState.data.status === 'lobby') return <Navigate replace={isTeacher} to={isTeacher ? '/teacher' : `/lobby/${roomId}`} />

  const room = roomState.data
  const playerRole = ROLES.find((role) => role.id === playerState.data?.roleId)
  const begin = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await withActionTiming('beginQuestions', roomId, () => service.beginQuestions(roomId, uid))
    } catch (reason) {
      setError(classroomFriendlyError(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="our-city-page role-draw-page grid min-h-dvh place-items-center px-5 py-8 text-center">
      <header className="game-public-header role-draw-header">
        <Link className="game-brand" to="/" aria-label="Our City, Our Choice หน้าหลัก"><span className="game-brand__mark" aria-hidden="true">🏙️</span><strong>OUR CITY<br /><b>OUR CHOICE</b><small>เมืองนี้...อยู่ที่เรา</small></strong></Link>
        <div className="role-draw-header__utilities">
          {isTeacher ? <TeacherEmergencyEndControl className="teacher-emergency-end--role-draw" disabled={busy} roomId={roomId} /> : null}
          <div className="role-draw-room"><span>ห้องเรียน</span><strong>{roomId}</strong></div>
        </div>
      </header>
      <section className={`our-city-panel role-draw-panel w-full max-w-6xl p-7 md:p-10 ${!isTeacher && revealed && playerRole ? 'is-player-revealed' : ''}`}>
        <p className="role-draw-kicker">รอบที่ {room.gameCycle + 1}</p>
        <h1 className="mt-3 text-3xl font-black md:text-5xl">
          {isTeacher
            ? `กำลังสุ่มอาชีพ รอบที่ ${room.gameCycle + 1}`
            : revealed && playerRole
              ? `อาชีพของคุณคือ ${playerRole.label}`
              : 'กำลังสุ่มอาชีพของคุณ'}
        </h1>
        {isTeacher || !revealed ? (
          <div className={`role-draw-grid ${revealed ? 'is-revealed' : 'is-shuffling'}`}>
            {ROLES.map((role) => (
              <div
                className={`role-draw-card ${revealed && !isTeacher && role.id === playerState.data?.roleId ? 'is-selected' : ''}`}
                key={role.id}
              >
                <div className="role-draw-card__flip">
                  <img className="role-draw-card__face role-draw-card__back" src={ROLE_CARD_BACK_ASSET} alt="หลังการ์ดอาชีพ" />
                  <img className="role-draw-card__face role-draw-card__front" src={ROLE_CARD_ASSETS[role.id]} alt={`การ์ดอาชีพ${role.label}`} />
                </div>
                {isTeacher && revealed ? <strong className="role-draw-card__count">{roleCounts[role.id]} คน</strong> : null}
              </div>
            ))}
          </div>
        ) : null}
        {!isTeacher && revealed && playerRole ? (
          <div className="role-draw-player-result">
            <img src={ROLE_CARD_ASSETS[playerRole.id]} alt={`การ์ดอาชีพ${playerRole.label}`} />
            <div>
              <p>อาชีพของคุณคือ</p>
              <strong>{playerRole.label}</strong>
              <p>สถานที่ประจำอาชีพ: {LOCATION_LABELS[LOCATION_BY_ROLE[playerRole.id]]}</p>
              <div className="role-draw-player-result__guidance">
                <p className="role-draw-player-result__guidance-title"><span aria-hidden="true">🏙️</span> บทบาทของคุณต่อเมือง</p>
                <strong>{ROLE_CIVIC_GUIDANCE[playerRole.id].influence}</strong>
                <p>{ROLE_CIVIC_GUIDANCE[playerRole.id].responsibility}</p>
              </div>
              <p className="role-draw-player-result__waiting">รอครูเริ่มคำถาม</p>
            </div>
          </div>
        ) : null}
        {isTeacher ? (
          <button className="role-draw-start" disabled={!revealed || busy || playersState.data.some((player) => !player.roleId)} onClick={() => void begin()}>
            {room.gameCycle === 0 ? 'เริ่มคำถาม' : `เริ่มคำถามรอบที่ ${room.gameCycle + 1}`}
          </button>
        ) : null}
        {error || roomState.error || playersState.error || playerState.error ? <p className="mt-4 text-red-200">{error || roomState.error || playersState.error || playerState.error}</p> : null}
      </section>
    </main>
  )
}
