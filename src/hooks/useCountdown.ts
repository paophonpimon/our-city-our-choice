import { useEffect, useRef, useState } from 'react'
import { getRemainingSeconds } from '../domain/classroomGameLoop'

export const useCountdown = (deadlineAt: number | null): number => {
  const [remaining, setRemaining] = useState(() => getRemainingSeconds(deadlineAt))
  const generationRef = useRef(0)

  useEffect(() => {
    const generation = generationRef.current + 1
    generationRef.current = generation
    const update = (): void => {
      if (generationRef.current === generation) setRemaining(getRemainingSeconds(deadlineAt))
    }
    update()
    if (deadlineAt === null) return
    const interval = window.setInterval(update, 250)
    return () => {
      if (generationRef.current === generation) generationRef.current += 1
      window.clearInterval(interval)
    }
  }, [deadlineAt])

  return remaining
}
