import { useEffect, useRef, useState } from 'react'
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
  roundImpact?: number | null
  controls?: React.ReactNode
  children?: React.ReactNode
}

const signed = (value: number): string => `${value > 0 ? '+' : ''}${Math.round(value)}`

export const CityStage = ({ room, remainingSeconds, answerCount, roundImpact, controls, children }: CityStageProps) => {
  const previousScore = useRef(room.cityScore)
  const [displayScore, setDisplayScore] = useState(room.cityScore)

  useEffect(() => {
    const from = previousScore.current
    const to = room.cityScore
    previousScore.current = to
    if (from === to) {
      setDisplayScore(to)
      return
    }

    const startedAt = performance.now()
    let frame = 0
    const animate = (now: number): void => {
      const progress = Math.min(1, (now - startedAt) / 700)
      setDisplayScore(from + (to - from) * (1 - (1 - progress) ** 3))
      if (progress < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [room.cityScore])

  return (
    <main className="city-stage" aria-label="ภาพรวมเมืองสำหรับจอครู">
      <img
        className="city-stage__image"
        key={room.cityLevel}
        src={getCityImagePath(room.cityLevel)}
        alt={CITY_LEVEL_LABELS[room.cityLevel]}
      />
      <div className="city-stage__shade" aria-hidden="true" />
      <header className="city-stage__topbar">
        <div className="city-stage__identity">
          <p className="city-stage__eyebrow">เมืองนี้อยู่ที่เรา</p>
          <h1>คำถามข้อที่ {room.currentQuestionNumber}/10</h1>
        </div>
        <div className="city-stage__metrics">
          <div><span>เวลา</span><strong>{room.status === 'question' ? remainingSeconds : 0} วิ</strong></div>
          <div><span>ตอบแล้ว</span><strong>{answerCount} / {room.lockedPlayerCount}</strong></div>
          <div className="city-stage__score"><span>คะแนนเมือง</span><strong>{Math.round(displayScore).toLocaleString('th-TH')} / 1,000</strong></div>
          <div><span>ระดับเมือง</span><strong>{CITY_LEVEL_LABELS[room.cityLevel]}</strong></div>
        </div>
      </header>
      {room.status === 'question-closed' && roundImpact !== null && roundImpact !== undefined ? (
        <div className={`city-stage__round-impact ${roundImpact >= 0 ? 'is-positive' : 'is-negative'}`} aria-live="polite">
          ผลกระทบรอบนี้ <strong>{signed(roundImpact)}</strong>
        </div>
      ) : null}
      <section className="city-stage__results" aria-live="polite">{children}</section>
      {controls ? <footer className="city-stage__controls">{controls}</footer> : null}
    </main>
  )
}
