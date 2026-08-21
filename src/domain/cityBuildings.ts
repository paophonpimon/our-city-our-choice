import type { LocationId, LocationSummary } from './cityScoring'
import type { CityLevel } from './ourCity'

export const CITY_STAGE_WIDTH = 1189.9199
export const CITY_STAGE_HEIGHT = 705.749994
export const CITY_STAGE_ASPECT_RATIO = CITY_STAGE_WIDTH / CITY_STAGE_HEIGHT
export const CITY_OVERVIEW_ASSET = '/images/new-city/backgrounds/city-overview-normal.webp'
export const DEGRADED_CITY_OVERVIEW_ASSET = '/images/new-city/backgrounds/city-overview-degraded.webp'
export const DEVELOPED_CITY_OVERVIEW_ASSET = '/images/new-city/backgrounds/city-overview-developed.webp'

export const BUILDING_IDS = [
  'municipality',
  'hospital',
  'police',
  'construction',
  'market',
  'school',
  'newsAgency',
] as const

export type BuildingId = (typeof BUILDING_IDS)[number]
export type BuildingLevel = -2 | -1 | 0 | 1 | 2
export type BuildingLevels = Record<BuildingId, BuildingLevel>

export type CitySceneProfileId = 'degraded' | 'normal' | 'developed'

export interface CitySceneBuildingPlacement {
  x: number
  y: number
  scaleX: number
  scaleY: number
}

export interface CitySceneProfile {
  id: CitySceneProfileId
  backgroundAsset: string
  backgroundFit: 'meet' | 'slice'
  buildingPlacements: Record<BuildingId, CitySceneBuildingPlacement>
}

export const CITY_SCENE_PROFILES: Record<CitySceneProfileId, CitySceneProfile> = {
  degraded: {
    id: 'degraded',
    backgroundAsset: DEGRADED_CITY_OVERVIEW_ASSET,
    backgroundFit: 'slice',
    buildingPlacements: {
      municipality: { x: 1.49, y: -35.46, scaleX: 1, scaleY: 1 },
      hospital: { x: -20.82, y: -33.25, scaleX: 1.061, scaleY: 1.001 },
      police: { x: -43.25, y: -34.21, scaleX: 1.0542244640605296, scaleY: 1 },
      construction: { x: -0.76, y: -34.5, scaleX: 1, scaleY: 1 },
      market: { x: -1.49, y: -32.58, scaleX: 1, scaleY: 1 },
      school: { x: -14.83, y: -32.54, scaleX: 1.0542244640605296, scaleY: 1 },
      newsAgency: { x: -1.5, y: -32.58, scaleX: 1, scaleY: 1 },
    },
  },
  normal: {
    id: 'normal',
    backgroundAsset: CITY_OVERVIEW_ASSET,
    backgroundFit: 'slice',
    buildingPlacements: {
      hospital: { x: 1.5, y: -39.28, scaleX: 1, scaleY: 1 },
      municipality: { x: 0, y: -39.28, scaleX: 1, scaleY: 1 },
      police: { x: 0.75, y: -39.28, scaleX: 1, scaleY: 1 },
      newsAgency: { x: -0.75, y: -37.37, scaleX: 1, scaleY: 1 },
      market: { x: 2.99, y: -35.45, scaleX: 1, scaleY: 1 },
      construction: { x: -1.5, y: -37.37, scaleX: 1, scaleY: 1 },
      school: { x: -0.75, y: -38.33, scaleX: 1, scaleY: 1 },
    },
  },
  developed: {
    id: 'developed',
    backgroundAsset: DEVELOPED_CITY_OVERVIEW_ASSET,
    backgroundFit: 'slice',
    buildingPlacements: {
      construction: { x: 0, y: -40.24, scaleX: 1, scaleY: 1 },
      market: { x: -2.99, y: -34.49, scaleX: 1, scaleY: 1 },
      police: { x: 0.75, y: -38.32, scaleX: 1, scaleY: 1 },
      newsAgency: { x: 0.75, y: -34.49, scaleX: 1, scaleY: 1 },
      municipality: { x: 1.5, y: -36.41, scaleX: 1, scaleY: 1 },
      hospital: { x: 0, y: -40.24, scaleX: 1, scaleY: 1 },
      school: { x: -2.99, y: -38.33, scaleX: 1, scaleY: 1 },
    },
  },
}

export const resolveCitySceneProfile = (cityLevel: CityLevel): CitySceneProfile => {
  if (cityLevel === 'critical' || cityLevel === 'declining') return CITY_SCENE_PROFILES.degraded
  if (cityLevel === 'improving' || cityLevel === 'prosperous') return CITY_SCENE_PROFILES.developed
  return CITY_SCENE_PROFILES.normal
}

export interface BuildingAsset {
  src: string
  level: BuildingLevel
  fit?: 'meet' | 'slice'
}

export interface BuildingAssetPlacement {
  x: number
  y: number
}

type BuildingAssetPlacementTable = Record<
  BuildingId,
  Partial<Record<BuildingLevel, BuildingAssetPlacement>>
>

const DEFAULT_BUILDING_ASSET_PLACEMENT: BuildingAssetPlacement = { x: 0, y: 0 }

/**
 * The AI building exports do not all share the same transparent canvas.
 * Level -2 and Level 2 are about 25 source pixels higher than the Level 0
 * overview, while Level -1 already contains the original top offset. Keep
 * this table per building and per level so an individual model can be tuned
 * without moving the city background or every other building.
 */
export const BUILDING_ASSET_PLACEMENTS: BuildingAssetPlacementTable = {
  municipality: { [-2]: { x: 0, y: 18.75 }, [-1]: { x: 0, y: 0 }, [2]: { x: 0, y: 18.75 } },
  hospital: { [-2]: { x: 0, y: 18.75 }, [-1]: { x: 0, y: 0 }, [2]: { x: 0, y: 18.75 } },
  police: { [-2]: { x: 0, y: 18.75 }, [-1]: { x: 0, y: 0 }, [2]: { x: 0, y: 18.75 } },
  construction: { [-2]: { x: 0, y: 18.75 }, [-1]: { x: 0, y: 0 }, [2]: { x: 0, y: 18.75 } },
  market: { [-2]: { x: 0, y: 18.75 }, [-1]: { x: 0, y: 0 }, [2]: { x: 0, y: 18.75 } },
  school: { [-2]: { x: 0, y: 18.75 }, [-1]: { x: 0, y: 0 }, [2]: { x: 0, y: 18.75 } },
  newsAgency: { [-2]: { x: 0, y: 18.75 }, [-1]: { x: 0, y: 0 }, [2]: { x: 0, y: 18.75 } },
}

export const resolveBuildingAssetPlacement = (
  buildingId: BuildingId,
  level: BuildingLevel,
): BuildingAssetPlacement => BUILDING_ASSET_PLACEMENTS[buildingId][level]
  ?? DEFAULT_BUILDING_ASSET_PLACEMENT

export const INITIAL_BUILDING_LEVELS: BuildingLevels = {
  municipality: 0,
  hospital: 0,
  police: 0,
  construction: 0,
  market: 0,
  school: 0,
  newsAgency: 0,
}

export const BUILDING_LOCATION: Record<BuildingId, LocationId> = {
  municipality: 'municipal-office',
  hospital: 'hospital',
  police: 'police-station',
  construction: 'construction',
  market: 'market',
  school: 'school',
  newsAgency: 'news-office',
}

export const LOCATION_BUILDING = Object.fromEntries(
  BUILDING_IDS.map((buildingId) => [BUILDING_LOCATION[buildingId], buildingId]),
) as Record<LocationId, BuildingId>

export const BUILDING_ASSETS: Record<BuildingId, Partial<Record<BuildingLevel, BuildingAsset>>> = {
  municipality: {
    [-2]: { src: '/images/new-city/buildings/municipality/municipality-level-minus-2.webp', level: -2 },
    [-1]: { src: '/images/new-city/buildings/municipality/municipality-level-minus-1.png', level: -1 },
    [0]: { src: '/images/new-city/buildings/municipality/municipality-level-0.png', level: 0, fit: 'slice' },
    [1]: { src: '/images/new-city/buildings/municipality/municipality-level-1.png', level: 1, fit: 'slice' },
    [2]: { src: '/images/new-city/buildings/municipality/municipality-level-2.webp', level: 2 },
  },
  hospital: {
    [-2]: { src: '/images/new-city/buildings/hospital/hospital-level-minus-2.webp', level: -2 },
    [-1]: { src: '/images/new-city/buildings/hospital/hospital-level-minus-1.png', level: -1 },
    [0]: { src: '/images/new-city/buildings/hospital/hospital-level-0.png', level: 0, fit: 'slice' },
    [1]: { src: '/images/new-city/buildings/hospital/hospital-level-1.png', level: 1, fit: 'slice' },
    [2]: { src: '/images/new-city/buildings/hospital/hospital-level-2.webp', level: 2 },
  },
  police: {
    [-2]: { src: '/images/new-city/buildings/police/police-station-level-minus-2.webp', level: -2 },
    [-1]: { src: '/images/new-city/buildings/police/police-station-level-minus-1.png', level: -1 },
    [0]: { src: '/images/new-city/buildings/police/police-station-level-0.png', level: 0, fit: 'slice' },
    [1]: { src: '/images/new-city/buildings/police/police-station-level-1.png', level: 1, fit: 'slice' },
    [2]: { src: '/images/new-city/buildings/police/police-station-level-2.webp', level: 2 },
  },
  construction: {
    [-2]: { src: '/images/new-city/buildings/construction/construction-level-minus-2.webp', level: -2 },
    [-1]: { src: '/images/new-city/buildings/construction/construction-level-minus-1.png', level: -1 },
    [0]: { src: '/images/new-city/buildings/construction/construction-level-0.png', level: 0, fit: 'slice' },
    [1]: { src: '/images/new-city/buildings/construction/construction-level-1.png', level: 1, fit: 'slice' },
    [2]: { src: '/images/new-city/buildings/construction/construction-level-2.webp', level: 2 },
  },
  market: {
    [-2]: { src: '/images/new-city/buildings/market/market-level-minus-2.webp', level: -2 },
    [-1]: { src: '/images/new-city/buildings/market/market-level-minus-1.png', level: -1 },
    [0]: { src: '/images/new-city/buildings/market/market-level-0.png', level: 0, fit: 'slice' },
    [1]: { src: '/images/new-city/buildings/market/market-level-1.png', level: 1, fit: 'slice' },
    [2]: { src: '/images/new-city/buildings/market/market-level-2.webp', level: 2 },
  },
  school: {
    [-2]: { src: '/images/new-city/buildings/school/school-level-minus-2.webp', level: -2 },
    [-1]: { src: '/images/new-city/buildings/school/school-level-minus-1.png', level: -1 },
    [0]: { src: '/images/new-city/buildings/school/school-level-0.png', level: 0, fit: 'slice' },
    [1]: { src: '/images/new-city/buildings/school/school-level-1.png', level: 1, fit: 'slice' },
    [2]: { src: '/images/new-city/buildings/school/school-level-2.webp', level: 2 },
  },
  newsAgency: {
    [-2]: { src: '/images/new-city/buildings/news-agency/news-agency-level-minus-2.webp', level: -2 },
    [-1]: { src: '/images/new-city/buildings/news-agency/news-agency-level-minus-1.png', level: -1 },
    [0]: { src: '/images/new-city/buildings/news-agency/news-agency-level-0.png', level: 0, fit: 'slice' },
    [1]: { src: '/images/new-city/buildings/news-agency/news-agency-level-1.png', level: 1, fit: 'slice' },
    [2]: { src: '/images/new-city/buildings/news-agency/news-agency-level-2.webp', level: 2 },
  },
}

export const isBuildingLevel = (value: unknown): value is BuildingLevel =>
  Number.isInteger(value) && Number(value) >= -2 && Number(value) <= 2

export const normalizeBuildingLevels = (value: unknown): BuildingLevels => {
  const candidate = value && typeof value === 'object' ? value as Partial<Record<BuildingId, unknown>> : {}
  return Object.fromEntries(
    BUILDING_IDS.map((buildingId) => [
      buildingId,
      isBuildingLevel(candidate[buildingId]) ? candidate[buildingId] : INITIAL_BUILDING_LEVELS[buildingId],
    ]),
  ) as BuildingLevels
}

export const setBuildingLevel = (
  levels: BuildingLevels,
  buildingId: BuildingId,
  level: BuildingLevel,
): BuildingLevels => ({ ...levels, [buildingId]: level })

/**
 * Persistent per-building score (0-1000, independent of cityScore). Building
 * levels are derived from this score rather than stepped directly, so a
 * building can recover across several small positive rounds instead of only
 * moving one level per round regardless of magnitude.
 */
export type BuildingScores = Record<BuildingId, number>

export const BUILDING_SCORE_POLICY = {
  initial: 500,
  min: 0,
  max: 1000,
} as const

export const clampBuildingScore = (score: number): number =>
  Math.min(BUILDING_SCORE_POLICY.max, Math.max(BUILDING_SCORE_POLICY.min, score))

export const getBuildingLevelFromScore = (score: number): BuildingLevel => {
  const clamped = clampBuildingScore(score)
  if (clamped <= 199) return -2
  if (clamped <= 399) return -1
  if (clamped <= 599) return 0
  if (clamped <= 799) return 1
  return 2
}

export const INITIAL_BUILDING_SCORES: BuildingScores = {
  municipality: BUILDING_SCORE_POLICY.initial,
  hospital: BUILDING_SCORE_POLICY.initial,
  police: BUILDING_SCORE_POLICY.initial,
  construction: BUILDING_SCORE_POLICY.initial,
  market: BUILDING_SCORE_POLICY.initial,
  school: BUILDING_SCORE_POLICY.initial,
  newsAgency: BUILDING_SCORE_POLICY.initial,
}

/** Backward-compat mapping used only when a room predates buildingScores entirely. */
const LEGACY_BUILDING_LEVEL_SCORE: Record<BuildingLevel, number> = {
  [-2]: 100,
  [-1]: 300,
  [0]: 500,
  [1]: 700,
  [2]: 900,
}

const isFiniteBuildingScore = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export const normalizeBuildingScores = (scoresValue: unknown, legacyLevels?: unknown): BuildingScores => {
  const candidate = scoresValue && typeof scoresValue === 'object' ? scoresValue as Partial<Record<BuildingId, unknown>> : null
  const fallbackLevels = legacyLevels !== undefined ? normalizeBuildingLevels(legacyLevels) : null
  return Object.fromEntries(BUILDING_IDS.map((buildingId) => {
    const raw = candidate?.[buildingId]
    if (isFiniteBuildingScore(raw)) return [buildingId, clampBuildingScore(raw)]
    if (fallbackLevels) return [buildingId, LEGACY_BUILDING_LEVEL_SCORE[fallbackLevels[buildingId]]]
    return [buildingId, BUILDING_SCORE_POLICY.initial]
  })) as BuildingScores
}

/**
 * newBuildingScore = oldBuildingScore + locationSummary.scoreAverage
 * The caller passes the same locationSummaries produced for normal rounds
 * or crisis events (crisis impact already carries its x2 multiplier, so it
 * is not doubled again here).
 */
export const updateBuildingScores = (
  currentScores: unknown,
  locationSummaries: Record<LocationId, LocationSummary>,
  legacyLevels?: unknown,
): BuildingScores => {
  const scores = normalizeBuildingScores(currentScores, legacyLevels)
  return Object.fromEntries(BUILDING_IDS.map((buildingId) => {
    const summary = locationSummaries[BUILDING_LOCATION[buildingId]]
    const nextScore = summary.participantCount > 0
      ? clampBuildingScore(scores[buildingId] + summary.scoreAverage)
      : scores[buildingId]
    return [buildingId, nextScore]
  })) as BuildingScores
}

export const deriveBuildingLevels = (scores: BuildingScores): BuildingLevels =>
  Object.fromEntries(
    BUILDING_IDS.map((buildingId) => [buildingId, getBuildingLevelFromScore(scores[buildingId])]),
  ) as BuildingLevels

export const resolveBuildingAsset = (
  buildingId: BuildingId,
  requestedLevel: BuildingLevel,
): BuildingAsset | null => BUILDING_ASSETS[buildingId][requestedLevel] ?? null
