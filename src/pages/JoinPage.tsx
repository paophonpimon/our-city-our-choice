import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { normalizeJoinRoomId } from '../components/classroomUi'
import { classroomFriendlyError } from '../services'
import { saveClassroomStudentSession, saveClassroomViewerRole } from '../services/sessionStorage'
import type { ClassSection } from '../types/classroomGame'

const JOIN_STEPS = [
  ['1', 'กรอกข้อมูลของคุณ', 'ใช้ชื่อ ชั้น และเลขที่จริงเพื่อให้ครูตรวจสอบได้ง่าย'],
  ['2', 'รอรับอาชีพ', 'เมื่อครูเริ่มเกม ระบบจะสุ่มหนึ่งในแปดอาชีพให้'],
  ['3', 'ช่วยกันสร้างเมือง', 'ตอบคำถามตามบทบาท ทุกการเลือกส่งผลต่อเมือง'],
] as const

export const JoinPage = () => {
  const { service, refreshSession } = useGame()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const roomFromUrl = normalizeJoinRoomId(searchParams.get('room'))
  const [roomId, setRoomId] = useState(roomFromUrl)
  const [nickname, setNickname] = useState('')
  const [classSection, setClassSection] = useState<ClassSection>('')
  const [studentNumber, setStudentNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const normalizedRoomId = roomId.trim().toUpperCase()
      const normalizedClassSection = classSection.trim()
      const currentUid = await refreshSession()
      const player = await service.joinRoom({ roomId: normalizedRoomId, nickname, classSection: normalizedClassSection, studentNumber: Number(studentNumber) }, currentUid)
      saveClassroomStudentSession({ roomId: normalizedRoomId, playerId: player.playerId, nickname: player.nickname, classSection: player.classSection ?? normalizedClassSection, studentNumber: player.studentNumber ?? Number(studentNumber), role: 'student', sessionVersion: 1 })
      saveClassroomViewerRole('student')
      navigate(`/assessment/pre/${normalizedRoomId}`)
    } catch (reason) {
      setError(classroomFriendlyError(reason))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="game-join-page">
      <header className="game-public-header">
        <Link className="game-brand" to="/" aria-label="Our City, Our Choice หน้าหลัก"><span className="game-brand__mark" aria-hidden="true">🏙️</span><strong>OUR CITY<br /><b>OUR CHOICE</b><small>เมืองนี้...อยู่ที่เรา</small></strong></Link>
        <Link className="game-home-link" to="/"><span aria-hidden="true">⌂</span> หน้าหลัก</Link>
      </header>
      <section className="game-join-shell">
        <aside className="game-join-intro">
          <p className="game-kicker">เตรียมพร้อมเข้าสู่เมือง</p>
          <h1>เข้าร่วมเกม<br /><em>แล้วสร้างเมืองไปด้วยกัน</em></h1>
          <p>ใช้เวลาไม่ถึงหนึ่งนาที จากนั้นรอรับอาชีพและร่วมตัดสินใจพร้อมกับเพื่อนทั้งห้อง</p>
          <div className="game-join-steps">{JOIN_STEPS.map(([number, title, detail]) => <article key={number}><span>{number}</span><div><strong>{title}</strong><p>{detail}</p></div></article>)}</div>
          <div className="game-join-city" aria-hidden="true"><img src="/images/new-city/backgrounds/city-overview-normal.webp" alt="" /></div>
        </aside>
        <section className="game-join-card">
          <div className="game-join-card__heading"><span aria-hidden="true">👤</span><div><small>ข้อมูลนักเรียน</small><h2>เข้าร่วมห้องเรียน</h2><p>กรอกข้อมูลให้ครบถ้วนก่อนเข้าสู่เมือง</p></div></div>
          <form aria-busy={saving} onSubmit={(event) => void submit(event)}>
            {roomFromUrl ? <div className="game-join-room"><span>รหัสห้องจาก QR</span><strong>{roomId}</strong><i>✓ พบห้องแล้ว</i></div> : <label><span>รหัสห้อง</span><input autoCapitalize="characters" inputMode="text" maxLength={4} onChange={(event) => setRoomId(event.target.value.toUpperCase())} placeholder="เช่น A23B" required value={roomId} /></label>}
            <label><span>ชื่อ–สกุล</span><input autoComplete="name" autoFocus={Boolean(roomFromUrl)} maxLength={30} onChange={(event) => setNickname(event.target.value)} placeholder="กรอกชื่อและนามสกุล" required value={nickname} /></label>
            <div className="game-join-fields">
              <label><span>ชั้น</span><input autoComplete="off" maxLength={20} onChange={(event) => setClassSection(event.target.value)} placeholder="เช่น ม.1/1" required value={classSection} /></label>
              <label><span>เลขที่</span><input inputMode="numeric" min={1} onChange={(event) => setStudentNumber(event.target.value)} placeholder="เลขที่" required step={1} type="number" value={studentNumber} /></label>
            </div>
            {error ? <p className="game-form-error" role="alert"><span aria-hidden="true">!</span>{error}</p> : null}
            <button className="game-join-submit" disabled={saving}><span aria-hidden="true">▶</span>{saving ? 'กำลังเข้าร่วม…' : 'เข้าสู่ห้องเรียน'}</button>
            <p className="game-join-note">🔒 ใช้ข้อมูลเพื่อแสดงรายชื่อในกิจกรรมห้องนี้เท่านั้น</p>
          </form>
        </section>
      </section>
    </main>
  )
}
