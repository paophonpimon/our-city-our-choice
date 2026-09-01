import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ClassroomRoom, ClassroomRoundResult } from '../types/classroomGame'
import { formatCityLevel } from '../domain/ourCity'
import type { LocationId, LocationSummary } from '../domain/cityScoring'
import { CityScene } from './CityScene'
import { resolveBuildingLabelTone, type BuildingLevelDisplayTransition } from '../domain/cityPresentation'
import {
  BUILDING_IDS,
  CITY_SCENE_PROFILES,
  CITY_STAGE_HEIGHT,
  CITY_STAGE_WIDTH,
  LOCATION_BUILDING,
  normalizeBuildingLevels,
  resolveCitySceneProfile,
  type BuildingId,
  type BuildingLevels,
  type BuildingLevel,
  type CitySceneBuildingPlacement,
  type CitySceneBuildingLabelPlacement,
  type CitySceneProfileId,
} from '../domain/cityBuildings'
import { CityBirdsAnimation } from './CityBirdsAnimation'
import { CityCloudsAnimation } from './CityCloudsAnimation'
import { FullscreenToggle } from './FullscreenToggle'
import {
  ALL_BUILDING_LEVELS,
  cityLayoutDraftId,
  cityLayoutLabelDraftId,
  labelOverridesToDraftRecords,
  overridesToDraftRecords,
  resolveEffectivePlacement,
  resolveLayoutEditorPlacement,
  resolveProductionPlacement,
  type CityLayoutLabelDraftRecord,
  type CityLayoutModelDraftRecord,
  type SceneLayoutOverrides,
} from '../domain/cityLayoutOverrides'
import { useCityLayoutManager } from '../hooks/useCityLayoutManager'
import { calculateCumulativeBuildingImpact } from './buildingImpactDisplay'
import { LiveAnswerImpacts } from './LiveAnswerImpacts'
import type { LiveAnswerImpact } from '../domain/liveAnswerImpact'

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

const BUILDING_MODEL_FOCUS_POSITIONS: Record<LocationId, { x: number; y: number }> = {
  school: { x: 31, y: 24 },
  construction: { x: 61, y: 22 },
  market: { x: 86, y: 35 },
  hospital: { x: 31, y: 54 },
  'police-station': { x: 68, y: 54 },
  'municipal-office': { x: 54, y: 74 },
  'news-office': { x: 82, y: 75 },
}

interface CityStageProps {
  room: ClassroomRoom
  layoutMode?: boolean
  onExitLayoutMode?: () => void
  visualCityLevel?: ClassroomRoom['cityLevel']
  visualBuildingLevels?: BuildingLevels
  buildingLevelDisplayTransitions?: Partial<Record<BuildingId, BuildingLevelDisplayTransition>>
  liveAnswerImpacts?: readonly LiveAnswerImpact[]
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

interface LabelLayoutDragState {
  buildingId: BuildingId
  pointerId: number
  startClientX: number
  startClientY: number
  startPlacement: CitySceneBuildingLabelPlacement
}

type LayoutCalibrationTarget = 'model' | 'label'

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

export const CityStage = ({ room, layoutMode, onExitLayoutMode, visualCityLevel, visualBuildingLevels, buildingLevelDisplayTransitions, liveAnswerImpacts = [], remainingSeconds, answerCount, previewCityScore, roundImpact, locationImpacts, roundHistory = [], controls, utilityControls, children }: CityStageProps) => {
  const scoreTarget = previewCityScore ?? room.cityScore
  const previousScore = useRef(scoreTarget)
  const cityCanvasRef = useRef<HTMLElement | null>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origin: CityPan } | null>(null)
  const layoutDragRef = useRef<LayoutDragState | null>(null)
  const labelLayoutDragRef = useRef<LabelLayoutDragState | null>(null)
  const [displayScore, setDisplayScore] = useState(scoreTarget)
  const [cityZoom, setCityZoom] = useState(readStoredCityZoom)
  const [cityPan, setCityPan] = useState<CityPan>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [selectedBuildingId, setSelectedBuildingId] = useState<LocationId | null>(null)
  const [cityContentFrame, setCityContentFrame] = useState<CityContentFrame>(EMPTY_CITY_CONTENT_FRAME)
  const isLayoutMode = layoutMode ?? (typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('layout') === '1')
  const layoutManager = useCityLayoutManager(isLayoutMode)
  const [layoutSceneId, setLayoutSceneId] = useState<CitySceneProfileId>(() =>
    resolveCitySceneProfile(visualCityLevel ?? room.cityLevel).id)
  const [layoutModelLevel, setLayoutModelLevel] = useState<BuildingLevel>(0)
  const [layoutSelectedBuilding, setLayoutSelectedBuilding] = useState<BuildingId>('school')
  const [layoutCalibrationTarget, setLayoutCalibrationTarget] = useState<LayoutCalibrationTarget>('model')
  const [publishReviewed, setPublishReviewed] = useState(false)
  const displayedCityLevel = visualCityLevel ?? room.cityLevel
  const displayedSceneProfile = isLayoutMode
    ? CITY_SCENE_PROFILES[layoutSceneId]
    : resolveCitySceneProfile(displayedCityLevel)
  const displayedPlacementOverrides = useMemo<SceneLayoutOverrides | undefined>(() => {
    if (!isLayoutMode) return undefined
    return Object.fromEntries(BUILDING_IDS.map((building) => [
      building,
      Object.fromEntries(ALL_BUILDING_LEVELS.map((level) => {
        const resolved = resolveLayoutEditorPlacement(
          layoutManager.draft,
          layoutManager.publishedLayout,
          displayedSceneProfile.id,
          building,
          level,
        )
        return [level, { x: resolved.x, y: resolved.y, scaleX: resolved.scaleX, scaleY: resolved.scaleY }]
      })),
    ])) as SceneLayoutOverrides
  }, [displayedSceneProfile.id, isLayoutMode, layoutManager.draft, layoutManager.publishedLayout])
  const displayedBuildingLevels = isLayoutMode
    ? Object.fromEntries(BUILDING_IDS.map((buildingId) => [buildingId, layoutModelLevel])) as BuildingLevels
    : normalizeBuildingLevels(visualBuildingLevels ?? room.buildingLevels)
  const alignPointToDisplayedScene = (locationId: LocationId, point: { x: number; y: number }) => {
    const buildingId = LOCATION_BUILDING[locationId]
    const placement = isLayoutMode
      ? resolveEffectivePlacement(displayedPlacementOverrides, displayedSceneProfile.id, buildingId, displayedBuildingLevels[buildingId])
      : resolveProductionPlacement(layoutManager.publishedLayout, displayedSceneProfile.id, buildingId, displayedBuildingLevels[buildingId])
    return {
      x: (placement.x + point.x / 100 * CITY_STAGE_WIDTH * placement.scaleX) / CITY_STAGE_WIDTH * 100,
      y: (placement.y + point.y / 100 * CITY_STAGE_HEIGHT * placement.scaleY) / CITY_STAGE_HEIGHT * 100,
    }
  }
  const getDisplayedLabelPosition = (locationId: LocationId): { x: number; y: number } => {
    const buildingId = LOCATION_BUILDING[locationId]
    const resolved = resolveLayoutEditorPlacement(
      layoutManager.draft,
      layoutManager.publishedLayout,
      displayedSceneProfile.id,
      buildingId,
      displayedBuildingLevels[buildingId],
      layoutManager.labelDraft,
    )
    return {
      x: resolved.labelX / CITY_STAGE_WIDTH * 100,
      y: resolved.labelY / CITY_STAGE_HEIGHT * 100,
    }
  }
  const displayedLabelPositions = Object.fromEntries(
    BUILDING_IMPACT_ITEMS.map((building) => [building.id, getDisplayedLabelPosition(building.id)]),
  ) as Record<LocationId, { x: number; y: number }>
  const cumulativeBuildingImpacts = Object.fromEntries(
    BUILDING_IMPACT_ITEMS.map((building) => [building.id, calculateCumulativeBuildingImpact({
      currentGameCycle: room.gameCycle,
      currentQuestionNumber: room.currentQuestionNumber,
      currentLocationImpacts: locationImpacts,
      locationId: building.id,
      roundHistory,
    })]),
  ) as Record<LocationId, number>
  const selectedBuilding = BUILDING_IMPACT_ITEMS.find((building) => building.id === selectedBuildingId) ?? null
  const selectedBuildingPosition = selectedBuildingId
    ? displayedLabelPositions[selectedBuildingId]
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
  const getEffectiveLayoutPlacement = (buildingId: BuildingId): CitySceneBuildingPlacement => {
    const resolved = resolveLayoutEditorPlacement(
      layoutManager.draft,
      layoutManager.publishedLayout,
      layoutSceneId,
      buildingId,
      layoutModelLevel,
    )
    return { x: resolved.x, y: resolved.y, scaleX: resolved.scaleX, scaleY: resolved.scaleY }
  }

  const getEffectiveLabelLayoutPlacement = (buildingId: BuildingId): CitySceneBuildingLabelPlacement => {
    const resolved = resolveLayoutEditorPlacement(
      layoutManager.draft,
      layoutManager.publishedLayout,
      layoutSceneId,
      buildingId,
      layoutModelLevel,
      layoutManager.labelDraft,
    )
    return { labelX: resolved.labelX, labelY: resolved.labelY }
  }

  const updateLayoutPlacement = (
    buildingId: BuildingId,
    update: Partial<CitySceneBuildingPlacement> | ((current: CitySceneBuildingPlacement) => CitySceneBuildingPlacement),
  ): void => {
    const currentPlacement = getEffectiveLayoutPlacement(buildingId)
    const nextPlacement = typeof update === 'function'
      ? update(currentPlacement)
      : { ...currentPlacement, ...update }
    layoutManager.saveDraft([{
      scene: layoutSceneId,
      building: buildingId,
      level: layoutModelLevel,
      ...nextPlacement,
      updatedAt: Date.now(),
    }])
    setPublishReviewed(false)
  }

  // Only clears this scene + building + model level. Every other level (and
  // every other scene) this building has been calibrated for is untouched.
  const resetLayoutBuilding = (buildingId: BuildingId): void => {
    void layoutManager.deleteDraft([cityLayoutDraftId(layoutSceneId, buildingId, layoutModelLevel)])
    setPublishReviewed(false)
  }

  const updateLabelLayoutPlacement = (
    buildingId: BuildingId,
    update: Partial<CitySceneBuildingLabelPlacement>
      | ((current: CitySceneBuildingLabelPlacement) => CitySceneBuildingLabelPlacement),
  ): void => {
    const currentPlacement = getEffectiveLabelLayoutPlacement(buildingId)
    const nextPlacement = typeof update === 'function'
      ? update(currentPlacement)
      : { ...currentPlacement, ...update }
    layoutManager.saveDraft([{
      scene: layoutSceneId,
      building: buildingId,
      level: layoutModelLevel,
      ...nextPlacement,
      updatedAt: Date.now(),
    }])
    setPublishReviewed(false)
  }

  const resetLayoutLabel = (buildingId: BuildingId): void => {
    void layoutManager.deleteDraft([cityLayoutLabelDraftId(layoutSceneId, buildingId, layoutModelLevel)])
    setPublishReviewed(false)
  }

  const clearAllDraft = (): void => {
    const confirmed = window.confirm(
      'ยกเลิก Draft ทั้งหมด 105 จุดใช่ไหม? Published ที่ใช้งานจริงจะไม่เปลี่ยนแปลง',
    )
    if (!confirmed) return
    void layoutManager.deleteDraft(overridesToDraftRecords(layoutManager.draft).map((record) =>
      cityLayoutDraftId(record.scene, record.building, record.level)).concat(
        labelOverridesToDraftRecords(layoutManager.labelDraft).map((record) =>
          cityLayoutLabelDraftId(record.scene, record.building, record.level)),
      ))
    setPublishReviewed(false)
  }

  const copyPlacementToLevels = (): void => {
    if (!window.confirm(`ใช้ตำแหน่ง ${LAYOUT_BUILDING_LABELS[layoutSelectedBuilding]} นี้กับทั้ง 5 ระดับในฉาก${LAYOUT_SCENE_LABELS[layoutSceneId]}ใช่ไหม?`)) return
    const placement = getEffectiveLayoutPlacement(layoutSelectedBuilding)
    layoutManager.saveDraft(ALL_BUILDING_LEVELS.map((level): CityLayoutModelDraftRecord => ({
      scene: layoutSceneId,
      building: layoutSelectedBuilding,
      level,
      ...placement,
      updatedAt: Date.now(),
    })))
    setPublishReviewed(false)
  }

  const copyPlacementToScenes = (): void => {
    if (!window.confirm(`ใช้ตำแหน่ง ${LAYOUT_BUILDING_LABELS[layoutSelectedBuilding]} Lv.${layoutModelLevel} นี้กับทั้ง 3 ฉากใช่ไหม?`)) return
    const placement = getEffectiveLayoutPlacement(layoutSelectedBuilding)
    layoutManager.saveDraft((Object.keys(LAYOUT_SCENE_LABELS) as CitySceneProfileId[]).map((scene): CityLayoutModelDraftRecord => ({
      scene,
      building: layoutSelectedBuilding,
      level: layoutModelLevel,
      ...placement,
      updatedAt: Date.now(),
    })))
    setPublishReviewed(false)
  }

  const copyLabelPlacementToLevels = (): void => {
    if (!window.confirm(`ใช้ตำแหน่งป้าย ${LAYOUT_BUILDING_LABELS[layoutSelectedBuilding]} นี้กับทั้ง 5 ระดับในฉาก${LAYOUT_SCENE_LABELS[layoutSceneId]}ใช่ไหม?`)) return
    const placement = getEffectiveLabelLayoutPlacement(layoutSelectedBuilding)
    layoutManager.saveDraft(ALL_BUILDING_LEVELS.map((level): CityLayoutLabelDraftRecord => ({
      scene: layoutSceneId,
      building: layoutSelectedBuilding,
      level,
      ...placement,
      updatedAt: Date.now(),
    })))
    setPublishReviewed(false)
  }

  const copyLabelPlacementToScenes = (): void => {
    if (!window.confirm(`ใช้ตำแหน่งป้าย ${LAYOUT_BUILDING_LABELS[layoutSelectedBuilding]} Lv.${layoutModelLevel} นี้กับทั้ง 3 ฉากใช่ไหม?`)) return
    const placement = getEffectiveLabelLayoutPlacement(layoutSelectedBuilding)
    layoutManager.saveDraft((Object.keys(LAYOUT_SCENE_LABELS) as CitySceneProfileId[]).map((scene): CityLayoutLabelDraftRecord => ({
      scene,
      building: layoutSelectedBuilding,
      level: layoutModelLevel,
      ...placement,
      updatedAt: Date.now(),
    })))
    setPublishReviewed(false)
  }

  const copyLabelPlacementEverywhere = (): void => {
    if (!window.confirm(`ใช้ตำแหน่งป้าย ${LAYOUT_BUILDING_LABELS[layoutSelectedBuilding]} นี้กับทุกระดับและทุกฉากรวม 15 จุดใช่ไหม? การทำงานนี้เปลี่ยนเฉพาะตำแหน่งป้าย`)) return
    const placement = getEffectiveLabelLayoutPlacement(layoutSelectedBuilding)
    layoutManager.saveDraft((Object.keys(LAYOUT_SCENE_LABELS) as CitySceneProfileId[]).flatMap((scene) =>
      ALL_BUILDING_LEVELS.map((level): CityLayoutLabelDraftRecord => ({
        scene,
        building: layoutSelectedBuilding,
        level,
        ...placement,
        updatedAt: Date.now(),
      }))))
    setPublishReviewed(false)
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

  const startLabelLayoutDrag = (event: React.PointerEvent<HTMLButtonElement>, buildingId: BuildingId): void => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setLayoutSelectedBuilding(buildingId)
    labelLayoutDragRef.current = {
      buildingId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPlacement: { ...getEffectiveLabelLayoutPlacement(buildingId) },
    }
  }

  const moveLayoutLabel = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const drag = labelLayoutDragRef.current
    const canvas = cityCanvasRef.current
    if (!drag || drag.pointerId !== event.pointerId || !canvas) return
    event.preventDefault()
    event.stopPropagation()
    const bounds = canvas.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    updateLabelLayoutPlacement(drag.buildingId, {
      labelX: Math.round((drag.startPlacement.labelX + (event.clientX - drag.startClientX) / bounds.width * CITY_STAGE_WIDTH) * 100) / 100,
      labelY: Math.round((drag.startPlacement.labelY + (event.clientY - drag.startClientY) / bounds.height * CITY_STAGE_HEIGHT) * 100) / 100,
    })
  }

  const stopLabelLayoutDrag = (pointerId: number): void => {
    if (labelLayoutDragRef.current?.pointerId === pointerId) labelLayoutDragRef.current = null
  }

  const nudgeLayoutBuilding = (buildingId: BuildingId, x: number, y: number): void => {
    updateLayoutPlacement(buildingId, (current) => ({
      ...current,
      x: Math.round((current.x + x) * 100) / 100,
      y: Math.round((current.y + y) * 100) / 100,
    }))
  }

  const nudgeLayoutLabel = (buildingId: BuildingId, x: number, y: number): void => {
    updateLabelLayoutPlacement(buildingId, (current) => ({
      labelX: Math.round((current.labelX + x) * 100) / 100,
      labelY: Math.round((current.labelY + y) * 100) / 100,
    }))
  }

  const selectedLayoutPlacement = getEffectiveLayoutPlacement(layoutSelectedBuilding)
  const selectedLabelLayoutPlacement = getEffectiveLabelLayoutPlacement(layoutSelectedBuilding)
  const selectedLayoutResolution = resolveLayoutEditorPlacement(
    layoutManager.draft,
    layoutManager.publishedLayout,
    layoutSceneId,
    layoutSelectedBuilding,
    layoutModelLevel,
    layoutManager.labelDraft,
  )
  const selectedLayoutSource = layoutCalibrationTarget === 'model'
    ? selectedLayoutResolution.source
    : selectedLayoutResolution.labelSource

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
            buildingLevels={displayedBuildingLevels}
            buildingLevelTransitions={buildingLevelDisplayTransitions}
            buildingPlacementOverrides={displayedPlacementOverrides}
            cityLevel={displayedCityLevel}
            sceneProfileId={displayedSceneProfile.id}
          />
          {layoutManager.publishedReady ? <div
            className="city-stage__scene-overlays"
            style={{
              left: cityContentFrame.left,
              top: cityContentFrame.top,
              width: cityContentFrame.width,
              height: cityContentFrame.height,
            }}
          >
            <div className="city-stage__building-labels">
              {BUILDING_IMPACT_ITEMS.map((building) => {
                const labelPosition = displayedLabelPositions[building.id]
                const buildingId = LOCATION_BUILDING[building.id]
                const displayedLevel = displayedBuildingLevels[buildingId]
                const levelTransition = buildingLevelDisplayTransitions?.[buildingId] ?? {
                  previousLevel: displayedLevel,
                  currentLevel: displayedLevel,
                  changeDirection: 'same' as const,
                }
                const directionLabel = levelTransition.changeDirection === 'up'
                  ? 'เพิ่มเป็น'
                  : levelTransition.changeDirection === 'down'
                    ? 'ลดเป็น'
                    : 'คงที่'
                const levelLabel = levelTransition.changeDirection === 'same'
                  ? `Lv.${levelTransition.currentLevel} ${directionLabel}`
                  : `Lv.${levelTransition.previousLevel} ${directionLabel} Lv.${levelTransition.currentLevel}`
                const labelTone = resolveBuildingLabelTone(levelTransition.currentLevel)
                return (
                  <button
                  aria-label={`ดูประวัติคะแนน${building.label} ${levelLabel}`}
                  aria-pressed={selectedBuildingId === building.id}
                  className={`is-level-${labelTone} is-change-${levelTransition.changeDirection}${selectedBuildingId === building.id ? ' is-selected' : ''}${isLayoutMode && layoutCalibrationTarget === 'label' && layoutManager.canEdit && !layoutManager.busy ? ' is-label-editing' : ''}${isLayoutMode && layoutCalibrationTarget === 'label' && layoutSelectedBuilding === buildingId ? ' is-layout-selected' : ''}`}
                  data-building-label-level={levelTransition.currentLevel}
                  key={building.id}
                  onClick={() => {
                    if (isLayoutMode && layoutCalibrationTarget === 'label') {
                      setLayoutSelectedBuilding(buildingId)
                      return
                    }
                    setSelectedBuildingId((current) => current === building.id ? null : building.id)
                  }}
                  onLostPointerCapture={(event) => stopLabelLayoutDrag(event.pointerId)}
                  onPointerDown={(event) => {
                    if (isLayoutMode && layoutCalibrationTarget === 'label' && layoutManager.canEdit && !layoutManager.busy) startLabelLayoutDrag(event, buildingId)
                    else event.stopPropagation()
                  }}
                  onPointerMove={(event) => moveLayoutLabel(event)}
                  onPointerUp={(event) => stopLabelLayoutDrag(event.pointerId)}
                  style={{
                    '--building-label-x': `${labelPosition.x}%`,
                    '--building-label-y': `${labelPosition.y}%`,
                  } as React.CSSProperties}
                  type="button"
                >
                  <span className="city-stage__building-label-name">{building.label}</span>
                  <span className="city-stage__building-label-level" aria-hidden="true">
                    {levelTransition.changeDirection === 'same' ? (
                      <span className="is-current">Lv.{levelTransition.currentLevel}</span>
                    ) : (
                      <>
                        <span className="is-previous">Lv.{levelTransition.previousLevel}</span>
                        <b className={`is-${levelTransition.changeDirection}`}>
                          {levelTransition.changeDirection === 'up' ? '▲' : '▼'}
                        </b>
                        <span className="is-current">Lv.{levelTransition.currentLevel}</span>
                      </>
                    )}
                  </span>
                  </button>
                )
              })}
            </div>
            {liveAnswerImpacts.length > 0 ? (
              <LiveAnswerImpacts impacts={liveAnswerImpacts} labelPositions={displayedLabelPositions} />
            ) : null}
            {isLayoutMode && layoutCalibrationTarget === 'model' ? (
              <div className="city-layout-handles" aria-label="จุดลากปรับตำแหน่งอาคาร">
                {BUILDING_IMPACT_ITEMS.map((building) => {
                  const buildingId = LOCATION_BUILDING[building.id]
                  const handlePosition = alignPointToDisplayedScene(building.id, BUILDING_MODEL_FOCUS_POSITIONS[building.id])
                  return (
                    <button
                      aria-label={`ลากปรับตำแหน่ง${building.label}`}
                      className={layoutSelectedBuilding === buildingId ? 'is-selected' : ''}
                      disabled={!layoutManager.canEdit || layoutManager.busy}
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
          </div> : null}
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
                <strong>{layoutCalibrationTarget === 'model' ? 'จัดตำแหน่งโมเดล' : 'จัดตำแหน่งป้ายชื่อ'}</strong>
              </div>
              <button
                aria-label="ปิดโหมดจัดตำแหน่ง"
                onClick={() => {
                  if (onExitLayoutMode) {
                    onExitLayoutMode()
                    return
                  }
                  const url = new URL(window.location.href)
                  url.searchParams.delete('layout')
                  window.location.assign(url.toString())
                }}
                type="button"
              >×</button>
            </header>

            <section className="city-layout-panel__access" aria-live="polite">
              {layoutManager.isStagingLayoutEditor ? (
                <p><strong>STAGING LAYOUT EDITOR</strong><span>Central Draft autosave พร้อมใช้งาน</span></p>
              ) : (
                <p><strong>Production ปิดการแก้ไข Layout</strong><span>ใช้พิกัด frozen ที่อยู่ใน source เท่านั้น</span></p>
              )}
            </section>

            {layoutManager.legacyDraft ? (
              <section className="city-layout-panel__legacy">
                <strong>พบค่าปรับตำแหน่งเดิมในเครื่องนี้</strong>
                <div>
                  <button disabled={!layoutManager.canEdit} onClick={layoutManager.importLegacy} type="button">นำเข้าเป็น Draft</button>
                  <button onClick={() => layoutManager.setLegacyDraft(null)} type="button">ไม่ใช้</button>
                </div>
              </section>
            ) : null}

            <fieldset disabled={!layoutManager.canEdit || layoutManager.busy}>
              <div className="city-layout-panel__selector-group city-layout-panel__target-mode">
                <span>สิ่งที่ต้องการปรับ</span>
                <div>
                  <button className={layoutCalibrationTarget === 'model' ? 'is-selected' : ''} onClick={() => setLayoutCalibrationTarget('model')} type="button">ปรับโมเดล</button>
                  <button className={layoutCalibrationTarget === 'label' ? 'is-selected' : ''} onClick={() => setLayoutCalibrationTarget('label')} type="button">ปรับป้ายชื่อ</button>
                </div>
              </div>
              <div className="city-layout-panel__selector-group">
                <span>ฉาก</span>
                <div>{(Object.keys(LAYOUT_SCENE_LABELS) as CitySceneProfileId[]).map((sceneId) => (
                  <button className={layoutSceneId === sceneId ? 'is-selected' : ''} key={sceneId} onClick={() => setLayoutSceneId(sceneId)} type="button">{LAYOUT_SCENE_LABELS[sceneId]}</button>
                ))}</div>
              </div>
              <div className="city-layout-panel__selector-group">
                <span>Model level</span>
                <div>{ALL_BUILDING_LEVELS.map((level) => (
                  <button className={layoutModelLevel === level ? 'is-selected' : ''} key={level} onClick={() => setLayoutModelLevel(level)} type="button">{level > 0 ? `+${level}` : level}</button>
                ))}</div>
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
                background: selectedLayoutSource === 'DRAFT' ? '#eafbf1' : selectedLayoutSource === 'PUBLISHED' ? '#edf5ff' : '#fff7e8',
                color: '#4a5a68',
                fontSize: '.5rem',
                lineHeight: 1.4,
              }}
            >
              <div><dt style={{ display: 'inline', fontWeight: 700 }}>ฉาก: </dt><dd style={{ display: 'inline', margin: 0 }}>{LAYOUT_SCENE_LABELS[layoutSceneId]}</dd></div>
              <div><dt style={{ display: 'inline', fontWeight: 700 }}>อาคาร: </dt><dd style={{ display: 'inline', margin: 0 }}>{LAYOUT_BUILDING_LABELS[layoutSelectedBuilding]}</dd></div>
              <div><dt style={{ display: 'inline', fontWeight: 700 }}>โมเดล: </dt><dd style={{ display: 'inline', margin: 0 }}>Lv.{layoutModelLevel > 0 ? `+${layoutModelLevel}` : layoutModelLevel}</dd></div>
              <div>
                <dt style={{ display: 'inline', fontWeight: 700 }}>{layoutCalibrationTarget === 'model' ? 'แหล่งค่าโมเดล: ' : 'แหล่งค่าป้าย: '}</dt>
                <dd style={{ display: 'inline', margin: 0 }}>
                  <span className={`city-layout-source is-${selectedLayoutSource.toLowerCase()}`}>{selectedLayoutSource}</span>
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

            <p className="city-layout-panel__hint">
              {layoutCalibrationTarget === 'model'
                ? 'ลากหมุดบนตึก หรือกดลูกศรเพื่อขยับโมเดล'
                : 'ลากป้ายชื่อ หรือกดลูกศรเพื่อขยับป้าย 1px · Shift + ลูกศร = 0.25px'}
            </p>

            <div className="city-layout-panel__values">
              {layoutCalibrationTarget === 'model' ? (['x', 'y', 'scaleX', 'scaleY'] as const).map((field) => (
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
              )) : (['labelX', 'labelY'] as const).map((field) => (
                <label key={field}>
                  <span>{field === 'labelX' ? 'Label X' : 'Label Y'}</span>
                  <input
                    inputMode="decimal"
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      if (Number.isFinite(value)) updateLabelLayoutPlacement(layoutSelectedBuilding, { [field]: value })
                    }}
                    step="0.25"
                    type="number"
                    value={Math.round(selectedLabelLayoutPlacement[field] * 100) / 100}
                  />
                </label>
              ))}
            </div>

            <div className="city-layout-panel__nudge" aria-label={layoutCalibrationTarget === 'model' ? 'ขยับอาคาร' : 'ขยับป้ายชื่อ'}>
              {layoutCalibrationTarget === 'model' ? (
                <>
                  <button onClick={() => nudgeLayoutBuilding(layoutSelectedBuilding, 0, -1)} type="button">↑</button>
                  <button onClick={() => nudgeLayoutBuilding(layoutSelectedBuilding, -1, 0)} type="button">←</button>
                  <button onClick={() => nudgeLayoutBuilding(layoutSelectedBuilding, 1, 0)} type="button">→</button>
                  <button onClick={() => nudgeLayoutBuilding(layoutSelectedBuilding, 0, 1)} type="button">↓</button>
                </>
              ) : (
                <>
                  <button onClick={(event) => nudgeLayoutLabel(layoutSelectedBuilding, 0, event.shiftKey ? -.25 : -1)} type="button">↑</button>
                  <button onClick={(event) => nudgeLayoutLabel(layoutSelectedBuilding, event.shiftKey ? -.25 : -1, 0)} type="button">←</button>
                  <button onClick={(event) => nudgeLayoutLabel(layoutSelectedBuilding, event.shiftKey ? .25 : 1, 0)} type="button">→</button>
                  <button onClick={(event) => nudgeLayoutLabel(layoutSelectedBuilding, 0, event.shiftKey ? .25 : 1)} type="button">↓</button>
                </>
              )}
            </div>

            <div className="city-layout-panel__actions">
              {layoutCalibrationTarget === 'model' ? (
                <>
                  <button onClick={copyPlacementToLevels} type="button">ใช้ตำแหน่งนี้กับทั้ง 5 ระดับ</button>
                  <button onClick={copyPlacementToScenes} type="button">ใช้ตำแหน่งนี้กับทั้ง 3 ฉาก</button>
                  <button onClick={() => resetLayoutBuilding(layoutSelectedBuilding)} type="button">คืน Draft จุดนี้</button>
                </>
              ) : (
                <>
                  <button onClick={copyLabelPlacementToLevels} type="button">ใช้ตำแหน่งป้ายนี้กับทั้ง 5 ระดับ</button>
                  <button onClick={copyLabelPlacementToScenes} type="button">ใช้ตำแหน่งป้ายนี้กับทั้ง 3 ฉาก</button>
                  <button onClick={copyLabelPlacementEverywhere} type="button">ใช้กับทุกระดับและทุกฉาก</button>
                  <button onClick={() => resetLayoutLabel(layoutSelectedBuilding)} type="button">คืนตำแหน่งป้ายจุดนี้</button>
                </>
              )}
              <button className="is-danger" onClick={clearAllDraft} type="button">ยกเลิก Draft ทั้งหมด</button>
            </div>
            </fieldset>

            <section className="city-layout-panel__publish">
              <p>Draft changes: <strong>{layoutManager.draftCount}</strong></p>
              <p>Label Draft changes: <strong>{layoutManager.labelDraftCount}</strong></p>
              <p>Resolved combinations: <strong>{layoutManager.resolvedCount} / 105</strong></p>
              <button disabled={!layoutManager.canEdit || layoutManager.busy} onClick={() => setPublishReviewed(true)} type="button">ตรวจสอบก่อนเผยแพร่</button>
              <button
                className="is-primary"
                disabled={!layoutManager.canEdit || layoutManager.busy || !publishReviewed}
                onClick={() => {
                  if (!window.confirm('เผยแพร่ตำแหน่งครบ 105 จุดให้ทุกห้องเรียนใช้งานจริงใช่ไหม?')) return
                  void layoutManager.publish().then((snapshot) => { if (snapshot) setPublishReviewed(false) })
                }}
                type="button"
              >ใช้ตำแหน่งชุดนี้จริง</button>
              {layoutManager.publishedLayout ? (
                <p className="city-layout-panel__published"><strong>เผยแพร่แล้ว ✓</strong><span>Version: {layoutManager.publishedLayout.versionId}</span><span>105 / 105 positions</span><span>Published at: {new Date(layoutManager.publishedLayout.publishedAt).toLocaleString('th-TH')}</span></p>
              ) : <p>ยังไม่มี Published config — เกมปกติใช้ frozen default</p>}
            </section>

            {layoutManager.canEdit && layoutManager.versions.length > 0 ? (
              <section className="city-layout-panel__versions">
                <strong>เวอร์ชันล่าสุด</strong>
                {layoutManager.versions.map((version) => (
                  <div key={version.versionId}><span>{version.versionId}</span><button disabled={layoutManager.busy || version.versionId === layoutManager.publishedLayout?.versionId} onClick={() => {
                    if (window.confirm(`กลับไปใช้เวอร์ชัน ${version.versionId} ใช่ไหม?`)) void layoutManager.rollback(version.versionId)
                  }} type="button">กลับไปใช้เวอร์ชันนี้</button></div>
                ))}
              </section>
            ) : null}
            <output className="city-layout-panel__feedback" aria-live="polite">{layoutManager.feedback}</output>
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
        <section className="city-stage__right-card city-stage__building-activity" aria-label="ผลกระทบสะสมของแต่ละอาคาร">
          <h2>ผลกระทบอาคารสะสม</h2>
          <p>รวมรอบที่ผ่านมาและรอบปัจจุบัน</p>
          <div className="city-stage__impact-network">
            <span className="city-stage__impact-trunk" aria-hidden="true" />
            {BUILDING_IMPACT_ITEMS.map((building) => {
              const score = cumulativeBuildingImpacts[building.id]
              const tone = score > 0 ? 'is-positive' : score < 0 ? 'is-negative' : 'is-neutral'
              return (
                <article className={tone} key={building.id}>
                  <span className="city-stage__impact-branch" aria-hidden="true" />
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
