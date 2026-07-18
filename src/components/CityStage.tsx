import { getCityImagePath } from '../domain/classroomGameLoop'
import type { ClassroomRoom } from '../types/classroomGame'

const CITY_LEVEL_LABELS: Record<ClassroomRoom['cityLevel'], string> = {
  critical: 'เมืองวิกฤต',
  declining: 'เมืองกำลังเสื่อมโทรม',
  neutral: 'เมืองปกติ',
  improving: 'เมืองกำลังเจริญ',
  prosperous: 'เมืองเจริญสูงสุด',
}

interface CityStageProps {
  room: ClassroomRoom
  remainingSeconds: number
  answerCount: number
  controls?: React.ReactNode
  children?: React.ReactNode
}

export const CityStage = ({ room, remainingSeconds, answerCount, controls, children }: CityStageProps) => (
  <main className="city-stage" aria-label="ภาพรวมเมืองสำหรับจอครู">
    <img className="city-stage__image" src={getCityImagePath(room.cityLevel)} alt={CITY_LEVEL_LABELS[room.cityLevel]} />
    <div className="city-stage__shade" aria-hidden="true" />
    <header className="city-stage__topbar">
      <div>
        <p className="city-stage__eyebrow">เมืองนี้อยู่ที่เรา</p>
        <h1>คำถามข้อที่ {room.currentQuestionNumber}/10</h1>
      </div>
      <div className="city-stage__metrics">
        <div><span>เวลา</span><strong>{room.status === 'question' ? remainingSeconds : 0} วิ</strong></div>
        <div><span>ตอบแล้ว</span><strong>{answerCount} / {room.lockedPlayerCount}</strong></div>
        <div><span>คะแนนเมือง</span><strong>{Math.round(room.cityScore).toLocaleString('th-TH')} / 1,000</strong></div>
        <div><span>ระดับเมือง</span><strong>{CITY_LEVEL_LABELS[room.cityLevel]}</strong></div>
      </div>
    </header>
    <section className="city-stage__results" aria-live="polite">{children}</section>
    {controls ? <footer className="city-stage__controls">{controls}</footer> : null}
  </main>
)
