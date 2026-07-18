import { useEffect, useState } from 'react'
import { getRemainingSeconds } from '../domain/classroomGameLoop'

export const useCountdown = (deadlineAt: number | null): number => {
  const [remaining, setRemaining] = useState(() => getRemainingSeconds(deadlineAt))

  useEffect(() => {
    const update = (): void => setRemaining(getRemainingSeconds(deadlineAt))
    update()
    if (deadlineAt === null) return
    const interval = window.setInterval(update, 250)
    return () => window.clearInterval(interval)
  }, [deadlineAt])

  return remaining
}
