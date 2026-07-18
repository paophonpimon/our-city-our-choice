import { Navigate, useParams } from 'react-router-dom'
import { usePlayer, useRoom } from '../hooks/useGameData'
import { getClassroomStudentSession } from '../services/sessionStorage'

export const LobbyPage = () => {
  const roomId = (useParams().roomCode ?? '').toUpperCase()
  const session = getClassroomStudentSession()
  const roomState = useRoom(roomId)
  const playerState = usePlayer(roomId, session?.roomId === roomId ? session.playerId : '')

  if (!session || session.roomId !== roomId) return <Navigate replace to={`/join?room=${roomId}`} />
  if (roomState.data?.status === 'question' || roomState.data?.status === 'question-closed') {
    return <Navigate replace to={`/game/${roomId}`} />
  }
  if (roomState.data?.status === 'finished') return <Navigate replace to={`/result/${roomId}`} />

  return (
    <main className="our-city-page grid min-h-dvh place-items-center px-5 py-10 text-center">
      <section className="our-city-panel w-full max-w-xl p-8">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-[#f4c96d]/40 bg-[#f4c96d]/10 text-3xl">🏙️</div>
        <p className="mt-6 text-sm font-bold tracking-[.18em] text-[#f4c96d] uppercase">ห้อง {roomId}</p>
        <h1 className="mt-2 text-3xl font-black">รอครูเริ่มเกม</h1>
        <p className="mt-3 text-lg text-[#c9d7d5]">เข้าห้องแล้วในชื่อ <strong className="text-white">{playerState.data?.nickname ?? session.nickname}</strong></p>
        <div className="mx-auto mt-8 h-10 w-10 animate-spin rounded-full border-4 border-white/15 border-t-[#f4c96d]" aria-label="กำลังรอ" />
        {roomState.error || playerState.error ? <p className="mt-5 text-red-200">{roomState.error || playerState.error}</p> : null}
      </section>
    </main>
  )
}
