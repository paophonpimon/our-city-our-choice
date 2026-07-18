import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { getCityImagePath, getFinalAnswerTotals } from '../domain/classroomGameLoop'
import { useRoom, useRounds } from '../hooks/useGameData'
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
  const roomState = useRoom(roomId)
  const roundsState = useRounds(roomId)
  const teacherSession = getClassroomTeacherSession()
  const studentSession = getClassroomStudentSession()
  const isTeacher = teacherSession?.roomId === roomId

  if (!roomId) return <Navigate replace to="/" />
  if (roomState.loading || roundsState.loading) {
    return <main className="our-city-page grid min-h-dvh place-items-center text-xl">กำลังสรุปผลเมือง…</main>
  }
  if (!roomState.data) return <Navigate replace to="/" />

  const room = roomState.data
  const totals = getFinalAnswerTotals(roundsState.data)

  const clearCurrentSession = (): void => {
    if (isTeacher) {
      clearTeacherSnapshot(roomId)
      clearClassroomTeacherSession()
    }
    if (studentSession?.roomId === roomId) clearClassroomStudentSession()
  }

  const goHome = (): void => {
    clearCurrentSession()
    navigate('/')
  }

  const startNew = (): void => {
    clearCurrentSession()
    navigate(isTeacher ? '/teacher' : '/join')
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#051017] text-white">
      <img className="absolute inset-0 h-full w-full object-cover" src={getCityImagePath(room.cityLevel)} alt={CITY_LABELS[room.cityLevel]} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,10,15,.25),rgba(2,10,15,.92))]" />
      <section className="relative z-10 flex min-h-dvh items-end justify-center px-5 py-8 md:py-12">
        <div className="final-city-panel our-city-panel w-full max-w-5xl p-7 text-center md:p-10">
          <p className="text-sm font-bold tracking-[.2em] text-[#f4c96d] uppercase">Our City, Our Choice</p>
          <h1 className="mt-3 text-3xl font-black md:text-5xl">{CITY_LABELS[room.cityLevel]}</h1>
          <p className="mx-auto mt-3 max-w-3xl text-lg text-[#d2dfdd]">{CITY_REFLECTIONS[room.cityLevel]}</p>
          <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl bg-white/7 p-5"><span className="text-sm text-[#b7c9c7]">คะแนนเมือง</span><strong className="mt-2 block text-3xl">{Math.round(room.cityScore)} / 1,000</strong></div>
            <div className="rounded-2xl bg-white/7 p-5"><span className="text-sm text-[#b7c9c7]">สุจริตรวม</span><strong className="mt-2 block text-3xl text-emerald-200">{totals.integrityCount}</strong></div>
            <div className="rounded-2xl bg-white/7 p-5"><span className="text-sm text-[#b7c9c7]">ทุจริตรวม</span><strong className="mt-2 block text-3xl text-red-200">{totals.corruptionCount}</strong></div>
            <div className="rounded-2xl bg-white/7 p-5"><span className="text-sm text-[#b7c9c7]">ไม่ตอบรวม</span><strong className="mt-2 block text-3xl text-[#d7d3c8]">{totals.timeoutCount}</strong></div>
          </div>
          <p className="mt-5 font-bold text-[#f4c96d]">ระดับเมือง: {room.cityLevel}</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <button className="rounded-2xl border border-white/25 bg-white/8 px-6 py-4 text-lg font-black" onClick={goHome}>กลับหน้าหลัก</button>
            <button className="rounded-2xl bg-[#f0c866] px-6 py-4 text-lg font-black text-[#102228]" onClick={startNew}>เริ่มเกมใหม่</button>
          </div>
        </div>
      </section>
    </main>
  )
}
