import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ClassroomRoom, ClassroomRoundResult } from '../types/classroomGame'
import { formatCityLevel } from '../domain/ourCity'
import type { LocationId, LocationSummary } from '../domain/cityScoring'
import { SCORE_POSITIONS } from './locationScoreDisplay'
import { CityScene, type BuildingEffectTone } from './CityScene'
import type { BuildingTransitionDirection } from '../domain/cityPresentation'
import {
  BUILDING_IDS,
  CITY_SCENE_PROFILES,
  CITY_STAGE_HEIGHT,
  CITY_STAGE_WIDTH,
  LOCATION_BUILDING,
  normalizeBuildingLevels,
  resolveBuildingAsset,
  resolveBuildingAssetPlacement,
  resolveCitySceneProfile,
  type BuildingId,
  type BuildingLevels,
  type BuildingLevel,
  type CitySceneBuildingPlacement,
  type CitySceneProfileId,
} from '../domain/cityBuildings'
import { CityBirdsAnimation } from './CityBirdsAnimation'
import { CityCloudsAnimation } from './CityCloudsAnimation'
import { FullscreenToggle } from './FullscreenToggle'
import {
  clearLayoutPlacement,
  clearLayoutScene,
  exportAllEffectivePlacements,
  getLayoutPlacement,
  readCityLayoutOverrides,
  resolveEffectivePlacement,
  setLayoutPlacement,
  writeCityLayoutOverrides,
  type CityLayoutOverrides,
} from '../domain/cityLayoutOverrides'

const CITY_LEVEL_MESSAGES: Record<ClassroomRoom['cityLevel'], string> = {
  critical: 'เมืองอยู่ในระดับแย่มาก ต้องร่วมกันแก้ไขอย่างเร่งด่วน',
  declining: 'เมืองอยู่ในระดับแย่ การตัดสินใจต่อจากนี้จะช่วยฟื้นฟูเมืองได้',
  neutral: 'เมืองเริ่มต้นในภาวะปกติ ทุกการตัดสินใจต่อจากนี้มีความหมาย',
  improving: 'เมืองกำลังพัฒนาจากการตัดสินใจที่รับผิดชอบ',
  prosperous: 'เมืองพัฒนาอย่างมั่นคงจากความร่วมมือของทุกคน',
}

const CITY_LEVEL_EMOJI: Record<ClassroomRoom['cityLevel'], string> = {
  critical: '🚨',
  declining: '😟',
  neutral: '🏙️',
  improving: '🙂',
  prosperous: '🌟',
}

const CITY_LEVEL_PROGRESS: Record<ClassroomRoom['cityLevel'], number> = {
  critical: 18,
  declining: 36,
  neutral: 50,
  improving: 72,
  prosperous: 92,
}

const BUILDING_IMPACT_ITEMS: readonly { id: LocationId; label: string; icon: string }[] = [
  { id: 'school', label: 'โรงเรียน', icon: '🏫' },
  { id: 'construction', label: 'ไซต์ก่อสร้าง', icon: '🏗️' },
  { id: 'market', label: 'ตลาด', icon: '🏪' },
  { id: 'hospital', label: 'โรงพยาบาล', icon: '🏥' },
  { id: 'police-station', label: 'สถานีตำรวจ', icon: '👮' },
  { id: 'municipal-office', label: 'สำนักงานเทศบาล', icon: '🏛️' },
  { id: 'news-office', label: 'สำนักข่าว', icon: '📡' },
]

const BUILDING_LABEL_POSITIONS: Record<LocationId, { x: number; y: number }> = {
  school: { x: SCORE_POSITIONS.school.x, y: 29 },
  construction: { x: 65, y: 19 },
  market: { x: 83, y: 43 },
  hospital: { x: SCORE_POSITIONS.hospital.x, y: 66 },
  'police-station': { x: 65, y: 61 },
  'municipal-office': { x: 50, y: 89 },
  'news-office': { x: 81, y: 79 },
}

const BUILDING_EFFECT_POSITIONS: Record<LocationId, { x: number; y: number; size: number }> = {
  school: { x: 31, y: 24, size: 19 },
  construction: { x: 61, y: 22, size: 20 },
  market: { x: 86, y: 35, size: 16 },
  hospital: { x: 31, y: 54, size: 18 },
  'police-station': { x: 68, y: 54, size: 18 },
  'municipal-office': { x: 54, y: 74, size: 19 },
  'news-office': { x: 82, y: 75, size: 16 },
}

interface CityStageProps {
  room: ClassroomRoom
  visualCityLevel?: ClassroomRoom['cityLevel']
  visualBuildingLevels?: BuildingLevels
  buildingTransitions?: Partial<Record<BuildingId, BuildingTransitionDirection>>
  remainingSeconds: number
  answerCount: number
  previewCityScore?: number | null
  roundImpact?: number | null
  locationImpacts?: Record<LocationId, LocationSummary> | null
  roundHistory?: readonly ClassroomRoundResult[]
  controls?: React.ReactNode
  utilityControls?: React.ReactNode
  children?: React.ReactNode
}

const signed = (value: number): string => `${value > 0 ? '+' : ''}${Math.round(value)}`

const CITY_ZOOM_STORAGE_KEY = 'our_city_teacher_scene_zoom_v1'
const CITY_ZOOM_MIN = 70
const CITY_ZOOM_MAX = 160
const CITY_ZOOM_STEP = 10

interface CityPan {
  x: number
  y: number
}

interface CityContentFrame {
  left: number
  top: number
  width: number
  height: number
}

interface LayoutDragState {
  buildingId: BuildingId
  pointerId: number
  startClientX: number
  startClientY: number
  startPlacement: CitySceneBuildingPlacement
}

const LAYOUT_BUILDING_LABELS: Record<BuildingId, string> = {
  school: 'โรงเรียน',
  construction: 'ไซต์ก่อสร้าง',
  market: 'ตลาด',
  hospital: 'โรงพยาบาล',
  police: 'สถานีตำรวจ',
  municipality: 'สำนักงานเทศบาล',
  newsAgency: 'สำนักข่าว',
}

const LAYOUT_SCENE_LABELS: Record<CitySceneProfileId, string> = {
  degraded: 'เมืองโทรม',
  normal: 'เมืองปกติ',
  developed: 'เมืองเจริญ',
}

const readStoredCityLayout = (): CityLayoutOverrides => {
  if (typeof window === 'undefined') return {}
  return readCityLayoutOverrides()
}

const EMPTY_CITY_CONTENT_FRAME: CityContentFrame = { left: 0, top: 0, width: 0, height: 0 }

const clampCityZoom = (value: number): number => Math.min(CITY_ZOOM_MAX, Math.max(CITY_ZOOM_MIN, value))

const readStoredCityZoom = (): number => {
  if (typeof window === 'undefined') return 100
  try {
    const storedZoom = Number(window.localStorage.getItem(CITY_ZOOM_STORAGE_KEY))
    return Number.isFinite(storedZoom) && storedZoom > 0 ? clampCityZoom(storedZoom) : 100
  } catch {
    return 100
  }
}

export const CityStage = ({ room, visualCityLevel, visualBuildingLevels, buildingTransitions, remainingSeconds, answerCount, previewCityScore, roundImpact, locationImpacts, roundHistory = [], controls, utilityControls, children }: CityStageProps) => {
  const scoreTarget = previewCityScore ?? room.cityScore
  const previousScore = useRef(scoreTarget)
  const cityCanvasRef = useRef<HTMLElement | null>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origin: CityPan } | null>(null)
  const layoutDragRef = useRef<LayoutDragState | null>(null)
  const [displayScore, setDisplayScore] = useState(scoreTarget)
  const [cityZoom, setCityZoom] = useState(readStoredCityZoom)
  const [cityPan, setCityPan] = useState<CityPan>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [selectedBuildingId, setSelectedBuildingId] = useState<LocationId | null>(null)
  const [cityContentFrame, setCityContentFrame] = useState<CityContentFrame>(EMPTY_CITY_CONTENT_FRAME)
  const isLayoutMode = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('layout') === '1'
  const [layoutSceneId, setLayoutSceneId] = useState<CitySceneProfileId>(() =>
    resolveCitySceneProfile(visualCityLevel ?? room.cityLevel).id)
  const [layoutModelLevel, setLayoutModelLevel] = useState<BuildingLevel>(0)
  const [layoutSelectedBuilding, setLayoutSelectedBuilding] = useState<BuildingId>('school')
  const [layoutOverrides, setLayoutOverrides] = useState<CityLayoutOverrides>(readStoredCityLayout)
  const [layoutFeedback, setLayoutFeedback] = useState('บันทึกอัตโนมัติในเครื่องนี้')
  const displayedCityLevel = visualCityLevel ?? room.cityLevel
  const displayedSceneProfile = isLayoutMode
    ? CITY_SCENE_PROFILES[layoutSceneId]
    : resolveCitySceneProfile(displayedCityLevel)
  const displayedPlacementOverrides = layoutOverrides[displayedSceneProfile.id]
  const displayedBuildingLevels = isLayoutMode
    ? Object.fromEntries(BUILDING_IDS.map((buildingId) => [buildingId, layoutModelLevel])) as BuildingLevels
    : normalizeBuildingLevels(visualBuildingLevels ?? room.buildingLevels)
  const alignPointToDisplayedScene = (locationId: LocationId, point: { x: number; y: number }) => {
    const buildingId = LOCATION_BUILDING[locationId]
    const placement = resolveEffectivePlacement(
      displayedPlacementOverrides, displayedSceneProfile.id, buildingId, displayedBuildingLevels[buildingId],
    )
    return {
      x: (placement.x + point.x / 100 * CITY_STAGE_WIDTH * placement.scaleX) / CITY_STAGE_WIDTH * 100,
      y: (placement.y + point.y / 100 * CITY_STAGE_HEIGHT * placement.scaleY) / CITY_STAGE_HEIGHT * 100,
    }
  }
  const displayedBuildingEffects = Object.fromEntries(
    BUILDING_IMPACT_ITEMS.flatMap((building) => {
      const summary = locationImpacts?.[building.id]
      if (!summary || summary.participantCount === 0 || summary.scoreAverage === 0) return []
      return [[
        LOCATION_BUILDING[building.id],
        summary.scoreAverage > 0 ? 'integrity' : 'corruption',
      ]]
    }),
  ) as Partial<Record<(typeof LOCATION_BUILDING)[LocationId], BuildingEffectTone>>
  const selectedBuilding = BUILDING_IMPACT_ITEMS.find((building) => building.id === selectedBuildingId) ?? null
  const selectedBuildingPosition = selectedBuildingId
    ? alignPointToDisplayedScene(selectedBuildingId, BUILDING_LABEL_POSITIONS[selectedBuildingId])
    : null
  const selectedHistory = selectedBuildingId
    ? roundHistory
        .filter((round) => round.gameCycle === room.gameCycle)
        .sort((left, right) => left.questionNumber - right.questionNumber)
        .map((round) => ({ questionNumber: round.questionNumber, ...round.locationSummaries[selectedBuildingId] }))
    : []
  const selectedTotals = selectedHistory.reduce((totals, summary) => ({
    integrity: totals.integrity + summary.integrityCount,
    corruption: totals.corruption + summary.corruptionCount,
    timeout: totals.timeout + summary.timeoutCount,
    score: totals.score + summary.scoreTotal,
    participants: totals.participants + summary.participantCount,
  }), { integrity: 0, corruption: 0, timeout: 0, score: 0, participants: 0 })
  const selectedAverage = selectedTotals.participants > 0 ? selectedTotals.score / selectedTotals.participants : 0
  const getEffectiveLayoutPlacement = (buildingId: BuildingId): CitySceneBuildingPlacement =>
    getLayoutPlacement(layoutOverrides, layoutSceneId, buildingId, layoutModelLevel)

  const updateLayoutPlacement = (
    buildingId: BuildingId,
    update: Partial<CitySceneBuildingPlacement> | ((current: CitySceneBuildingPlacement) => CitySceneBuildingPlacement),
  ): void => {
    setLayoutOverrides((currentOverrides) => {
      const currentPlacement = getLayoutPlacement(currentOverrides, layoutSceneId, buildingId, layoutModelLevel)
      const nextPlacement = typeof update === 'function'
        ? update(currentPlacement)
        : { ...currentPlacement, ...update }
      return setLayoutPlacement(currentOverrides, layoutSceneId, buildingId, layoutModelLevel, nextPlacement)
    })
    setLayoutFeedback('บันทึกอัตโนมัติแล้ว')
  }

  // Only clears this scene + building + model level. Every other level (and
  // every other scene) this building has been calibrated for is untouched.
  const resetLayoutBuilding = (buildingId: BuildingId): void => {
    setLayoutOverrides((currentOverrides) => clearLayoutPlacement(currentOverrides, layoutSceneId, buildingId, layoutModelLevel))
    setLayoutFeedback(`คืนค่า ${LAYOUT_BUILDING_LABELS[buildingId]} Lv.${layoutModelLevel} แล้ว`)
  }

  // Wide, explicit reset: clears every building AND every model level saved
  // for this one scene. Requires confirmation since it can discard a lot of
  // calibration work (up to 7 buildings x 5 levels) in one action.
  const resetLayoutScene = (): void => {
    const confirmed = window.confirm(
      `คืนค่าฉาก${LAYOUT_SCENE_LABELS[layoutSceneId]}ทั้งหมดใช่ไหม? การกระทำนี้จะล้างค่าที่ปรับไว้ของทุกอาคารและทุกโมเดล (Lv.-2 ถึง Lv.+2) ในฉากนี้ ฉากอื่นและอาคาร/โมเดลที่ปรับในฉากอื่นจะไม่ถูกแตะต้อง`,
    )
    if (!confirmed) return
    setLayoutOverrides((currentOverrides) => clearLayoutScene(currentOverrides, layoutSceneId))
    setLayoutFeedback(`คืนค่าฉาก${LAYOUT_SCENE_LABELS[layoutSceneId]}ทั้งหมดแล้ว`)
  }

  const copyLayoutJson = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(layoutOverrides, null, 2))
      setLayoutFeedback('คัดลอก JSON แล้ว (มีทุกฉาก/อาคาร/โมเดลที่ปรับไว้) ส่งให้ Codex นำไปใส่ในโปรเจกต์ได้เลย')
    } catch {
      setLayoutFeedback('คัดลอกไม่ได้ กรุณาอนุญาต Clipboard ในเบราว์เซอร์')
    }
  }

  // Recovery/export only: reads the same effective-placement computation
  // CityScene renders with (saved override, else scene/base + per-level
  // fallback) for all 3 scenes x 7 buildings x 5 levels = 105 records. Never
  // writes to storage, never migrates, never changes what is on screen.
  const copyAllEffectivePlacements = async (): Promise<void> => {
    try {
      const records = exportAllEffectivePlacements(layoutOverrides)
      await navigator.clipboard.writeText(JSON.stringify(records, null, 2))
      setLayoutFeedback(`คัดลอกค่าตำแหน่งทั้งหมดแล้ว (${records.length} รายการ: 3 ฉาก x 7 อาคาร x 5 โมเดล)`)
    } catch {
      setLayoutFeedback('คัดลอกไม่ได้ กรุณาอนุญาต Clipboard ในเบราว์เซอร์')
    }
  }

  const startLayoutDrag = (event: React.PointerEvent<HTMLButtonElement>, buildingId: BuildingId): void => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setLayoutSelectedBuilding(buildingId)
    layoutDragRef.current = {
      buildingId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPlacement: { ...getEffectiveLayoutPlacement(buildingId) },
    }
  }

  const moveLayoutBuilding = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const drag = layoutDragRef.current
    const canvas = cityCanvasRef.current
    if (!drag || drag.pointerId !== event.pointerId || !canvas) return
    event.preventDefault()
    event.stopPropagation()
    const bounds = canvas.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    const x = drag.startPlacement.x + (event.clientX - drag.startClientX) / bounds.width * CITY_STAGE_WIDTH
    const y = drag.startPlacement.y + (event.clientY - drag.startClientY) / bounds.height * CITY_STAGE_HEIGHT
    updateLayoutPlacement(drag.buildingId, {
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
    })
  }

  const stopLayoutDrag = (pointerId: number): void => {
    if (layoutDragRef.current?.pointerId === pointerId) layoutDragRef.current = null
  }

  const nudgeLayoutBuilding = (buildingId: BuildingId, x: number, y: number): void => {
    updateLayoutPlacement(buildingId, (current) => ({
      ...current,
      x: Math.round((current.x + x) * 100) / 100,
      y: Math.round((current.y + y) * 100) / 100,
    }))
  }

  const selectedLayoutPlacement = getEffectiveLayoutPlacement(layoutSelectedBuilding)
  // Diagnostic only: does this exact scene/building/level have a saved v2
  // override, or is it currently riding on the scene/base fallback?
  const selectedLayoutSource = resolveEffectivePlacement(
    layoutOverrides[layoutSceneId], layoutSceneId, layoutSelectedBuilding, layoutModelLevel,
  ).source

  const canvasWidth = cityContentFrame.left * 2 + cityContentFrame.width
  const canvasHeight = cityContentFrame.top * 2 + cityContentFrame.height
  const selectedBuildingAnchor = selectedBuildingPosition ? {
    x: canvasWidth / 2 + (
      cityContentFrame.left + cityContentFrame.width * selectedBuildingPosition.x / 100 - canvasWidth / 2
    ) * cityZoom / 100 + cityPan.x,
    y: canvasHeight / 2 + (
      cityContentFrame.top + cityContentFrame.height * selectedBuildingPosition.y / 100 - canvasHeight / 2
    ) * cityZoom / 100 + cityPan.y,
  } : null

  const clampPan = (pan: CityPan, zoom = cityZoom): CityPan => {
    const canvas = cityCanvasRef.current
    if (!canvas || zoom <= 100) return { x: 0, y: 0 }
    const scaleOverflow = zoom / 100 - 1
    const maxX = canvas.clientWidth * scaleOverflow / 2
    const maxY = canvas.clientHeight * scaleOverflow / 2
    return {
      x: Math.max(-maxX, Math.min(maxX, pan.x)),
      y: Math.max(-maxY, Math.min(maxY, pan.y)),
    }
  }

  useEffect(() => {
    const from = previousScore.current
    const to = scoreTarget
    previousScore.current = to
    if (from === to) {
      setDisplayScore(to)
      return
    }
    const startedAt = performance.now()
    let frame = 0
    const animate = (now: number): void => {
      const progress = Math.min(1, (now - startedAt) / 700)
      setDisplayScore(from + (to - from) * (1 - (1 - progress) ** 3))
      if (progress < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [scoreTarget])

  useEffect(() => {
    try {
      window.localStorage.setItem(CITY_ZOOM_STORAGE_KEY, String(cityZoom))
    } catch {
      // The controls still work when storage is unavailable.
    }
  }, [cityZoom])

  useEffect(() => {
    try {
      writeCityLayoutOverrides(layoutOverrides)
    } catch {
      setLayoutFeedback('เบราว์เซอร์ไม่อนุญาตให้บันทึกค่าพิกัด')
    }
  }, [layoutOverrides])

  useEffect(() => {
    setCityPan((current) => clampPan(current, cityZoom))
  // clampPan intentionally follows the current canvas dimensions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityZoom])

  useEffect(() => {
    const handleResize = (): void => setCityPan((current) => clampPan(current))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  // The listener reads the latest zoom when it is registered.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityZoom])

  useEffect(() => {
    const canvas = cityCanvasRef.current
    if (!canvas) return
    const updateContentFrame = (): void => {
      const canvasWidth = canvas.clientWidth
      const canvasHeight = canvas.clientHeight
      if (canvasWidth <= 0 || canvasHeight <= 0) return
      const sceneAspectRatio = CITY_STAGE_WIDTH / CITY_STAGE_HEIGHT
      const width = Math.min(canvasWidth, canvasHeight * sceneAspectRatio)
      const height = width / sceneAspectRatio
      const nextFrame = {
        left: (canvasWidth - width) / 2,
        top: (canvasHeight - height) / 2,
        width,
        height,
      }
      setCityContentFrame((current) =>
        Math.abs(current.left - nextFrame.left) < .5 &&
        Math.abs(current.top - nextFrame.top) < .5 &&
        Math.abs(current.width - nextFrame.width) < .5 &&
        Math.abs(current.height - nextFrame.height) < .5
          ? current
          : nextFrame)
    }
    updateContentFrame()
    const observer = new ResizeObserver(updateContentFrame)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  const stopPanning = (pointerId: number): void => {
    const canvas = cityCanvasRef.current
    if (canvas?.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId)
    dragRef.current = null
    setIsPanning(false)
  }

  const resetCityView = (): void => {
    setCityZoom(100)
    setCityPan({ x: 0, y: 0 })
  }

  const answerProgress = room.lockedPlayerCount > 0
    ? Math.min(100, (answerCount / room.lockedPlayerCount) * 100)
    : 0

  return (
    <main
      className={`city-stage city-stage--${displayedCityLevel}${isSidebarOpen ? ' is-sidebar-open' : ''}`}
      aria-label="ภาพรวมเมืองสำหรับจอครู"
      style={{
        '--city-scene-zoom': cityZoom / 100,
        '--city-pan-x': `${cityPan.x}px`,
        '--city-pan-y': `${cityPan.y}px`,
      } as React.CSSProperties}
    >
      <button
        aria-controls="teacher-dashboard-menu"
        aria-expanded={isSidebarOpen}
        aria-label={isSidebarOpen ? 'ซ่อนเมนูแดชบอร์ด' : 'เปิดเมนูแดชบอร์ด'}
        className="city-stage__menu-toggle"
        onClick={() => setIsSidebarOpen((current) => !current)}
        type="button"
      >
        <span aria-hidden="true">{isSidebarOpen ? '×' : '☰'}</span>
        <small>{isSidebarOpen ? 'ปิด' : 'เมนู'}</small>
      </button>
      <button
        aria-label="ปิดเมนูแดชบอร์ด"
        className="city-stage__sidebar-scrim"
        onClick={() => setIsSidebarOpen(false)}
        tabIndex={isSidebarOpen ? 0 : -1}
        type="button"
      />
      <aside className="city-stage__sidebar" id="teacher-dashboard-menu" aria-label="เมนูแดชบอร์ดครู" aria-hidden={!isSidebarOpen}>
        <div className="city-stage__brand">
          <span className="city-stage__brand-mark" aria-hidden="true">🏙️</span>
          <div>
            <p className="city-stage__brand-title">OUR CITY</p>
            <p className="city-stage__brand-title city-stage__brand-title--gold">OUR CHOICE</p>
            <strong>เมืองนี้...อยู่ที่เรา</strong>
          </div>
        </div>
        <p className="city-stage__brand-subtitle">เกมสร้างเมืองโปร่งใส ไร้ทุจริต</p>
        <nav className="city-stage__nav">
          <span className="is-active"><b aria-hidden="true">▥</b>ภาพรวมเมือง</span>
          <span><b aria-hidden="true">▤</b>สถานะอาคาร</span>
          <span><b aria-hidden="true">☑</b>ผลโหวต</span>
          <span><b aria-hidden="true">★</b>คะแนนเมือง</span>
          <span><b aria-hidden="true">◴</b>ประวัติการเล่น</span>
          <span><b aria-hidden="true">⚙</b>ตั้งค่า</span>
        </nav>
        <div className="city-stage__sidebar-footer">
          <span aria-hidden="true">👩‍🏫🏙️👨‍🎓</span>
          <strong>ร่วมกันสร้างเมืองที่ดี</strong>
          <small>เริ่มที่เรา เปลี่ยนเมืองของเรา</small>
        </div>
      </aside>

      <header className="city-stage__topbar">
        <div className="city-stage__metrics">
          <div><i aria-hidden="true">🚩</i><span>ข้อที่</span><strong>{room.currentQuestionNumber} / 10</strong></div>
          <div className="city-stage__score"><i aria-hidden="true">⭐</i><span>คะแนนเมือง</span><strong>{Math.round(displayScore).toLocaleString('th-TH')}</strong></div>
          <div><i aria-hidden="true">🏆</i><span>เป้าหมาย</span><strong>{answerCount} / {room.lockedPlayerCount}</strong></div>
          <div><i aria-hidden="true">⏱️</i><span>เวลาที่เหลือ</span><strong>{room.status === 'playing' ? remainingSeconds : 0} <small>วินาที</small></strong></div>
        </div>
        <div className="city-stage__classroom-card">
          <span aria-hidden="true">👥</span>
          <div><small>ห้องเรียน</small><strong>{room.roomId}</strong></div>
        </div>
      </header>

      <div className="city-stage__workspace">
        <figure
          className={`city-stage__canvas is-scene-${displayedSceneProfile.id}${isLayoutMode ? ' is-layout-calibrating' : ''}${cityZoom > 100 ? ' is-pannable is-zoomed' : ''}${isPanning ? ' is-panning' : ''}`}
          data-city-level={displayedCityLevel}
          data-city-scene={displayedSceneProfile.id}
          data-city-zoom={cityZoom}
          onPointerCancel={(event) => stopPanning(event.pointerId)}
          onPointerDown={(event) => {
            if (cityZoom <= 100 || event.button !== 0) return
            event.currentTarget.setPointerCapture(event.pointerId)
            dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: cityPan }
            setIsPanning(true)
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current
            if (!drag || drag.pointerId !== event.pointerId) return
            event.preventDefault()
            setCityPan(clampPan({
              x: drag.origin.x + event.clientX - drag.startX,
              y: drag.origin.y + event.clientY - drag.startY,
            }))
          }}
          onPointerUp={(event) => stopPanning(event.pointerId)}
          ref={cityCanvasRef}
        >
          <CityScene
            buildingEffects={displayedBuildingEffects}
            buildingLevels={displayedBuildingLevels}
            buildingTransitions={buildingTransitions}
            buildingPlacementOverrides={displayedPlacementOverrides}
            cityLevel={displayedCityLevel}
            sceneProfileId={displayedSceneProfile.id}
          />
          <div
            className="city-stage__scene-overlays"
            style={{
              left: cityContentFrame.left,
              top: cityContentFrame.top,
              width: cityContentFrame.width,
              height: cityContentFrame.height,
            }}
          >
            <div className="city-stage__building-effects" aria-hidden="true">
              {BUILDING_IMPACT_ITEMS.map((building) => {
                const summary = locationImpacts?.[building.id]
                if (!summary || summary.participantCount === 0 || summary.scoreAverage === 0) return null
                const effect = BUILDING_EFFECT_POSITIONS[building.id]
                const sceneEffect = alignPointToDisplayedScene(building.id, effect)
                const buildingId = LOCATION_BUILDING[building.id]
                const model = resolveBuildingAsset(buildingId, displayedBuildingLevels[buildingId])
                const modelPlacement = model
                  ? resolveBuildingAssetPlacement(buildingId, model.level)
                  : { x: 0, y: 0 }
                if (model) return null
                return (
                  <span
                    className={`city-stage__building-effect ${summary.scoreAverage > 0 ? 'is-integrity' : 'is-corruption'}`}
                    data-effect-building={building.id}
                    key={building.id}
                    style={{
                      '--building-effect-x': `${sceneEffect.x + modelPlacement.x / CITY_STAGE_WIDTH * 100}%`,
                      '--building-effect-y': `${sceneEffect.y + modelPlacement.y / CITY_STAGE_HEIGHT * 100}%`,
                      '--building-effect-size': `${effect.size}%`,
                    } as React.CSSProperties}
                  >
                    <i />
                  </span>
                )
              })}
            </div>
            <div className="city-stage__building-labels">
              {BUILDING_IMPACT_ITEMS.map((building) => {
                const labelPosition = alignPointToDisplayedScene(building.id, BUILDING_LABEL_POSITIONS[building.id])
                return (
                  <button
                  aria-label={`ดูประวัติคะแนน${building.label}`}
                  aria-pressed={selectedBuildingId === building.id}
                  className={selectedBuildingId === building.id ? 'is-selected' : ''}
                  key={building.id}
                  onClick={() => setSelectedBuildingId((current) => current === building.id ? null : building.id)}
                  onPointerDown={(event) => event.stopPropagation()}
                  style={{
                    '--building-label-x': `${labelPosition.x}%`,
                    '--building-label-y': `${labelPosition.y}%`,
                  } as React.CSSProperties}
                  type="button"
                >
                  <i>{building.icon}</i>{building.label}
                  <small aria-hidden="true">ดูข้อมูล</small>
                  </button>
                )
              })}
            </div>
            {isLayoutMode ? (
              <div className="city-layout-handles" aria-label="จุดลากปรับตำแหน่งอาคาร">
                {BUILDING_IMPACT_ITEMS.map((building) => {
                  const buildingId = LOCATION_BUILDING[building.id]
                  const handlePosition = alignPointToDisplayedScene(building.id, BUILDING_EFFECT_POSITIONS[building.id])
                  return (
                    <button
                      aria-label={`ลากปรับตำแหน่ง${building.label}`}
                      className={layoutSelectedBuilding === buildingId ? 'is-selected' : ''}
                      key={buildingId}
                      onClick={(event) => {
                        event.stopPropagation()
                        setLayoutSelectedBuilding(buildingId)
                      }}
                      onKeyDown={(event) => {
                        const step = event.shiftKey ? .25 : 1
                        const movement = {
                          ArrowLeft: [-step, 0],
                          ArrowRight: [step, 0],
                          ArrowUp: [0, -step],
                          ArrowDown: [0, step],
                        }[event.key]
                        if (!movement) return
                        event.preventDefault()
                        event.stopPropagation()
                        nudgeLayoutBuilding(buildingId, movement[0], movement[1])
                      }}
                      onPointerCancel={(event) => stopLayoutDrag(event.pointerId)}
                      onPointerDown={(event) => startLayoutDrag(event, buildingId)}
                      onPointerMove={moveLayoutBuilding}
                      onPointerUp={(event) => stopLayoutDrag(event.pointerId)}
                      style={{
                        '--layout-handle-x': `${handlePosition.x}%`,
                        '--layout-handle-y': `${handlePosition.y}%`,
                      } as React.CSSProperties}
                      type="button"
                    >
                      <span>{building.icon}</span>
                      <small>{building.label}</small>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        </figure>
        {selectedBuilding && selectedBuildingId && selectedBuildingAnchor ? (
          <aside
            className={`city-stage__building-detail${selectedBuildingAnchor.x >= canvasWidth * .7 ? ' is-edge-right' : selectedBuildingAnchor.x <= canvasWidth * .3 ? ' is-edge-left' : ''}${selectedBuildingAnchor.y >= canvasHeight * .5 ? ' is-above' : ''}`}
            onPointerDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="false"
            aria-labelledby="building-detail-title"
            style={{
              '--building-detail-x': `${selectedBuildingAnchor.x}px`,
              '--building-detail-y': `${selectedBuildingAnchor.y}px`,
            } as React.CSSProperties}
          >
            <header>
              <span aria-hidden="true">{selectedBuilding.icon}</span>
              <div>
                <small>ประวัติคะแนนอาคาร</small>
                <h2 id="building-detail-title">{selectedBuilding.label}</h2>
              </div>
              <button aria-label="ปิดรายละเอียดอาคาร" onClick={() => setSelectedBuildingId(null)} type="button">×</button>
            </header>
            <div className="city-stage__building-detail-summary">
              <div><span>คะแนนล่าสุด</span><strong className={(locationImpacts?.[selectedBuildingId].scoreAverage ?? 0) >= 0 ? 'is-positive' : 'is-negative'}>{signed(locationImpacts?.[selectedBuildingId].scoreAverage ?? 0)}</strong></div>
              <div><span>เฉลี่ยสะสม</span><strong className={selectedAverage >= 0 ? 'is-positive' : 'is-negative'}>{signed(selectedAverage)}</strong></div>
              <div><span>ผู้เล่นที่ส่งผลต่ออาคาร</span><strong>{selectedTotals.participants} คน</strong></div>
            </div>
            <div className="city-stage__building-detail-counts">
              <span>สุจริต <b>{selectedTotals.integrity}</b></span>
              <span>ทุจริต <b>{selectedTotals.corruption}</b></span>
              <span>ไม่ตอบ <b>{selectedTotals.timeout}</b></span>
            </div>
            <section className="city-stage__building-history" aria-label={`คะแนน${selectedBuilding.label}รายข้อ`}>
              <h3>ประวัติคะแนนแต่ละข้อ</h3>
              {selectedHistory.length > 0 ? (
                <div>
                  {selectedHistory.map((summary) => (
                    <article key={summary.questionNumber}>
                      <span>ข้อ {summary.questionNumber}</span>
                      <div><i className={summary.scoreAverage >= 0 ? 'is-positive' : 'is-negative'} style={{ width: `${Math.min(100, Math.abs(summary.scoreAverage))}%` }} /></div>
                      <strong className={summary.scoreAverage >= 0 ? 'is-positive' : 'is-negative'}>{signed(summary.scoreAverage)}</strong>
                    </article>
                  ))}
                </div>
              ) : <p>ยังไม่มีผลคะแนนของอาคารนี้</p>}
            </section>
          </aside>
        ) : null}
        {utilityControls ? <div className="city-stage__utility-controls">{utilityControls}</div> : null}
        <div className="city-stage__zoom-tools" role="group" aria-label="ปรับขนาดภาพเมือง">
          <button
            aria-label="ซูมภาพเมืองออก"
            disabled={cityZoom <= CITY_ZOOM_MIN}
            onClick={() => setCityZoom((currentZoom) => clampCityZoom(currentZoom - CITY_ZOOM_STEP))}
            title="ซูมออกเพื่อดูขอบภาพให้ครบ"
            type="button"
          >
            −
          </button>
          <output aria-live="polite">{cityZoom}%</output>
          <button
            aria-label="ซูมภาพเมืองเข้า"
            disabled={cityZoom >= CITY_ZOOM_MAX}
            onClick={() => setCityZoom((currentZoom) => clampCityZoom(currentZoom + CITY_ZOOM_STEP))}
            title="ซูมเข้าเพื่อดูรายละเอียด"
            type="button"
          >
            +
          </button>
          <button
            className="city-stage__zoom-fit"
            disabled={cityZoom === 100 && cityPan.x === 0 && cityPan.y === 0}
            onClick={resetCityView}
            title="คืนภาพให้พอดีจอและเห็นขอบภาพครบ"
            type="button"
          >
            พอดีจอ
          </button>
          <FullscreenToggle className="city-stage__zoom-fit" />
        </div>
        {room.status === 'round-result' && roundImpact !== null && roundImpact !== undefined ? (
          <div className={`city-stage__round-impact ${roundImpact >= 0 ? 'is-positive' : 'is-negative'}`} aria-live="polite">
            ผลกระทบข้อนี้ <strong>{signed(roundImpact)}</strong>
          </div>
        ) : null}
        <section className="city-stage__vote-overlay" aria-label="ผลโหวตล่าสุด">
          <h2>ผลโหวตล่าสุด</h2>
          <dl className="city-stage__vote-list">
            <div><dt><span aria-hidden="true">👍</span> ตอบแล้ว</dt><dd>{Math.round(answerProgress)}%</dd></div>
            <div><dt><span aria-hidden="true">⏳</span> กำลังตัดสินใจ</dt><dd>{Math.max(0, room.lockedPlayerCount - answerCount)} คน</dd></div>
            <div><dt><span aria-hidden="true">👥</span> ผู้เล่นทั้งหมด</dt><dd>{room.lockedPlayerCount} คน</dd></div>
          </dl>
        </section>
        <section className="city-stage__results" aria-live="polite">{children}</section>
        {isLayoutMode ? createPortal((
          <aside
            className="city-layout-panel"
            onPointerDown={(event) => event.stopPropagation()}
            aria-label="เครื่องมือปรับตำแหน่งฉากเมือง"
          >
            <header>
              <div>
                <small>SCENE CALIBRATION</small>
                <strong>จัดตำแหน่งโมเดล</strong>
              </div>
              <button
                aria-label="ปิดโหมดจัดตำแหน่ง"
                onClick={() => {
                  const url = new URL(window.location.href)
                  url.searchParams.delete('layout')
                  window.location.assign(url.toString())
                }}
                type="button"
              >×</button>
            </header>

            <div className="city-layout-panel__selectors">
              <label>
                <span>ฉาก</span>
                <select
                  onChange={(event) => {
                    setLayoutSceneId(event.target.value as CitySceneProfileId)
                    setLayoutFeedback('เปลี่ยนฉากสำหรับปรับตำแหน่งแล้ว')
                  }}
                  value={layoutSceneId}
                >
                  {(Object.keys(LAYOUT_SCENE_LABELS) as CitySceneProfileId[]).map((sceneId) => (
                    <option key={sceneId} value={sceneId}>{LAYOUT_SCENE_LABELS[sceneId]}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>โมเดลทดสอบ</span>
                <select
                  onChange={(event) => setLayoutModelLevel(Number(event.target.value) as BuildingLevel)}
                  value={layoutModelLevel}
                >
                  <option value={0}>Lv.0 ปกติ</option>
                  <option value={1}>Lv.1 ดีขึ้น</option>
                  <option value={2}>Lv.2 ดี</option>
                  <option value={-1}>Lv.-1 โทรม</option>
                  <option value={-2}>Lv.-2 พังมาก</option>
                </select>
              </label>
            </div>

            <dl
              aria-label="สถานะการปรับตำแหน่งปัจจุบัน"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '.2rem .5rem',
                margin: 0,
                padding: '.4rem .5rem',
                borderRadius: '.5rem',
                background: selectedLayoutSource === 'override' ? '#eafbf1' : '#fff7e8',
                color: '#4a5a68',
                fontSize: '.5rem',
                lineHeight: 1.4,
              }}
            >
              <div><dt style={{ display: 'inline', fontWeight: 700 }}>ฉาก: </dt><dd style={{ display: 'inline', margin: 0 }}>{LAYOUT_SCENE_LABELS[layoutSceneId]}</dd></div>
              <div><dt style={{ display: 'inline', fontWeight: 700 }}>อาคาร: </dt><dd style={{ display: 'inline', margin: 0 }}>{LAYOUT_BUILDING_LABELS[layoutSelectedBuilding]}</dd></div>
              <div><dt style={{ display: 'inline', fontWeight: 700 }}>โมเดล: </dt><dd style={{ display: 'inline', margin: 0 }}>Lv.{layoutModelLevel > 0 ? `+${layoutModelLevel}` : layoutModelLevel}</dd></div>
              <div>
                <dt style={{ display: 'inline', fontWeight: 700 }}>แหล่งค่า: </dt>
                <dd style={{ display: 'inline', margin: 0, color: selectedLayoutSource === 'override' ? '#267651' : '#a5680f' }}>
                  {selectedLayoutSource === 'override' ? 'ค่าที่ปรับเอง (บันทึกไว้)' : 'ค่าเริ่มต้น/สำรอง (ยังไม่ได้ปรับ)'}
                </dd>
              </div>
            </dl>

            <div className="city-layout-panel__buildings" aria-label="เลือกอาคาร">
              {BUILDING_IDS.map((buildingId) => (
                <button
                  className={layoutSelectedBuilding === buildingId ? 'is-selected' : ''}
                  key={buildingId}
                  onClick={() => setLayoutSelectedBuilding(buildingId)}
                  type="button"
                >{LAYOUT_BUILDING_LABELS[buildingId]}</button>
              ))}
            </div>

            <p className="city-layout-panel__hint">ลากหมุดบนตึก หรือกดลูกศรเพื่อขยับ 1px · Shift + ลูกศร = 0.25px</p>

            <div className="city-layout-panel__values">
              {(['x', 'y', 'scaleX', 'scaleY'] as const).map((field) => (
                <label key={field}>
                  <span>{field}</span>
                  <input
                    inputMode="decimal"
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      if (Number.isFinite(value)) updateLayoutPlacement(layoutSelectedBuilding, { [field]: value })
                    }}
                    step={field === 'x' || field === 'y' ? .25 : .001}
                    type="number"
                    value={Math.round(selectedLayoutPlacement[field] * 1000) / 1000}
                  />
                </label>
              ))}
            </div>

            <div className="city-layout-panel__nudge" aria-label="ขยับอาคารทีละหนึ่งพิกเซล">
              <button onClick={() => nudgeLayoutBuilding(layoutSelectedBuilding, 0, -1)} type="button">↑</button>
              <button onClick={() => nudgeLayoutBuilding(layoutSelectedBuilding, -1, 0)} type="button">←</button>
              <button onClick={() => nudgeLayoutBuilding(layoutSelectedBuilding, 1, 0)} type="button">→</button>
              <button onClick={() => nudgeLayoutBuilding(layoutSelectedBuilding, 0, 1)} type="button">↓</button>
            </div>

            <div className="city-layout-panel__actions">
              <button onClick={() => resetLayoutBuilding(layoutSelectedBuilding)} type="button">คืนค่าตึกนี้ (Lv. ปัจจุบัน)</button>
              <button onClick={resetLayoutScene} type="button">คืนค่าทั้งฉาก (ทุกตึก ทุกโมเดล)</button>
              <button className="is-primary" onClick={() => void copyLayoutJson()} type="button">คัดลอก JSON</button>
              {/* Temporary recovery export: full 105-combination effective placement dump, read-only, no storage writes. */}
              <button
                onClick={() => void copyAllEffectivePlacements()}
                style={{ gridColumn: '1 / -1' }}
                type="button"
              >คัดลอกค่าตำแหน่งทั้งหมด</button>
            </div>
            <output className="city-layout-panel__feedback" aria-live="polite">{layoutFeedback}</output>
          </aside>
        ), document.body) : null}
        <div className="city-stage__atmosphere" aria-hidden="true">
          <CityCloudsAnimation />
          <CityBirdsAnimation />
        </div>
      </div>

      <aside className="city-stage__side-panel" aria-label="ข้อมูลและการควบคุมคำถาม">
        <section className="city-stage__right-card city-stage__status-card">
          <h2>สถานะเมือง</h2>
          <div className="city-stage__status-summary">
            <span className="city-stage__status-gauge" aria-hidden="true">{CITY_LEVEL_EMOJI[displayedCityLevel]}</span>
            <div><strong>{formatCityLevel(displayedCityLevel)}</strong><small>{CITY_LEVEL_PROGRESS[displayedCityLevel]}%</small></div>
          </div>
          <div className="city-stage__status-progress"><i style={{ width: `${CITY_LEVEL_PROGRESS[displayedCityLevel]}%` }} /></div>
          <p>เส้นทางสู่เมืองโปร่งใส <span aria-hidden="true">⚑</span></p>
        </section>
        <section className="city-stage__right-card city-stage__building-activity" aria-label="ผลกระทบล่าสุดของแต่ละอาคาร">
          <h2>ผลกระทบอาคารล่าสุด</h2>
          <p>{locationImpacts ? `ผลจากข้อที่ ${Math.max(1, room.status === 'round-result' ? room.currentQuestionNumber : room.currentQuestionNumber - 1)}` : 'รอผลจากข้อแรก'}</p>
          <div>
            {BUILDING_IMPACT_ITEMS.map((building) => {
              const score = locationImpacts?.[building.id].scoreAverage ?? 0
              const tone = score > 0 ? 'is-positive' : score < 0 ? 'is-negative' : 'is-neutral'
              return (
                <article className={tone} key={building.id}>
                  <span className="city-stage__building-icon" aria-hidden="true">{building.icon}</span>
                  <strong>{building.label}</strong>
                  <output>{signed(score)}</output>
                  <span className="city-stage__building-mood" aria-hidden="true">{score > 0 ? '😊' : score < 0 ? '😟' : '😐'}</span>
                </article>
              )
            })}
          </div>
        </section>
      </aside>

      <footer className="city-stage__dock">
        <div className="city-stage__message" aria-live="polite">
          <span className="city-stage__message-emoji" aria-hidden="true">{CITY_LEVEL_EMOJI[displayedCityLevel]}</span>
          <div className="city-stage__message-copy">
            <strong>{formatCityLevel(displayedCityLevel)}</strong>
            <p>{CITY_LEVEL_MESSAGES[displayedCityLevel]}</p>
          </div>
          {room.status === 'playing' ? (
            <div className="city-stage__answer-progress" aria-label={`ตอบแล้ว ${answerCount} จาก ${room.lockedPlayerCount} คน`}>
              <span>กำลังรับคำตอบ</span>
              <div><i style={{ width: `${answerProgress}%` }} /></div>
            </div>
          ) : null}
        </div>
        {controls ? <div className="city-stage__controls">{controls}</div> : null}
      </footer>
    </main>
  )
}
