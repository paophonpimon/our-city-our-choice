import { useEffect, useState, type FormEvent } from 'react'
import {
  OBSERVATION_DIMENSIONS,
  OBSERVATION_NOTES_MAX_LENGTH,
  OBSERVATION_SCALE,
  type ObservationDimensionId,
  type ObservationScaleValue,
  type TeacherObservationInput,
} from '../domain/assessment'
import { useObservation } from '../hooks/useGameData'
import { useGame } from '../context/GameContext'
import { classroomFriendlyError } from '../services'

interface TeacherObservationSectionProps {
  roomId: string
  isTeacher: boolean
}

export const TeacherObservationSection = ({ roomId, isTeacher }: TeacherObservationSectionProps) => {
  const { service, uid } = useGame()
  const observationState = useObservation(roomId, isTeacher)
  const [scores, setScores] = useState<Partial<Record<ObservationDimensionId, ObservationScaleValue>>>({})
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const allDimensionsScored =
    scores.o1 !== undefined && scores.o2 !== undefined && scores.o3 !== undefined && scores.o4 !== undefined

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!allDimensionsScored || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const input: TeacherObservationInput = {
        o1: scores.o1 as ObservationScaleValue,
        o2: scores.o2 as ObservationScaleValue,
        o3: scores.o3 as ObservationScaleValue,
        o4: scores.o4 as ObservationScaleValue,
        notes: notes.trim(),
      }
      await service.submitObservation(roomId, uid, input)
    } catch (reason) {
      setError(classroomFriendlyError(reason))
      setSubmitting(false)
    }
  }

  // Reset submitting state when observation arrives from server
  useEffect(() => {
    if (observationState.data) {
      setSubmitting(false)
    }
  }, [observationState.data])

  if (!isTeacher) return null
  if (observationState.loading) return null

  const existingObservation = observationState.data

  return (
    <section className="teacher-observation-section" aria-labelledby="teacher-observation-title">
      <div className="teacher-section-heading">
        <div>
          <p className="teacher-lobby-kicker">เครื่องมือประเมินของครู (Phase B2a)</p>
          <h2 id="teacher-observation-title">บันทึกการสังเกตพฤติกรรมชั้นเรียน</h2>
          <p>ประเมินภาพรวมพฤติกรรมของชั้นเรียนใน 4 ด้าน เพื่อใช้เป็นหลักฐานเชิงประจักษ์</p>
        </div>
        {existingObservation ? (
          <span className="teacher-observation-badge teacher-observation-badge--complete">
            <i aria-hidden="true">✓</i> บันทึกแล้ว
          </span>
        ) : (
          <span className="teacher-observation-badge teacher-observation-badge--pending">
            ยังไม่ได้บันทึก
          </span>
        )}
      </div>

      {existingObservation ? (
        <div className="teacher-observation-summary-card">
          <div className="teacher-observation-grid">
            {OBSERVATION_DIMENSIONS.map((dimension) => {
              const score = existingObservation[dimension.id]
              const option = OBSERVATION_SCALE.find((item) => item.value === score)
              return (
                <article className="teacher-observation-summary-item" key={dimension.id}>
                  <header>
                    <strong className="teacher-observation-summary-item__code">{dimension.code}</strong>
                    <span className="teacher-observation-summary-item__title">{dimension.title}</span>
                  </header>
                  <div className="teacher-observation-summary-item__score">
                    <b className="teacher-observation-summary-item__value">{score} / 4</b>
                    <small>{option?.label ?? ''}</small>
                  </div>
                </article>
              )
            })}
          </div>
          {existingObservation.notes ? (
            <div className="teacher-observation-notes-display">
              <strong>บันทึกเพิ่มเติมของครู:</strong>
              <p>{existingObservation.notes}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <form className="teacher-observation-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="teacher-observation-scale-guide" aria-label="เกณฑ์ระดับคะแนน">
            <p className="teacher-observation-scale-guide__title">เกณฑ์ระดับพฤติกรรม (1–4)</p>
            <ul className="teacher-observation-scale-guide__list">
              {OBSERVATION_SCALE.map((item) => (
                <li key={item.value}>
                  <strong>{item.value}</strong> = {item.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="teacher-observation-dimensions-list">
            {OBSERVATION_DIMENSIONS.map((dimension) => {
              const currentScore = scores[dimension.id]
              return (
                <fieldset className="teacher-observation-dimension-field" key={dimension.id}>
                  <legend className="teacher-observation-dimension-legend">
                    <span className="teacher-observation-dimension-legend__code">{dimension.code}</span>
                    <span className="teacher-observation-dimension-legend__title">{dimension.title}</span>
                  </legend>
                  <div className="teacher-observation-rating-group" role="group" aria-label={`ระดับคะแนนสำหรับ ${dimension.title}`}>
                    {OBSERVATION_SCALE.map((option) => {
                      const inputId = `obs-${dimension.id}-val-${option.value}`
                      const selected = currentScore === option.value
                      return (
                        <label
                          className={`teacher-observation-rating-option ${selected ? 'is-selected' : ''}`}
                          htmlFor={inputId}
                          key={option.value}
                          title={`${option.value}: ${option.label}`}
                        >
                          <input
                            checked={selected}
                            className="sr-only"
                            id={inputId}
                            name={`obs-${dimension.id}`}
                            onChange={() => setScores((current) => ({ ...current, [dimension.id]: option.value }))}
                            type="radio"
                            value={option.value}
                          />
                          <span className="teacher-observation-rating-option__val">{option.value}</span>
                          <span className="teacher-observation-rating-option__label">{option.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </fieldset>
              )
            })}
          </div>

          <div className="teacher-observation-notes-field">
            <label htmlFor="teacher-observation-notes">
              <strong>บันทึกเพิ่มเติม (ไม่บังคับ)</strong>
              <small>ข้อสังเกตหรือบริบทพฤติกรรมในห้องเรียน (สูงสุด {OBSERVATION_NOTES_MAX_LENGTH} ตัวอักษร)</small>
            </label>
            <textarea
              id="teacher-observation-notes"
              maxLength={OBSERVATION_NOTES_MAX_LENGTH}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="บันทึกข้อสังเกตเพิ่มเติม เช่น พฤติกรรมการทำงานกลุ่ม การอภิปรายในห้องเรียน..."
              rows={3}
              value={notes}
            />
            <p className="teacher-observation-notes-counter">{notes.length} / {OBSERVATION_NOTES_MAX_LENGTH}</p>
          </div>

          {error ? <p className="teacher-observation-error" role="alert">{error}</p> : null}

          <div className="teacher-observation-actions">
            <button
              className="teacher-observation-submit-button"
              disabled={!allDimensionsScored || submitting}
              type="submit"
            >
              {submitting ? 'กำลังบันทึก…' : 'บันทึกผลการสังเกตพฤติกรรม'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
