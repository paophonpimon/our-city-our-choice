import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { normalizeJoinRoomId } from '../components/classroomUi'
import { classroomFriendlyError } from '../services'
import { saveClassroomStudentSession } from '../services/sessionStorage'

export const JoinPage = () => {
  const { service, uid } = useGame()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const roomFromUrl = normalizeJoinRoomId(searchParams.get('room'))
  const [roomId, setRoomId] = useState(roomFromUrl)
  const [nickname, setNickname] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const normalizedRoomId = roomId.trim().toUpperCase()
      const player = await service.joinRoom({ roomId: normalizedRoomId, nickname }, uid)
      saveClassroomStudentSession({
        roomId: normalizedRoomId,
        playerId: player.playerId,
        nickname: player.nickname,
        role: 'student',
        sessionVersion: 1,
      })
      navigate(`/lobby/${normalizedRoomId}`)
    } catch (reason) {
      setError(classroomFriendlyError(reason))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="our-city-page grid min-h-dvh place-items-center px-5 py-10">
      <section className="our-city-panel w-full max-w-lg p-7 md:p-9">
        <Link className="text-sm font-bold text-[#9ec7c9]" to="/">← กลับหน้าหลัก</Link>
        <p className="mt-7 text-sm font-bold tracking-[.18em] text-[#f4c96d] uppercase">Our City, Our Choice</p>
        <h1 className="mt-2 text-3xl font-black">นักเรียนเข้าร่วมเกม</h1>
        <p className="mt-3 text-[#c6d5d3]">ใช้ชื่อที่เพื่อนจำได้ และไม่ซ้ำกับคนอื่นในห้อง</p>
        <form className="mt-7 space-y-5" aria-busy={saving} onSubmit={(event) => void submit(event)}>
          {roomFromUrl ? (
            <div className="join-room-summary">
              <span>รหัสห้องจาก QR</span>
              <strong>{roomId}</strong>
            </div>
          ) : (
            <label className="block">
              <span className="mb-2 block font-bold">รหัสห้อง</span>
              <input
                autoCapitalize="characters"
                className="w-full rounded-2xl border border-white/15 bg-white/8 px-4 py-4 text-xl font-black tracking-[.16em] uppercase outline-none focus:border-[#f4c96d]"
                inputMode="text"
                maxLength={6}
                onChange={(event) => setRoomId(event.target.value.toUpperCase())}
                required
                value={roomId}
              />
            </label>
          )}
          <label className="block">
            <span className="mb-2 block font-bold">ชื่อของคุณ</span>
            <input
              className="w-full rounded-2xl border border-white/15 bg-white/8 px-4 py-4 text-lg outline-none focus:border-[#f4c96d]"
              maxLength={30}
              autoComplete="nickname"
              autoFocus={Boolean(roomFromUrl)}
              onChange={(event) => setNickname(event.target.value)}
              required
              value={nickname}
            />
          </label>
          {error ? <p className="rounded-xl bg-red-400/12 px-4 py-3 text-red-200" role="alert">{error}</p> : null}
          <button className="min-h-14 w-full rounded-2xl bg-[#f0c866] px-5 py-4 text-lg font-black text-[#102228] disabled:opacity-50" disabled={saving}>
            {saving ? 'กำลังเข้าร่วม…' : 'เข้าร่วมเกม'}
          </button>
        </form>
      </section>
    </main>
  )
}
