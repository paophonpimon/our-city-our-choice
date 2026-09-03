import { useEffect, useMemo, useState } from 'react'

interface TypewriterTextProps {
  text: string
  active?: boolean
  startDelayMs?: number
  characterDelayMs?: number
}

const segmentText = (text: string): string[] => {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' })
    return Array.from(segmenter.segment(text), ({ segment }) => segment)
  }

  return Array.from(text)
}

export const TypewriterText = ({
  text,
  active = true,
  startDelayMs = 0,
  characterDelayMs = 32,
}: TypewriterTextProps) => {
  const graphemes = useMemo(() => segmentText(text), [text])
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    if (!active) {
      setVisibleCount(0)
      return
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisibleCount(graphemes.length)
      return
    }

    setVisibleCount(0)
    let intervalId: number | null = null
    const startTimerId = window.setTimeout(() => {
      if (graphemes.length === 0) return
      setVisibleCount(1)
      intervalId = window.setInterval(() => {
        setVisibleCount((current) => {
          if (current >= graphemes.length) {
            if (intervalId !== null) window.clearInterval(intervalId)
            return current
          }
          return current + 1
        })
      }, characterDelayMs)
    }, startDelayMs)

    return () => {
      window.clearTimeout(startTimerId)
      if (intervalId !== null) window.clearInterval(intervalId)
    }
  }, [active, characterDelayMs, graphemes, startDelayMs])

  const isTyping = active && visibleCount < graphemes.length

  return (
    <span className="typewriter-text" aria-label={text}>
      <span className="typewriter-text__measure" aria-hidden="true">{text}</span>
      <span className="typewriter-text__value" aria-hidden="true">
        {graphemes.slice(0, visibleCount).join('')}
        {isTyping ? <span className="typewriter-text__cursor" /> : null}
      </span>
    </span>
  )
}
