import { useEffect, useState } from 'react'
import { DotLottieReact } from '@lottiefiles/dotlottie-react'

const CITY_LOADER_LOTTIE_SRC = '/animations/city-loader.lottie'

const DEFAULT_MESSAGES = [
  'กำลังเตรียมเมืองของคุณ...',
  'กำลังอัปเดตสภาพเมือง...',
  'กำลังรวบรวมคำตัดสินของพลเมือง...',
]

interface CityLoaderProps {
  /** 'full' covers the viewport for page/app-level loads; 'inline' is compact for short waits inside existing panels. */
  variant?: 'full' | 'inline'
  /** Fixed message. Ignored if `messages` is provided. */
  message?: string
  /** When provided, the caption cycles through these instead of showing a single fixed message. */
  messages?: readonly string[]
  className?: string
}

const CityLoaderMark = () => (
  <div className="city-loader__mark" aria-hidden="true">
    <DotLottieReact className="city-loader__lottie" src={CITY_LOADER_LOTTIE_SRC} autoplay loop />
  </div>
)

const CityLoaderDots = () => (
  <span className="city-loader__dots" aria-hidden="true">
    <i /><i /><i />
  </span>
)

export const CityLoader = ({ variant = 'inline', message, messages, className = '' }: CityLoaderProps) => {
  const captionList = messages && messages.length > 0 ? messages : undefined
  const [captionIndex, setCaptionIndex] = useState(0)

  useEffect(() => {
    if (!captionList || captionList.length < 2) return
    const timer = window.setInterval(() => {
      setCaptionIndex((current) => (current + 1) % captionList.length)
    }, 2600)
    return () => window.clearInterval(timer)
  }, [captionList])

  const caption = captionList ? captionList[captionIndex % captionList.length] : (message ?? DEFAULT_MESSAGES[0])

  const content = (
    <div className={`city-loader city-loader--${variant} ${className}`.trim()} role="status" aria-live="polite">
      <CityLoaderMark />
      <p className="city-loader__caption">{caption}</p>
      <CityLoaderDots />
    </div>
  )

  if (variant === 'full') {
    return (
      <main className="city-loader-screen grid min-h-dvh place-items-center px-5" aria-label={caption}>
        {content}
      </main>
    )
  }

  return content
}
