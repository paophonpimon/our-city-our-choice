import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { CityLoader } from '../components/CityLoader'
import {
  ASSESSMENT_ITEM_COUNT,
  ASSESSMENT_ITEMS,
  ASSESSMENT_SCALE,
  isValidReflection,
  REFLECTION_ANSWER_MAX_LENGTH,
  REFLECTION_PROMPTS,
  type AssessmentScaleValue,
  type ReflectionInput,
} from '../domain/assessment'
import { resolveAssessmentFlowStep, resolvePostAssessmentGuardRoute } from '../domain/classroomGameLoop'
import { usePostAssessment, useReflection, useRoom } from '../hooks/useGameData'
import { classroomFriendlyError } from '../services'
import { clearClassroomStudentSession, getClassroomStudentSession, saveClassroomViewerRole } from '../services/sessionStorage'

/**
 * Same upper bound and rationale as PreAssessmentPage's watchdog: a normal
 * write normally resolves in well under a second; this only guards a write
 * promise that genuinely remains unresolved. A resolved Firestore write is
 * already the active submission's server acknowledgement.
 */
const SUBMIT_CONFIRMATION_TIMEOUT_MS = 15_000

const emptyReflection: ReflectionInput = { r1: '', r2: '', r3: '' }

export const PostAssessmentPage = () => {
  const roomId = (useParams().roomCode ?? '').toUpperCase()
  const navigate = useNavigate()
  const session = getClassroomStudentSession()
  const { service, uid } = useGame()
  const roomState = useRoom(roomId)
  const postAssessmentState = usePostAssessment(roomId, session?.roomId === roomId ? session.playerId : '')
  const reflectionState = useReflection(roomId, session?.roomId === roomId ? session.playerId : '')
  const [postResponses, setPostResponses] = useState<Partial<Record<number, AssessmentScaleValue>>>({})
  const [reflectionInput, setReflectionInput] = useState<ReflectionInput>(emptyReflection)
  const [submitting, setSubmitting] = useState(false)
  const [postWriteAcknowledged, setPostWriteAcknowledged] = useState(false)
  const [reflectionWriteAcknowledged, setReflectionWriteAcknowledged] = useState(false)
  const [error, setError] = useState('')

  const step = resolveAssessmentFlowStep(
    Boolean(postAssessmentState.data),
    Boolean(reflectionState.data),
    postWriteAcknowledged,
    reflectionWriteAcknowledged,
  )

  useEffect(() => {
    saveClassroomViewerRole('student')
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [step])

  useEffect(() => {
    if (!submitting) return
    const timeoutId = window.setTimeout(() => {
      setSubmitting(false)
      setError('ยืนยันการส่งคำตอบไม่สำเร็จภายในเวลาที่กำหนด กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองส่งอีกครั้ง (หากเคยส่งไปแล้ว ระบบจะไม่บันทึกซ้ำ)')
    }, SUBMIT_CONFIRMATION_TIMEOUT_MS)
    return () => window.clearTimeout(timeoutId)
  }, [submitting])

  if (!session || session.roomId !== roomId) return <Navigate replace to={`/join?room=${roomId}`} />
  if (roomState.loading || postAssessmentState.loading || reflectionState.loading) {
    return <CityLoader variant="full" message="กำลังตรวจสอบแบบประเมิน..." />
  }
  // Never route a student into POST/Reflection before the activity is
  // actually complete - a direct URL visit, a stale link, or refreshing
  // mid-game bounces to wherever the room currently is, same pattern as
  // resolveLobbyGuardRoute. Left alone mid-submit for the same reason as
  // PreAssessmentPage: never interrupt an in-flight write. In practice this
  // can't fire once the room reaches 'finished' - that status is terminal.
  if (!submitting) {
    const guardRoute = resolvePostAssessmentGuardRoute(roomState.data?.status, roomId)
    if (guardRoute) return <Navigate replace to={guardRoute} />
  }

  const answeredPostCount = Object.keys(postResponses).length
  const allPostAnswered = answeredPostCount === ASSESSMENT_ITEM_COUNT
  const reflectionReady = isValidReflection(reflectionInput)

  const submitPost = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (submitting || !allPostAnswered) return
    setSubmitting(true)
    setError('')
    try {
      const orderedResponses = ASSESSMENT_ITEMS.map((_, index) => postResponses[index]).filter(
        (value): value is AssessmentScaleValue => value !== undefined,
      )
      await service.submitPostAssessment(roomId, session.playerId, uid, orderedResponses)
      setError('')
      setPostWriteAcknowledged(true)
      setSubmitting(false)
    } catch (reason) {
      setError(classroomFriendlyError(reason))
      setSubmitting(false)
    }
  }

  const submitReflection = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (submitting || !reflectionReady) return
    setSubmitting(true)
    setError('')
    try {
      await service.submitReflection(roomId, session.playerId, uid, reflectionInput)
      setError('')
      setReflectionWriteAcknowledged(true)
      setSubmitting(false)
    } catch (reason) {
      setError(classroomFriendlyError(reason))
      setSubmitting(false)
    }
  }

  const finish = (): void => {
    clearClassroomStudentSession()
    navigate('/')
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

        {step === 'post' ? (
          <>
            <header className="assessment-header text-center">
              <p className="assessment-kicker">หลังกิจกรรม</p>
              <h1>แบบประเมินหลังกิจกรรม</h1>
              <p>ตอบตามความรู้สึกจริงของคุณ ไม่มีคำตอบถูกหรือผิด และไม่มีผลต่อคะแนนในเกม</p>
            </header>

            <form aria-busy={submitting} className="assessment-form" onSubmit={(event) => void submitPost(event)}>
              {ASSESSMENT_ITEMS.map((statement, index) => (
                <fieldset className="assessment-item" key={index}>
                  <legend className="assessment-item__prompt">
                    <span>{index + 1}</span>
                    {statement}
                  </legend>
                  <div className="assessment-choices" role="group" aria-label={`ตัวเลือกสำหรับข้อที่ ${index + 1}`}>
                    {ASSESSMENT_SCALE.map((option) => {
                      const inputId = `post-item-${index}-value-${option.value}`
                      const selected = postResponses[index] === option.value
                      return (
                        <label
                          className={`assessment-choice${selected ? ' is-selected' : ''}`}
                          htmlFor={inputId}
                          key={option.value}
                        >
                          <input
                            checked={selected}
                            className="sr-only"
                            id={inputId}
                            name={`post-item-${index}`}
                            onChange={() => setPostResponses((current) => ({ ...current, [index]: option.value }))}
                            type="radio"
                            value={option.value}
                          />
                          <strong>{option.value}</strong>
                          <span>{option.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </fieldset>
              ))}

              {error ? <p className="assessment-error" role="alert">{error}</p> : null}

              <div className="assessment-submit">
                <p>ตอบแล้ว {answeredPostCount} / {ASSESSMENT_ITEM_COUNT} ข้อ</p>
                <button
                  className="assessment-primary-button"
                  disabled={!allPostAnswered || submitting}
                  type="submit"
                >
                  {submitting ? 'กำลังส่งคำตอบ…' : 'ส่งคำตอบและไปต่อ'}
                </button>
              </div>
            </form>
          </>
        ) : null}

        {step === 'reflection' ? (
          <>
            <header className="assessment-header text-center">
              <p className="assessment-kicker">ชวนคิดต่อ</p>
              <h1>สะท้อนความคิดของฉัน</h1>
              <p>ไม่มีคำตอบถูกหรือผิด เขียนตามความคิดและความรู้สึกจริงของคุณ</p>
            </header>

            <p className="assessment-reflection-hint">ตอบสั้น ๆ ตามความคิดของคุณได้ ข้อละ 1–2 ประโยคก็เพียงพอ</p>

            <form aria-busy={submitting} className="assessment-form" onSubmit={(event) => void submitReflection(event)}>
              {REFLECTION_PROMPTS.map((prompt, index) => {
                const key = (['r1', 'r2', 'r3'] as const)[index]
                const textareaId = `reflection-${key}`
                return (
                  <fieldset className="assessment-item assessment-item--reflection" key={key}>
                    <legend className="assessment-item__prompt">
                      <span>{index + 1}</span>
                      {prompt}
                    </legend>
                    <textarea
                      className="assessment-textarea"
                      id={textareaId}
                      maxLength={REFLECTION_ANSWER_MAX_LENGTH}
                      onChange={(event) => setReflectionInput((current) => ({ ...current, [key]: event.target.value }))}
                      placeholder="เขียนคำตอบของคุณที่นี่..."
                      rows={4}
                      value={reflectionInput[key]}
                    />
                    <p className="assessment-character-count">{reflectionInput[key].length} / {REFLECTION_ANSWER_MAX_LENGTH}</p>
                  </fieldset>
                )
              })}

              {error ? <p className="assessment-error" role="alert">{error}</p> : null}

              <div className="assessment-submit">
                <button
                  className="assessment-primary-button"
                  disabled={!reflectionReady || submitting}
                  type="submit"
                >
                  {submitting ? 'กำลังส่งคำตอบ…' : 'ส่งคำตอบ'}
                </button>
              </div>
            </form>
          </>
        ) : null}

        {step === 'complete' ? (
          <div className="assessment-complete">
            <span className="assessment-complete__icon" aria-hidden="true">✓</span>
            <h1>ทำแบบประเมินครบแล้ว</h1>
            <p>ขอบคุณที่ร่วมทำแบบประเมินหลังกิจกรรมและการสะท้อนความคิด คำตอบของคุณถูกบันทึกเรียบร้อยแล้ว</p>
            <button className="assessment-primary-button" onClick={finish} type="button">
              กลับหน้าหลัก
            </button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
