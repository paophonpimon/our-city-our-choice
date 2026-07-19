import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CityStage } from '../components/CityStage'
import { createClassroomJoinUrl } from '../components/classroomUi'
import { JoinQrCode } from '../components/JoinQrCode'
import { LocationResults } from '../components/LocationResults'
import { useGame } from '../context/GameContext'
import { countAnswersForQuestion, shouldCloseQuestion } from '../domain/classroomGameLoop'
import { createRoomQuestionSnapshot, type ParsedQuestionSheet, type RoomQuestionSnapshot } from '../domain/classroomQuestions'
import { ROLES } from '../domain/ourCity'
import { useAnswers, usePlayers, useRoom, useRounds } from '../hooks/useGameData'
import { useCountdown } from '../hooks/useCountdown'
import { classroomFriendlyError } from '../services'
import { loadGoogleSheetsQuestions } from '../services/googleSheetsQuestions'
import {
  getClassroomTeacherSession,
  saveClassroomTeacherSession,
} from '../services/sessionStorage'
import { restoreTeacherSnapshot, saveTeacherSnapshot } from '../services/teacherQuestionSnapshot'

type SheetStatus = 'loading' | 'ready' | 'error'

export const TeacherPage = () => {
  const { service, uid } = useGame()
  const navigate = useNavigate()
  const storedSession = getClassroomTeacherSession()
  const restoredSnapshot = storedSession?.roomId ? restoreTeacherSnapshot(storedSession.roomId) : null
  const [roomId, setRoomId] = useState(storedSession?.roomId ?? '')
  const [questionDurationSec, setQuestionDurationSec] = useState(30)
  const [sheetStatus, setSheetStatus] = useState<SheetStatus>(restoredSnapshot ? 'ready' : 'loading')
  const [sheet, setSheet] = useState<ParsedQuestionSheet | null>(null)
  const [sheetError, setSheetError] = useState('')
  const [trustedSnapshot, setTrustedSnapshot] = useState<RoomQuestionSnapshot | null>(restoredSnapshot)
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const closingRef = useRef(false)

  const roomState = useRoom(roomId)
  const playersState = usePlayers(roomId)
  const answersState = useAnswers(roomId)
  const roundsState = useRounds(roomId)
  const room = roomState.data
  const remaining = useCountdown(room?.questionDeadlineAt ?? null)
  const answerCount = room && room.currentQuestionNumber > 0
    ? countAnswersForQuestion(answersState.data, room.currentQuestionNumber, room.gameCycle)
    : 0
  const currentRound = room
    ? roundsState.data.find((round) => round.gameCycle === room.gameCycle && round.questionNumber === room.currentQuestionNumber) ?? null
    : null

  const loadQuestions = useCallback(async (): Promise<void> => {
    setSheetStatus('loading')
    setSheetError('')
    try {
      const result = await loadGoogleSheetsQuestions()
      setSheet(result)
      if (!result.valid) {
        const roleErrors = result.errors
          .filter((error) => error.message.includes('requires at least'))
          .map((error) => error.message)
        setSheetError(roleErrors.join(' • ') || `ข้อมูลคำถามไม่ถูกต้อง ${result.errors.length} จุด`)
        setSheetStatus('error')
      } else {
        setSheetStatus('ready')
      }
    } catch (reason) {
      setSheet(null)
      setSheetError(classroomFriendlyError(reason))
      setSheetStatus('error')
    }
  }, [])

  useEffect(() => {
    if (!trustedSnapshot) void loadQuestions()
  }, [loadQuestions, trustedSnapshot])

  useEffect(() => {
    if (roomId) setTrustedSnapshot(restoreTeacherSnapshot(roomId))
  }, [roomId])

  useEffect(() => {
    if (room?.status === 'role-draw') navigate(`/role-draw/${room.roomId}`, { replace: true })
    if (room?.status === 'game-result' || room?.status === 'finished') navigate(`/result/${room.roomId}`, { replace: true })
  }, [navigate, room])

  const closeCurrentQuestion = useCallback(async (): Promise<void> => {
    if (!room || room.status !== 'playing' || !trustedSnapshot || closingRef.current) return
    closingRef.current = true
    setActionError('')
    try {
      await service.closeQuestion(room.roomId, uid, trustedSnapshot)
    } catch (reason) {
      setActionError(classroomFriendlyError(reason))
    } finally {
      closingRef.current = false
    }
  }, [room, service, trustedSnapshot, uid])

  useEffect(() => {
    if (
      room?.status === 'playing' &&
      trustedSnapshot &&
      shouldCloseQuestion(answerCount, room.lockedPlayerCount, room.questionDeadlineAt)
    ) {
      void closeCurrentQuestion()
    }
  }, [answerCount, closeCurrentQuestion, remaining, room, trustedSnapshot])

  const joinLink = useMemo(
    () => (roomId ? createClassroomJoinUrl(window.location.origin, roomId) : ''),
    [roomId],
  )

  const createRoom = async (): Promise<void> => {
    if (sheetStatus !== 'ready' || !sheet?.valid) {
      setActionError('กรุณาโหลดคำถามให้ครบก่อนสร้างห้อง')
      return
    }
    setBusy(true)
    setActionError('')
    try {
      const created = await service.createRoom(uid, questionDurationSec)
      saveClassroomTeacherSession({ roomId: created.roomId, role: 'teacher', sessionVersion: 1 })
      setRoomId(created.roomId)
    } catch (reason) {
      setActionError(classroomFriendlyError(reason))
    } finally {
      setBusy(false)
    }
  }

  const startGame = async (): Promise<void> => {
    if (!room || !sheet?.valid) return
    setBusy(true)
    setActionError('')
    try {
      const snapshot = createRoomQuestionSnapshot(room.roomId, sheet.questions)
      saveTeacherSnapshot(snapshot)
      setTrustedSnapshot(snapshot)
      await service.startGame(room.roomId, uid, snapshot)
    } catch (reason) {
      setActionError(classroomFriendlyError(reason))
    } finally {
      setBusy(false)
    }
  }

  const nextOrFinish = async (): Promise<void> => {
    if (!room) return
    setBusy(true)
    setActionError('')
    try {
      if (room.currentQuestionNumber === 10) {
        await service.finishGame(room.roomId, uid)
        navigate(`/result/${room.roomId}`)
      } else {
        await service.openNextQuestion(room.roomId, uid)
      }
    } catch (reason) {
      setActionError(classroomFriendlyError(reason))
    } finally {
      setBusy(false)
    }
  }

  const copyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(joinLink)
      setActionMessage('คัดลอกลิงก์แล้ว')
    } catch {
      setActionMessage('เลือกและคัดลอกลิงก์ด้านล่างได้เลย')
    }
  }

  if (room && (room.status === 'playing' || room.status === 'round-result')) {
    const missingTrusted = !trustedSnapshot
    return (
      <CityStage
        answerCount={answerCount}
        remainingSeconds={remaining}
        room={room}
        roundImpact={currentRound?.roundAverage ?? null}
        controls={
          <>
            {room.status === 'playing' ? (
              <button
                className="rounded-xl border border-white/30 bg-black/55 px-5 py-3 font-black text-white disabled:opacity-40"
                disabled={missingTrusted || closingRef.current}
                onClick={() => void closeCurrentQuestion()}
              >
                ปิดข้อก่อนเวลา
              </button>
            ) : (
              <button
                className="rounded-xl bg-[#f0c866] px-6 py-3 font-black text-[#102228] disabled:opacity-50"
                disabled={busy}
                onClick={() => void nextOrFinish()}
              >
                {room.currentQuestionNumber === 10 ? 'ดูผลเมือง' : 'ข้อถัดไป'}
              </button>
            )}
          </>
        }
      >
        {missingTrusted ? (
          <div className="mx-auto max-w-2xl rounded-2xl border border-red-300/40 bg-red-950/90 p-5 text-center text-lg font-bold">
            ไม่พบข้อมูลตรวจคำตอบที่บันทึกไว้ในเครื่องครู เครื่องนี้จึงไม่สามารถสรุปคำตอบต่อได้ กรุณากลับมาใช้เครื่องเดิม
          </div>
        ) : null}
        {room.status === 'round-result' && currentRound ? <LocationResults summaries={currentRound.locationSummaries} /> : null}
        {actionError ? <p className="mx-auto mt-3 max-w-xl rounded-xl bg-red-950/85 px-4 py-3 text-center">{actionError}</p> : null}
      </CityStage>
    )
  }

  return (
    <main className="our-city-page min-h-dvh px-5 py-6 md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold tracking-[.18em] text-[#f4c96d] uppercase">Our City, Our Choice</p>
            <h1 className="mt-1 text-3xl font-black md:text-5xl">เตรียมเมืองสำหรับชั้นเรียน</h1>
          </div>
          <Link className="rounded-xl border border-white/15 px-4 py-2 font-bold" to="/">หน้าหลัก</Link>
        </header>

        <div className="mt-5 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <section className="our-city-panel p-6 md:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-[#8fc4c5]">สถานะคลังคำถาม</p>
                <h2 className="mt-1 text-2xl font-black">คลังคำถาม</h2>
              </div>
              <button className="rounded-xl border border-white/20 px-4 py-2 font-bold" onClick={() => void loadQuestions()}>
                {sheetStatus === 'loading' ? 'กำลังโหลด…' : 'โหลดใหม่'}
              </button>
            </div>
            {sheetStatus === 'ready' && sheet ? (
              <>
                <p className="mt-4 rounded-xl bg-emerald-400/10 px-4 py-3 font-bold text-emerald-200">พร้อมใช้งาน • คำถาม {sheet.activeQuestions} ข้อ</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {ROLES.map((role) => (
                    <div className="flex items-center justify-between rounded-xl bg-white/6 px-4 py-3" key={role.id}>
                      <span>{role.label}</span><strong>{sheet.activeByRole[role.id]} ข้อ</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
            {sheetStatus === 'error' ? <p className="mt-4 rounded-xl bg-red-400/10 px-4 py-3 text-red-200">{sheetError}</p> : null}
          </section>

          <section className="our-city-panel p-6 md:p-8">
            {!roomId ? (
              <>
                <p className="text-sm font-bold text-[#8fc4c5]">ตั้งค่าห้องเรียน</p>
                <h2 className="mt-1 text-2xl font-black">สร้างห้อง</h2>
                <label className="mt-6 block">
                  <span className="mb-2 block font-bold">วินาทีต่อคำถาม</span>
                  <input
                    className="w-full rounded-2xl border border-white/15 bg-white/7 px-4 py-4 text-2xl font-black outline-none focus:border-[#f4c96d]"
                    min={1}
                    onChange={(event) => setQuestionDurationSec(Number(event.target.value))}
                    step={1}
                    type="number"
                    value={questionDurationSec}
                  />
                </label>
                <button
                  className="mt-6 w-full rounded-2xl bg-[#f0c866] px-5 py-4 text-lg font-black text-[#102228] disabled:opacity-45"
                  disabled={busy || sheetStatus !== 'ready' || !Number.isInteger(questionDurationSec) || questionDurationSec <= 0}
                  onClick={() => void createRoom()}
                >
                  สร้างห้อง
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-[#8fc4c5]">ห้องพร้อมรับนักเรียน</p>
                <JoinQrCode joinUrl={joinLink} roomId={roomId} />
                <div className="teacher-lobby-summary">
                  <div><span>ผู้เข้าร่วม</span><strong>{playersState.data.length} คน</strong></div>
                  <div><span>เวลาต่อคำถาม</span><strong>{room?.questionDurationSec ?? questionDurationSec} วินาที</strong></div>
                </div>
                <button className="copy-join-link" onClick={() => void copyLink()}>คัดลอกลิงก์เข้าห้อง</button>
                <span className="ml-3 text-sm text-[#f4c96d]" aria-live="polite">{actionMessage}</span>
                <div className="teacher-player-list">
                  {playersState.data.map((player, index) => (
                    <div className="teacher-player-row" key={player.playerId}>
                      <span>{index + 1}. {player.nickname}</span><span className="text-[#9eb4b4]">พร้อม</span>
                    </div>
                  ))}
                  {playersState.data.length === 0 ? <p className="py-5 text-center text-[#9eb4b4]">รอนักเรียนเข้าห้อง…</p> : null}
                </div>
                <button
                  className="mt-6 w-full rounded-2xl bg-[#f0c866] px-5 py-4 text-lg font-black text-[#102228] disabled:opacity-45"
                  disabled={busy || playersState.data.length === 0 || sheetStatus !== 'ready' || room?.status !== 'lobby'}
                  onClick={() => void startGame()}
                >
                  เริ่มเกม
                </button>
              </>
            )}
            {actionError || roomState.error || playersState.error ? (
              <p className="mt-4 rounded-xl bg-red-400/10 px-4 py-3 text-red-200">{actionError || roomState.error || playersState.error}</p>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  )
}
