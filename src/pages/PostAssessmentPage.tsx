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
 * submission confirms in well under a second; this only guards against a
 * genuinely unconfirmable write. submitPostAssessment/submitReflection are
 * both idempotent, so a retry after this fires can never create a
 * duplicate or second record.
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
  const [error, setError] = useState('')

  useEffect(() => {
    saveClassroomViewerRole('student')
  }, [])

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

  const step = resolveAssessmentFlowStep(Boolean(postAssessmentState.data), Boolean(reflectionState.data))

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
      // No imperative navigate: the live usePostAssessment subscription
      // above picks up the server-confirmed record and re-derives `step`
      // to 'reflection'. `submitting` is intentionally left true until then
      // - only the watchdog above can clear it after this point.
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
    <main className="our-city-page min-h-dvh px-4 py-6 md:px-8 md:py-8">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <Link className="game-brand" to="/" aria-label="Our City, Our Choice หน้าหลัก">
            <span className="game-brand__mark" aria-hidden="true">🏙️</span>
            <strong>OUR CITY<br /><b>OUR CHOICE</b></strong>
          </Link>
          <span className="rounded-full border border-white/18 bg-white/7 px-3 py-1 text-xs font-bold text-[#a9c5c3]">ห้อง {roomId}</span>
        </div>

        {step === 'post' ? (
          <>
            <header className="text-center">
              <p className="text-sm font-bold text-[#f4c96d]">หลังกิจกรรม</p>
              <h1 className="text-2xl font-black md:text-3xl">แบบประเมินหลังกิจกรรม</h1>
              <p className="mt-2 text-sm text-[#a9c5c3] md:text-base">ตอบตามความรู้สึกจริงของคุณ ไม่มีคำตอบถูกหรือผิด และไม่มีผลต่อคะแนนในเกม</p>
            </header>

            <div className="our-city-panel rounded-2xl p-4 md:p-5" aria-label="คำอธิบายระดับความคิดเห็น">
              <p className="mb-3 text-sm font-bold text-[#f4c96d]">ระดับความคิดเห็น</p>
              <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-5">
                {ASSESSMENT_SCALE.map((option) => (
                  <li className="flex items-center gap-2 rounded-xl bg-white/6 px-3 py-2" key={option.value}>
                    <strong className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/12 text-sm font-black">{option.value}</strong>
                    <span>{option.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <form aria-busy={submitting} className="flex flex-col gap-4" onSubmit={(event) => void submitPost(event)}>
              {ASSESSMENT_ITEMS.map((statement, index) => (
                <fieldset className="our-city-panel rounded-2xl p-4 md:p-5" key={index}>
                  <legend className="mb-3 text-base font-bold leading-relaxed md:text-lg">
                    <span className="mr-2 inline-grid h-7 w-7 place-items-center rounded-full bg-[#f4c96d]/18 text-sm font-black text-[#f4c96d]">{index + 1}</span>
                    {statement}
                  </legend>
                  <div className="grid grid-cols-5 gap-2" role="group" aria-label={`ตัวเลือกสำหรับข้อที่ ${index + 1}`}>
                    {ASSESSMENT_SCALE.map((option) => {
                      const inputId = `post-item-${index}-value-${option.value}`
                      const selected = postResponses[index] === option.value
                      return (
                        <label
                          className={`grid min-h-14 cursor-pointer place-items-center rounded-xl border text-lg font-black transition ${selected ? 'border-[#f4c96d] bg-[#f4c96d]/16 text-[#f4c96d]' : 'border-white/18 bg-white/7 text-white hover:border-white/40'}`}
                          htmlFor={inputId}
                          key={option.value}
                          title={option.label}
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
                          {option.value}
                        </label>
                      )
                    })}
                  </div>
                </fieldset>
              ))}

              {error ? <p className="text-red-200" role="alert">{error}</p> : null}

              <div className="sticky bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-[#050b14] to-transparent pb-2 pt-6">
                <p className="text-sm text-[#a9c5c3]">ตอบแล้ว {answeredPostCount} / {ASSESSMENT_ITEM_COUNT} ข้อ</p>
                <button
                  className="w-full max-w-xs rounded-2xl bg-[#f4c96d] px-6 py-4 text-lg font-black text-[#1c1305] disabled:cursor-not-allowed disabled:opacity-40"
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
            <header className="text-center">
              <p className="text-sm font-bold text-[#f4c96d]">ชวนคิดต่อ</p>
              <h1 className="text-2xl font-black md:text-3xl">สะท้อนความคิดของฉัน</h1>
              <p className="mt-2 text-sm text-[#a9c5c3] md:text-base">ไม่มีคำตอบถูกหรือผิด เขียนตามความคิดและความรู้สึกจริงของคุณ</p>
            </header>

            <form aria-busy={submitting} className="flex flex-col gap-4" onSubmit={(event) => void submitReflection(event)}>
              {REFLECTION_PROMPTS.map((prompt, index) => {
                const key = (['r1', 'r2', 'r3'] as const)[index]
                const textareaId = `reflection-${key}`
                return (
                  <fieldset className="our-city-panel rounded-2xl p-4 md:p-5" key={key}>
                    <legend className="mb-3 text-base font-bold leading-relaxed md:text-lg">
                      <span className="mr-2 inline-grid h-7 w-7 place-items-center rounded-full bg-[#f4c96d]/18 text-sm font-black text-[#f4c96d]">{index + 1}</span>
                      {prompt}
                    </legend>
                    <textarea
                      className="w-full rounded-xl border border-white/18 bg-white/7 p-3 text-sm text-white placeholder:text-white/40 focus:border-[#f4c96d] focus:outline-none"
                      id={textareaId}
                      maxLength={REFLECTION_ANSWER_MAX_LENGTH}
                      onChange={(event) => setReflectionInput((current) => ({ ...current, [key]: event.target.value }))}
                      placeholder="เขียนคำตอบของคุณที่นี่..."
                      rows={4}
                      value={reflectionInput[key]}
                    />
                    <p className="mt-1 text-right text-xs text-[#a9c5c3]">{reflectionInput[key].length} / {REFLECTION_ANSWER_MAX_LENGTH}</p>
                  </fieldset>
                )
              })}

              {error ? <p className="text-red-200" role="alert">{error}</p> : null}

              <div className="sticky bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-[#050b14] to-transparent pb-2 pt-6">
                <button
                  className="w-full max-w-xs rounded-2xl bg-[#f4c96d] px-6 py-4 text-lg font-black text-[#1c1305] disabled:cursor-not-allowed disabled:opacity-40"
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
          <div className="our-city-panel flex flex-col items-center gap-4 rounded-2xl p-6 text-center md:p-8">
            <span className="text-4xl" aria-hidden="true">✓</span>
            <h1 className="text-2xl font-black md:text-3xl">ทำแบบประเมินครบแล้ว</h1>
            <p className="text-sm text-[#a9c5c3] md:text-base">ขอบคุณที่ร่วมทำแบบประเมินหลังกิจกรรมและการสะท้อนความคิด คำตอบของคุณถูกบันทึกเรียบร้อยแล้ว</p>
            <button className="rounded-2xl bg-[#f4c96d] px-6 py-3 text-base font-black text-[#1c1305]" onClick={finish} type="button">
              กลับหน้าหลัก
            </button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
