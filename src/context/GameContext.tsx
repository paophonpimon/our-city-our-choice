import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { classroomFriendlyError, classroomGameServicePromise, type ClassroomGameService } from '../services'
import { CityLoader } from '../components/CityLoader'

interface GameContextValue {
  service: ClassroomGameService
  uid: string
  refreshSession: () => Promise<string>
}

const GameContext = createContext<GameContextValue | null>(null)

export const GameProvider = ({ children }: { children: ReactNode }) => {
  const [service, setService] = useState<ClassroomGameService | null>(null)
  const [uid, setUid] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setError('')
    classroomGameServicePromise
      .then(async (nextService) => {
        const nextUid = await nextService.ensureSession()
        if (active) {
          setService(nextService)
          setUid(nextUid)
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(classroomFriendlyError(reason))
      })
    return () => {
      active = false
    }
  }, [attempt])

  const refreshSession = useCallback(async (): Promise<string> => {
    if (!service) throw new Error('ระบบกำลังเชื่อมต่อ กรุณาลองใหม่อีกครั้ง')
    const nextUid = await service.ensureSession()
    setUid(nextUid)
    return nextUid
  }, [service])

  const value = useMemo(
    () => (service && uid ? { service, uid, refreshSession } : null),
    [refreshSession, service, uid],
  )

  if (error) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#080b23] px-5 text-center text-[#fff7df]">
        <section className="glass-panel max-w-lg p-7">
          <p className="eyebrow">การเชื่อมต่อขัดข้อง</p>
          <h1 className="mt-3 text-2xl font-semibold">ยังเปิดประตูสู่ภารกิจไม่ได้</h1>
          <p className="mt-3 text-[#d8d1c5]">{error}</p>
          <button className="primary-button mt-6 w-full" onClick={() => setAttempt((value) => value + 1)}>
            ลองเชื่อมต่ออีกครั้ง
          </button>
        </section>
      </main>
    )
  }

  if (!value) {
    return (
      <CityLoader
        variant="full"
        messages={['กำลังเชื่อมต่อกับห้องกิจกรรม...', 'กำลังเตรียมเมืองของคุณ...', 'กำลังอัปเดตสภาพเมือง...']}
      />
    )
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

// Hook และ Provider อยู่ไฟล์เดียวกันเพื่อให้ขอบเขต context ชัดเจน
// eslint-disable-next-line react-refresh/only-export-components
export const useGame = (): GameContextValue => {
  const context = useContext(GameContext)
  if (!context) throw new Error('useGame ต้องอยู่ภายใน GameProvider')
  return context
}
