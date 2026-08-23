import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { CityLoader } from '../components/CityLoader'
import { ASSESSMENT_SCALE, PRE_ASSESSMENT_ITEM_COUNT, PRE_ASSESSMENT_ITEMS, type AssessmentScaleValue } from '../domain/assessment'
import { resolveStudentRouteForStatus } from '../domain/classroomGameLoop'
import { usePreAssessment, useRoom } from '../hooks/useGameData'
import { classroomFriendlyError } from '../services'
import { getClassroomStudentSession, saveClassroomViewerRole } from '../services/sessionStorage'

/**
 * Upper bound on how long "กำลังส่งคำตอบ…" may show after a click before the
 * student sees a recoverable error instead of an indefinite spinner. A
 * normal submission confirms in well under a second; this exists purely as
 * a safety net for a genuinely unconfirmable submission (e.g. a dropped
 * connection), not as a navigation delay - it never navigates anywhere
 * itself, and a retry after it fires is always safe (submitPreAssessment is
 * idempotent, so it can never create a second record).
 */
const SUBMIT_CONFIRMATION_TIMEOUT_MS = 15_000

export const PreAssessmentPage = () => {
  const roomId = (useParams().roomCode ?? '').toUpperCase()
  const session = getClassroomStudentSession()
  const { service, uid } = useGame()
  const roomState = useRoom(roomId)
  const assessmentState = usePreAssessment(roomId, session?.roomId === roomId ? session.playerId : '')
  const [responses, setResponses] = useState<Partial<Record<number, AssessmentScaleValue>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    saveClassroomViewerRole('student')
  }, [])

  // Bounds every stall, whatever the cause: a write that never reaches the
  // server, or one that succeeds but whose confirmation never reaches this
  // page. Cleared the moment `submitting` turns false for any reason
  // (error, or this component unmounting because the redirect below fired).
  useEffect(() => {
    if (!submitting) return
    const timeoutId = window.setTimeout(() => {
      setSubmitting(false)
      setError('ยืนยันการส่งคำตอบไม่สำเร็จภายในเวลาที่กำหนด กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองส่งอีกครั้ง (หากเคยส่งไปแล้ว ระบบจะไม่บันทึกซ้ำ)')
    }, SUBMIT_CONFIRMATION_TIMEOUT_MS)
    return () => window.clearTimeout(timeoutId)
  }, [submitting])

  if (!session || session.roomId !== roomId) return <Navigate replace to={`/join?room=${roomId}`} />
  if (assessmentState.loading) return <CityLoader variant="full" message="กำลังตรวจสอบแบบสำรวจ..." />
  // Already submitted (server-confirmed - see subscribePreAssessment) — a
  // refresh, or a late teacher-side room advance that finished while this
  // student was still answering, forwards straight to wherever the room
  // actually is now, never back to this form.
  if (assessmentState.data) return <Navigate replace to={resolveStudentRouteForStatus(roomState.data?.status, roomId)} />
  // A finished room is a dead end for a student who has not submitted yet -
  // never trap them filling a now-pointless form. An in-flight submission is
  // left alone: it is status-independent and safe to let finish naturally,
  // and the branch above will route it correctly once confirmed.
  if (roomState.data?.status === 'finished' && !submitting) {
    return <Navigate replace to={resolveStudentRouteForStatus(roomState.data.status, roomId)} />
  }
  // Defense-in-depth: the teacher hasn't opened PRE yet, so a direct URL
  // visit (or a stale link) has nothing to fill in - bounce back to Lobby,
  // same as a fresh join would land. Left alone mid-submit for the same
  // reason as the finished-room guard above: never interrupt an in-flight
  // write, since the completed-assessment branch above will route correctly
  // once it confirms regardless of what this guard would otherwise say.
  if (roomState.data && !roomState.data.preAssessmentOpened && !submitting) {
    return <Navigate replace to={`/lobby/${roomId}`} />
  }

  const answeredCount = Object.keys(responses).length
  const allAnswered = answeredCount === PRE_ASSESSMENT_ITEM_COUNT

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (submitting || !allAnswered) return
    setSubmitting(true)
    setError('')
    try {
      const orderedResponses = PRE_ASSESSMENT_ITEMS.map((_, index) => responses[index]).filter(
        (value): value is AssessmentScaleValue => value !== undefined,
      )
      await service.submitPreAssessment(roomId, session.playerId, uid, orderedResponses)
      // No imperative navigate here: the live usePreAssessment subscription
      // above will pick up the server-confirmed record and the redirect
      // branch handles routing to wherever the room currently is, using
      // fresh room status rather than a value captured before this submit
      // began. `submitting` is intentionally left true - the watchdog above
      // is the only thing that can clear it from this point on, so the
      // spinner never gets silently abandoned if that redirect is delayed.
    } catch (reason) {
      setError(classroomFriendlyError(reason))
      setSubmitting(false)
    }
  }

  return (
    <main className="our-city-page assessment-page min-h-dvh px-4 py-6 md:px-8 md:py-8">
      <section className="assessment-shell mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="assessment-topbar flex items-center justify-between">
          <Link className="game-brand" to="/" aria-label="Our City, Our Choice หน้าหลัก">
            <span className="game-brand__mark" aria-hidden="true">🏙️</span>
            <strong>OUR CITY<br /><b>OUR CHOICE</b></strong>
          </Link>
          <span className="assessment-room-badge">ห้อง {roomId}</span>
        </div>

        <header className="assessment-header text-center">
          <p className="assessment-kicker">ก่อนเริ่มกิจกรรม</p>
          <h1>แบบสำรวจความคิดเห็นของฉัน</h1>
          <p>ตอบตามความรู้สึกจริงของคุณ ไม่มีคำตอบถูกหรือผิด และไม่มีผลต่อคะแนนในเกม</p>
        </header>

        <div className="assessment-scale" aria-label="คำอธิบายระดับความคิดเห็น">
          <p className="assessment-scale__title">ระดับความคิดเห็น</p>
          <ul className="assessment-scale__list">
            {ASSESSMENT_SCALE.map((option) => (
              <li className="assessment-scale__item" key={option.value}>
                <strong>{option.value}</strong>
                <span>{option.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <form aria-busy={submitting} className="assessment-form" onSubmit={(event) => void submit(event)}>
          {PRE_ASSESSMENT_ITEMS.map((statement, index) => (
            <fieldset className="assessment-item" key={index}>
              <legend className="assessment-item__prompt">
                <span>{index + 1}</span>
                {statement}
              </legend>
              <div className="assessment-choices" role="group" aria-label={`ตัวเลือกสำหรับข้อที่ ${index + 1}`}>
                {ASSESSMENT_SCALE.map((option) => {
                  const inputId = `pre-item-${index}-value-${option.value}`
                  const selected = responses[index] === option.value
                  return (
                    <label
                      className={`assessment-choice${selected ? ' is-selected' : ''}`}
                      htmlFor={inputId}
                      key={option.value}
                      title={option.label}
                    >
                      <input
                        checked={selected}
                        className="sr-only"
                        id={inputId}
                        name={`pre-item-${index}`}
                        onChange={() => setResponses((current) => ({ ...current, [index]: option.value }))}
                        type="radio"
                        value={option.value}
                      />
                      {option.value}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ))}

          {error ? <p className="assessment-error" role="alert">{error}</p> : null}

          <div className="assessment-submit">
            <p>ตอบแล้ว {answeredCount} / {PRE_ASSESSMENT_ITEM_COUNT} ข้อ</p>
            <button
              className="assessment-primary-button"
              disabled={!allAnswered || submitting}
              type="submit"
            >
              {submitting ? 'กำลังส่งคำตอบ…' : 'ส่งคำตอบและไปต่อ'}
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
