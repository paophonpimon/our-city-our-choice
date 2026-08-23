import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { CityLoader } from '../components/CityLoader'
import { usePlayer, usePlayers, usePreAssessment, useRoom } from '../hooks/useGameData'
import { resolveLobbyGuardRoute } from '../domain/classroomGameLoop'
import { ROLE_CIVIC_GUIDANCE, ROLES, type RoleId } from '../domain/ourCity'
import { ROLE_CARD_ASSETS } from '../domain/roleCards'
import { getClassroomStudentSession, saveClassroomViewerRole } from '../services/sessionStorage'

const ROLE_ICONS: Record<RoleId, string> = {
  doctor: '🩺',
  municipal: '🏛️',
  police: '👮',
  teacher: '🧑‍🏫',
  merchant: '🛍️',
  contractor: '👷',
  student: '🎒',
  journalist: '🎙️',
}

const HOW_TO_PLAY = [
  ['👤', 'รับ 1 อาชีพ', 'ครูเริ่มเกมแล้วระบบจะสุ่มอาชีพให้คุณ'],
  ['👥', 'ตอบพร้อมกัน', 'ทุกคนตอบคำถามด้วยหน้าที่และมุมมองที่ต่างกัน'],
  ['🏙️', 'เมืองเดียวกัน', 'คำตอบของทั้งห้องรวมกันเป็นผลต่อเมืองเดียวกัน'],
  ['⚠️', 'มีเหตุการณ์วิกฤต', 'ร่วมกันตัดสินใจเมื่อเมืองพบเหตุการณ์สำคัญ'],
] as const

type StudentGuideTab = 'how' | 'roles' | 'impact' | 'checklist'

export const LobbyPage = () => {
  const roomId = (useParams().roomCode ?? '').toUpperCase()
  const session = getClassroomStudentSession()
  const roomState = useRoom(roomId)
  const playerState = usePlayer(roomId, session?.roomId === roomId ? session.playerId : '')
  const playersState = usePlayers(roomId)
  const assessmentState = usePreAssessment(roomId, session?.roomId === roomId ? session.playerId : '')
  const [roleModal, setRoleModal] = useState<RoleId | 'all' | null>(null)
  const [activeTab, setActiveTab] = useState<StudentGuideTab>('how')

  useEffect(() => {
    saveClassroomViewerRole('student')
  }, [])

  useEffect(() => {
    if (!roleModal) return
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setRoleModal(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [roleModal])

  if (!session || session.roomId !== roomId) return <Navigate replace to={`/join?room=${roomId}`} />
  if (assessmentState.loading) return <CityLoader variant="full" message="กำลังตรวจสอบข้อมูล..." />
  const guardRoute = resolveLobbyGuardRoute(roomState.data?.status, Boolean(assessmentState.data), roomId)
  if (guardRoute) return <Navigate replace to={guardRoute} />

  const player = playerState.data
  const nickname = player?.nickname ?? session.nickname
  const classSection = player?.classSection ?? session.classSection
  const studentNumber = player?.studentNumber ?? session.studentNumber
  const joinUrl = `${window.location.origin}/join?room=${encodeURIComponent(roomId)}`

  return (
    <main className="student-wait-page">
      <header className="student-wait-header">
        <Link className="student-wait-brand" to="/" aria-label="Our City, Our Choice หน้าหลัก">
          <span aria-hidden="true">🏙️</span>
          <strong>OUR CITY<br /><b>OUR CHOICE</b><small>เมืองนี้...อยู่ที่เรา</small></strong>
        </Link>
        <Link className="student-wait-home" to="/"><span aria-hidden="true">⌂</span> หน้าหลัก</Link>
      </header>

      <section className="student-wait-intro">
        <div><h1>เตรียมพร้อมก่อนเริ่มเกม</h1><p>ระหว่างรอครูเริ่มเกม มาทำความเข้าใจกติกา บทบาท และผลต่อเมืองกันก่อน</p></div>
        <div className="student-wait-participants"><span aria-hidden="true">👥</span><p>ขณะนี้มีผู้เข้าร่วม<strong>{playersState.data.length} / 40 <small>คน</small></strong></p></div>
      </section>

      <section className="student-wait-status" aria-label="ข้อมูลการเข้าห้อง">
        <div className="student-wait-room">
          <div><small>รหัสห้องของคุณ</small><strong>{roomId}</strong><span>แชร์ให้เพื่อนเข้าร่วม</span></div>
          <div className="student-wait-qr"><QRCodeSVG bgColor="#ffffff" fgColor="#123a70" level="M" marginSize={2} size={120} value={joinUrl} /></div>
        </div>
        <div className="student-wait-identity">
          <span className="student-wait-avatar" aria-hidden="true">{nickname.trim().charAt(0).toUpperCase() || 'น'}<i>✓</i></span>
          <div><small>เข้าห้องแล้วในชื่อ</small><strong>{nickname}</strong><p>ชั้น {classSection} · เลขที่ {studentNumber}</p><b>✓ พร้อมแล้ว</b></div>
        </div>
        <div className="student-wait-live">
          <span aria-hidden="true">⌛</span><strong>รอครูเริ่มเกม...</strong><i><b /><b /><b /></i><p>เมื่อครูเริ่มเกม ระบบจะสุ่ม 1 ใน 8 อาชีพให้คุณอัตโนมัติ</p>
        </div>
      </section>

      <section className="student-wait-guide">
        {/*
          Below the "landscape tablet / desktop" breakpoint (see
          .student-wait-guide__content in styles.css), every section renders
          at once in a responsive grid and this nav becomes a same-page
          jump/highlight control rather than an exclusive tab switcher — so
          it uses toggle-button semantics (aria-pressed), not role="tab" with
          aria-selected, which would incorrectly assert only one panel is
          visible. On narrow/portrait viewports, CSS hides every section
          except .is-active, reproducing the original single-panel behavior.
        */}
        <nav aria-label="หัวข้อเตรียมตัว">
          <button aria-controls="student-guide-panel-how" aria-pressed={activeTab === 'how'} className={activeTab === 'how' ? 'is-active' : ''} id="student-guide-tab-how" onClick={() => setActiveTab('how')} type="button">▣ วิธีเล่น</button>
          <button aria-controls="student-guide-panel-roles" aria-pressed={activeTab === 'roles'} className={activeTab === 'roles' ? 'is-active' : ''} id="student-guide-tab-roles" onClick={() => setActiveTab('roles')} type="button">♙ 8 อาชีพ</button>
          <button aria-controls="student-guide-panel-impact" aria-pressed={activeTab === 'impact'} className={activeTab === 'impact' ? 'is-active' : ''} id="student-guide-tab-impact" onClick={() => setActiveTab('impact')} type="button">♨ คะแนนและผลกระทบ</button>
          <button aria-controls="student-guide-panel-checklist" aria-pressed={activeTab === 'checklist'} className={activeTab === 'checklist' ? 'is-active' : ''} id="student-guide-tab-checklist" onClick={() => setActiveTab('checklist')} type="button">☑ เช็กลิสต์ก่อนเริ่ม</button>
        </nav>
        <div className="student-wait-guide__content">
          <section aria-labelledby="student-guide-tab-how" className={`student-wait-how${activeTab === 'how' ? ' is-active' : ''}`} id="student-guide-panel-how">
            <h2 id="student-how-title">วิธีเล่นแบบสั้นๆ</h2>
            {HOW_TO_PLAY.map(([icon, title, detail]) => <article key={title}><span aria-hidden="true">{icon}</span><div><strong>{title}</strong><p>{detail}</p></div></article>)}
          </section>

          <section aria-labelledby="student-guide-tab-roles" className={`student-wait-roles${activeTab === 'roles' ? ' is-active' : ''}`} id="student-guide-panel-roles">
            <h2 id="student-roles-title">8 อาชีพที่อาจได้รับ</h2>
            <div>{ROLES.map((role) => <button aria-label={`ดูข้อมูลอาชีพ${role.label}`} className={`student-wait-role student-wait-role--${role.id}`} key={role.id} onClick={() => setRoleModal(role.id)} type="button"><img alt="" src={ROLE_CARD_ASSETS[role.id]} /><strong>{role.label}</strong></button>)}</div>
          </section>

          <section aria-labelledby="student-guide-tab-impact" className={`student-wait-impact${activeTab === 'impact' ? ' is-active' : ''}`} id="student-guide-panel-impact">
            <h2 id="student-impact-title">ทางเลือกของคุณ ส่งผลต่อเมือง</h2>
            <article className="is-good"><span>✓</span><div><strong>ทางเลือกที่รับผิดชอบ → เมืองดีขึ้น</strong><p>อาคารและคุณภาพชีวิตพัฒนา</p></div></article>
            <article className="is-bad"><span>↘</span><div><strong>ทางเลือกที่ทุจริต → เมืองเสื่อมลง</strong><p>คุณภาพชีวิตและตึกในเมืองลดลง</p></div></article>
            <article className="is-neutral"><span>?</span><div><strong>ไม่ตอบ → พลาดโอกาสช่วยเมือง</strong><p>ไม่ได้คะแนนและไม่เกิดการเปลี่ยนแปลง</p></div></article>
          </section>

          <section aria-labelledby="student-guide-tab-checklist" className={`student-wait-checklist${activeTab === 'checklist' ? ' is-active' : ''}`} id="student-guide-panel-checklist">
            <h2 id="student-check-title">เช็กลิสต์ความพร้อม</h2>
            <article><span>✓</span><div><strong>อ่านกติกาแล้ว</strong><p>เข้าใจวิธีเล่นและการตัดสินใจ</p></div></article>
            <article><span>✓</span><div><strong>พร้อมรับอาชีพ</strong><p>รับบทบาทที่เหมาะกับคุณ</p></div></article>
            <article><span>✓</span><div><strong>พร้อมช่วยสร้างเมือง</strong><p>ทำหน้าที่ให้ดีที่สุดเพื่อเมืองของเรา</p></div></article>
          </section>
        </div>
      </section>

      <footer className="student-wait-footer">
        <div><span aria-hidden="true">⌛</span><strong>รอครูเริ่มเกม<small>ยังไม่สามารถเริ่มเกมได้</small></strong></div>
        <button onClick={() => setRoleModal('all')} type="button">♙ ดูข้อมูลอาชีพทั้งหมด</button>
        <p>💡 เมื่อครูเริ่มเกม ระบบจะสุ่มอาชีพให้คุณอัตโนมัติ<br /><small>เตรียมตัวให้พร้อม แล้วมาเป็นส่วนหนึ่งของการเปลี่ยนแปลงเมืองกัน!</small></p>
      </footer>

      {roomState.error || playerState.error || playersState.error ? <p className="student-wait-error">{roomState.error || playerState.error || playersState.error}</p> : null}
      {roleModal ? (
        <div className="student-role-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) setRoleModal(null) }} role="presentation">
          <section aria-labelledby="student-role-modal-title" aria-modal="true" className="student-role-dialog" role="dialog">
            <header><div><small>8 อาชีพของเมือง</small><h2 id="student-role-modal-title">{roleModal === 'all' ? 'เลือกการ์ดเพื่อดูหน้าที่' : `อาชีพ${ROLES.find((role) => role.id === roleModal)?.label ?? ''}`}</h2></div><button aria-label="ปิดข้อมูลอาชีพ" onClick={() => setRoleModal(null)} type="button">×</button></header>
            {roleModal === 'all' ? (
              <div className="student-role-gallery">{ROLES.map((role) => <button key={role.id} onClick={() => setRoleModal(role.id)} type="button"><img alt={`การ์ดอาชีพ${role.label}`} src={ROLE_CARD_ASSETS[role.id]} /></button>)}</div>
            ) : (() => {
              const role = ROLES.find((item) => item.id === roleModal)
              if (!role) return null
              return <div className="student-role-detail"><img alt={`การ์ดอาชีพ${role.label}`} src={ROLE_CARD_ASSETS[role.id]} /><div><p><span aria-hidden="true">{ROLE_ICONS[role.id]}</span> บทบาทต่อเมือง</p><strong>{ROLE_CIVIC_GUIDANCE[role.id].influence}</strong><p>{ROLE_CIVIC_GUIDANCE[role.id].responsibility}</p><button onClick={() => setRoleModal('all')} type="button">← ดูอาชีพอื่น</button></div></div>
            })()}
          </section>
        </div>
      ) : null}
    </main>
  )
}
