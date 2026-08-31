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

export interface CitySceneBuildingLabelPlacement {
  labelX: number
  labelY: number
}

export interface CitySceneFrozenPlacement extends CitySceneBuildingPlacement, Partial<CitySceneBuildingLabelPlacement> {}

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

/**
 * Legacy label anchors inside each building's full-stage model canvas. These
 * percentages are the exact values the teacher map used before labels became
 * independently calibratable.
 */
export const BUILDING_LABEL_ANCHOR_PERCENTAGES: Record<BuildingId, { x: number; y: number }> = {
  municipality: { x: 50, y: 89 },
  hospital: { x: 31, y: 66 },
  police: { x: 65, y: 61 },
  construction: { x: 65, y: 19 },
  market: { x: 83, y: 43 },
  school: { x: 31, y: 29 },
  newsAgency: { x: 81, y: 79 },
}

export const deriveLegacyBuildingLabelPlacement = (
  buildingId: BuildingId,
  placement: CitySceneBuildingPlacement,
): CitySceneBuildingLabelPlacement => {
  const anchor = BUILDING_LABEL_ANCHOR_PERCENTAGES[buildingId]
  return {
    labelX: placement.x + anchor.x / 100 * CITY_STAGE_WIDTH * placement.scaleX,
    labelY: placement.y + anchor.y / 100 * CITY_STAGE_HEIGHT * placement.scaleY,
  }
}

/**
 * Frozen production defaults for the scene-placement group transform (the
 * `translate(x y) scale(scaleX scaleY)` each building's <g> renders with),
 * one entry per scene x building x level (3 x 7 x 5 = 105). These are the
 * authoritative committed production placements. After staging calibration,
 * `npm run layout:freeze-staging` validates the complete Published snapshot
 * and deterministically replaces only the marked table below. Do not recompute
 * or re-derive these numbers at runtime: scene/slice fallback math has already
 * been baked into the frozen values.
 */
// CITY LAYOUT FROZEN TABLE START
export const CITY_SCENE_BUILDING_PLACEMENTS: Record<
  CitySceneProfileId,
  Record<BuildingId, Record<BuildingLevel, CitySceneFrozenPlacement>>
> = {
  degraded: {
    municipality: {
      [-2]: { x: 1.49, y: -35.46, scaleX: 1, scaleY: 1, labelX: 585.97, labelY: 558.16 },
      [-1]: { x: 1.49, y: -35.46, scaleX: 1, scaleY: 1, labelX: 596.4499500000001, labelY: 592.65749466 },
      0: { x: 1.49, y: 3.8200000000000003, scaleX: 1, scaleY: 1, labelX: 589.71, labelY: 558.16 },
      1: { x: 28.44, y: 28.74, scaleX: 1, scaleY: 1, labelX: 604.69, labelY: 562.96 },
      2: { x: 1.49, y: -35.46, scaleX: 1, scaleY: 1, labelX: 592.7, labelY: 558.16 },
    },
    hospital: {
      [-2]: { x: -20.82, y: -33.25, scaleX: 1.061, scaleY: 1.001, labelX: 351.1, labelY: 425.35 },
      [-1]: { x: -20.82, y: -33.25, scaleX: 1.061, scaleY: 1.001, labelX: 348.11, labelY: 433.97 },
      0: { x: -22.32, y: 6.030000000000001, scaleX: 1.061, scaleY: 1.001, labelX: 370.55, labelY: 454.09 },
      1: { x: -6.6, y: 22.32, scaleX: 1.061, scaleY: 1.001, labelX: 357.83, labelY: 428.21 },
      2: { x: -29.8, y: -34.21, scaleX: 1.061, scaleY: 1.001, labelX: 339.12, labelY: 425.34 },
    },
    police: {
      [-2]: { x: -43.25, y: -34.21, scaleX: 1.0542244640605296, scaleY: 1, labelX: 757.92, labelY: 400.13 },
      [-1]: { x: -43.25, y: -34.21, scaleX: 1.0542244640605296, scaleY: 1, labelX: 772.1377347540985, labelY: 396.29749634 },
      0: { x: -44, y: 5.07, scaleX: 1.0542244640605296, scaleY: 1, labelX: 810.3, labelY: 434.62 },
      1: { x: -14.81, y: 19.45, scaleX: 1.0542244640605296, scaleY: 1, labelX: 787.86, labelY: 419.3 },
      2: { x: -43.25, y: -34.21, scaleX: 1.0542244640605296, scaleY: 1, labelX: 805.06, labelY: 419.29 },
    },
    construction: {
      [-2]: { x: -0.76, y: -34.5, scaleX: 1, scaleY: 1, labelX: 783.16, labelY: 207.86 },
      [-1]: { x: -0.76, y: -34.5, scaleX: 1, scaleY: 1, labelX: 777.18, labelY: 204.03 },
      0: { x: 0.74, y: 2.8699999999999974, scaleX: 1, scaleY: 1, labelX: 790.65, labelY: 200.2 },
      1: { x: 23.19, y: 7.66, scaleX: 1, scaleY: 1, labelX: 785.41, labelY: 204.99 },
      2: { x: -0.76, y: -34.5, scaleX: 1, scaleY: 1, labelX: 789.16, labelY: 184.87 },
    },
    market: {
      [-2]: { x: -1.49, y: -32.58, scaleX: 1, scaleY: 1, labelX: 989.13, labelY: 302.51 },
      [-1]: { x: -1.49, y: -32.58, scaleX: 1, scaleY: 1, labelX: 996.62, labelY: 290.06 },
      0: { x: -4.48, y: 2.8700000000000045, scaleX: 1, scaleY: 1, labelX: 999.62, labelY: 299.64 },
      1: { x: 35.93, y: 15.33, scaleX: 1, scaleY: 1, labelX: 1023.5635169999999, labelY: 318.80249742 },
      2: { x: -1.49, y: -32.58, scaleX: 1, scaleY: 1, labelX: 991.38, labelY: 285.26 },
    },
    school: {
      [-2]: { x: -14.83, y: -32.54, scaleX: 1.0542244640605296, scaleY: 1, labelX: 374.05, labelY: 165.42 },
      [-1]: { x: -14.83, y: -32.54, scaleX: 1.0542244640605296, scaleY: 1, labelX: 378.54, labelY: 169.25 },
      0: { x: -14.08, y: 5.789999999999999, scaleX: 1.0542244640605296, scaleY: 1, labelX: 379.29, labelY: 169.26 },
      1: { x: 0.89, y: 16.33, scaleX: 1.0542244640605296, scaleY: 1, labelX: 376.3, labelY: 173.09 },
      2: { x: -14.83, y: -32.54, scaleX: 1.0542244640605296, scaleY: 1, labelX: 384.53, labelY: 157.76 },
    },
    newsAgency: {
      [-2]: { x: 0, y: -39.29, scaleX: 1, scaleY: 1, labelX: 978.8, labelY: 554.66 },
      [-1]: { x: -1.5, y: -32.58, scaleX: 1, scaleY: 1, labelX: 962.3351190000002, labelY: 524.96249526 },
      0: { x: -0.75, y: 4.789999999999999, scaleX: 1, scaleY: 1, labelX: 972.81, labelY: 562.33 },
      1: { x: 38.16, y: 25.87, scaleX: 1, scaleY: 1, labelX: 978.8, labelY: 546.04 },
      2: { x: -1.5, y: -32.58, scaleX: 1, scaleY: 1, labelX: 981.04, labelY: 551.79 },
    },
  },
  normal: {
    municipality: {
      [-2]: { x: 0, y: -39.28, scaleX: 1, scaleY: 1, labelX: 580.74, labelY: 541.89 },
      [-1]: { x: 0, y: -39.28, scaleX: 1, scaleY: 1, labelX: 591.97, labelY: 546.68 },
      0: { x: 0, y: 0, scaleX: 1, scaleY: 1, labelX: 573.25, labelY: 553.38 },
      1: { x: 24.7, y: 27.79, scaleX: 1, scaleY: 1, labelX: 585.98, labelY: 553.38 },
      2: { x: 0, y: -39.28, scaleX: 1, scaleY: 1, labelX: 594.96, labelY: 562.97 },
    },
    hospital: {
      [-2]: { x: 1.5, y: -39.28, scaleX: 1, scaleY: 1, labelX: 350.92, labelY: 424.6 },
      [-1]: { x: 1.5, y: -39.28, scaleX: 1, scaleY: 1, labelX: 370.375169, labelY: 426.51499604 },
      0: { x: 5.24, y: 1.92, scaleX: 1, scaleY: 1, labelX: 332.21, labelY: 421.72 },
      1: { x: 16.47, y: 26.83, scaleX: 1, scaleY: 1, labelX: 358.4, labelY: 428.43 },
      2: { x: 1.5, y: -39.28, scaleX: 1, scaleY: 1, labelX: 370.375169, labelY: 426.51499604 },
    },
    police: {
      [-2]: { x: 0.75, y: -39.28, scaleX: 1, scaleY: 1, labelX: 774.1979350000001, labelY: 391.22749634 },
      [-1]: { x: 0.75, y: -39.28, scaleX: 1, scaleY: 1, labelX: 774.1979350000001, labelY: 391.22749634 },
      0: { x: 0, y: 0, scaleX: 1, scaleY: 1, labelX: 747.26, labelY: 403.67 },
      1: { x: 23.2, y: 18.21, scaleX: 1, scaleY: 1, labelX: 745.76, labelY: 396.02 },
      2: { x: 0.75, y: -39.28, scaleX: 1, scaleY: 1, labelX: 774.1979350000001, labelY: 391.22749634 },
    },
    construction: {
      [-2]: { x: -1.5, y: -37.37, scaleX: 1, scaleY: 1, labelX: 790.66, labelY: 200.2 },
      [-1]: { x: -1.5, y: -37.37, scaleX: 1, scaleY: 1, labelX: 771.9479350000001, labelY: 96.72249886 },
      0: { x: 0, y: 0, scaleX: 1, scaleY: 1, labelX: 790.66, labelY: 200.21 },
      1: { x: 26.94, y: 8.62, scaleX: 1, scaleY: 1, labelX: 794.4, labelY: 199.24 },
      2: { x: -1.5, y: -37.37, scaleX: 1, scaleY: 1, labelX: 787.66, labelY: 207.87 },
    },
    market: {
      [-2]: { x: 2.99, y: -35.45, scaleX: 1, scaleY: 1, labelX: 990.623517, labelY: 268.02249742000004 },
      [-1]: { x: 2.99, y: -35.45, scaleX: 1, scaleY: 1, labelX: 990.623517, labelY: 268.02249742000004 },
      0: { x: 0, y: 0, scaleX: 1, scaleY: 1, labelX: 998.86, labelY: 290.06 },
      1: { x: 32.93, y: 17.25, scaleX: 1, scaleY: 1, labelX: 1000.36, labelY: 292.94 },
      2: { x: 2.99, y: -35.45, scaleX: 1, scaleY: 1, labelX: 990.623517, labelY: 268.02249742000004 },
    },
    school: {
      [-2]: { x: -0.75, y: -38.33, scaleX: 1, scaleY: 1, labelX: 368.125169, labelY: 166.33749826000002 },
      [-1]: { x: -0.75, y: -38.33, scaleX: 1, scaleY: 1, labelX: 368.125169, labelY: 166.33749826000002 },
      0: { x: 0, y: 0, scaleX: 1, scaleY: 1, labelX: 371.87, labelY: 162.51 },
      1: { x: 7.48, y: 11.49, scaleX: 1, scaleY: 1, labelX: 368.87, labelY: 163.46 },
      2: { x: -0.75, y: -38.33, scaleX: 1, scaleY: 1, labelX: 368.125169, labelY: 166.33749826000002 },
    },
    newsAgency: {
      [-2]: { x: -0.75, y: -37.37, scaleX: 1, scaleY: 1, labelX: 963.0851190000002, labelY: 520.17249526 },
      [-1]: { x: -0.75, y: -37.37, scaleX: 1, scaleY: 1, labelX: 976.56, labelY: 550.83 },
      0: { x: 0, y: 0, scaleX: 1, scaleY: 1, labelX: 981.05, labelY: 553.71 },
      1: { x: 37.42, y: 23, scaleX: 1, scaleY: 1, labelX: 954.11, labelY: 541.26 },
      2: { x: -0.75, y: -37.37, scaleX: 1, scaleY: 1, labelX: 984.79, labelY: 554.67 },
    },
  },
  developed: {
    municipality: {
      [-2]: { x: 1.5, y: -36.41, scaleX: 1, scaleY: 1, labelX: 586.73, labelY: 561.05 },
      [-1]: { x: 1.5, y: -36.41, scaleX: 1, scaleY: 1, labelX: 581.49, labelY: 549.55 },
      0: { x: 1.5, y: 2.8700000000000045, scaleX: 1, scaleY: 1, labelX: 593.47, labelY: 554.33 },
      1: { x: 26.95, y: 26.83, scaleX: 1, scaleY: 1, labelX: 621.16, labelY: 560.09 },
      2: { x: 1.5, y: -36.41, scaleX: 1, scaleY: 1, labelX: 598.71, labelY: 556.26 },
    },
    hospital: {
      [-2]: { x: 0, y: -40.24, scaleX: 1, scaleY: 1, labelX: 367.38, labelY: 434.18 },
      [-1]: { x: 0, y: -40.24, scaleX: 1, scaleY: 1, labelX: 368.875169, labelY: 425.55499604000005 },
      0: { x: -1.5, y: -0.9600000000000009, scaleX: 1, scaleY: 1, labelX: 359.14, labelY: 428.42 },
      1: { x: 16.46, y: 21.08, scaleX: 1, scaleY: 1, labelX: 365.88, labelY: 429.38 },
      2: { x: 0, y: -40.24, scaleX: 1, scaleY: 1, labelX: 368.875169, labelY: 425.55499604000005 },
    },
    police: {
      [-2]: { x: 0.75, y: -38.32, scaleX: 1, scaleY: 1, labelX: 755.49, labelY: 397.94 },
      [-1]: { x: 0.75, y: -38.32, scaleX: 1, scaleY: 1, labelX: 805.63, labelY: 414.23 },
      0: { x: 0, y: 0.9600000000000009, scaleX: 1, scaleY: 1, labelX: 753.24, labelY: 397.93 },
      1: { x: 26.94, y: 21.09, scaleX: 1, scaleY: 1, labelX: 787.67, labelY: 415.19 },
      2: { x: 0.75, y: -38.32, scaleX: 1, scaleY: 1, labelX: 774.1979350000001, labelY: 392.18749634 },
    },
    construction: {
      [-2]: { x: 0, y: -40.24, scaleX: 1, scaleY: 1, labelX: 786.92, labelY: 200.21 },
      [-1]: { x: 0, y: -40.24, scaleX: 1, scaleY: 1, labelX: 787.67, labelY: 194.46 },
      0: { x: 1.5, y: -2.8700000000000045, scaleX: 1, scaleY: 1, labelX: 786.92, labelY: 202.13 },
      1: { x: 24.7, y: 7.67, scaleX: 1, scaleY: 1, labelX: 787.67, labelY: 200.21 },
      2: { x: 0, y: -40.24, scaleX: 1, scaleY: 1, labelX: 781.68, labelY: 201.17 },
    },
    market: {
      [-2]: { x: -2.99, y: -34.49, scaleX: 1, scaleY: 1, labelX: 995.12, labelY: 276.65 },
      [-1]: { x: -2.99, y: -34.49, scaleX: 1, scaleY: 1, labelX: 984.643517, labelY: 268.98249742 },
      0: { x: -5.98, y: 0.9600000000000009, scaleX: 1, scaleY: 1, labelX: 981.653517, labelY: 304.43249742 },
      1: { x: 36.67, y: 16.29, scaleX: 1, scaleY: 1, labelX: 1004.85, labelY: 288.14 },
      2: { x: -2.99, y: -34.49, scaleX: 1, scaleY: 1, labelX: 984.643517, labelY: 268.98249742 },
    },
    school: {
      [-2]: { x: -2.99, y: -38.33, scaleX: 1, scaleY: 1, labelX: 378.61, labelY: 166.34 },
      [-1]: { x: -2.99, y: -38.33, scaleX: 1, scaleY: 1, labelX: 373.37, labelY: 160.59 },
      0: { x: -2.24, y: 0, scaleX: 1, scaleY: 1, labelX: 370.38, labelY: 158.68 },
      1: { x: 16.47, y: 12.45, scaleX: 1, scaleY: 1, labelX: 374.87, labelY: 163.46 },
      2: { x: -2.99, y: -38.33, scaleX: 1, scaleY: 1, labelX: 375.61, labelY: 162.5 },
    },
    newsAgency: {
      [-2]: { x: 0.75, y: -34.49, scaleX: 1, scaleY: 1, labelX: 974.31, labelY: 549.88 },
      [-1]: { x: 0.75, y: -34.49, scaleX: 1, scaleY: 1, labelX: 972.82, labelY: 543.17 },
      0: { x: 1.5, y: 2.8799999999999955, scaleX: 1, scaleY: 1, labelX: 953.36, labelY: 537.43 },
      1: { x: 32.18, y: 24.91, scaleX: 1, scaleY: 1, labelX: 961.59, labelY: 540.29 },
      2: { x: 0.75, y: -34.49, scaleX: 1, scaleY: 1, labelX: 964.5851190000002, labelY: 523.05249526 },
    },
  },
}
// CITY LAYOUT FROZEN TABLE END

export const resolveFrozenBuildingPlacement = (
  sceneId: CitySceneProfileId,
  buildingId: BuildingId,
  level: BuildingLevel,
): CitySceneBuildingPlacement => {
  const { x, y, scaleX, scaleY } = CITY_SCENE_BUILDING_PLACEMENTS[sceneId][buildingId][level]
  return { x, y, scaleX, scaleY }
}

export const resolveFrozenBuildingLabelPlacement = (
  sceneId: CitySceneProfileId,
  buildingId: BuildingId,
  level: BuildingLevel,
): CitySceneBuildingLabelPlacement => {
  const placement = CITY_SCENE_BUILDING_PLACEMENTS[sceneId][buildingId][level]
  return typeof placement.labelX === 'number' && Number.isFinite(placement.labelX)
    && typeof placement.labelY === 'number' && Number.isFinite(placement.labelY)
    ? { labelX: placement.labelX, labelY: placement.labelY }
    : deriveLegacyBuildingLabelPlacement(buildingId, placement)
}

/**
 * Ground/contact depth anchor for isometric front-to-back sorting - the
 * ACTUAL effective screen-space Y of the bottom edge of the building's
 * canvas, derived from the real CityScene transform chain rather than an
 * approximation:
 *
 *   <g transform="translate(scene.x scene.y) scale(scene.scaleX scene.scaleY)">
 *     <image x={asset.x} y={asset.y} width=CITY_STAGE_WIDTH height=CITY_STAGE_HEIGHT />
 *   </g>
 *
 * SVG applies a `<g>`'s transform to every coordinate inside it as
 * translate(scale(point)) - the child's local (x, y) is scaled FIRST, then
 * the group's translate is added. The <image>'s local bottom edge sits at
 * (asset.y + CITY_STAGE_HEIGHT); mapping that through the group's transform
 * gives:
 *
 *   groundAnchorY = scene.y + (asset.y + CITY_STAGE_HEIGHT) * scene.scaleY
 *
 * BUILDING_ASSET_PLACEMENTS.y is non-zero at Lv.-2/+2 (18.75, compensating
 * for those two exports having a different canvas offset than Lv.-1/0/1) and
 * zero everywhere else, so it genuinely shifts the rendered ground/contact
 * position at those levels and must be included here - omitting it would
 * silently misjudge depth whenever a -2/+2 model is being compared against a
 * -1/0/1 model. Every building asset shares this same canvas and is
 * calibrated against the same shared background, so once the asset offset is
 * folded in, this value already IS the human-calibrated + asset-corrected
 * signal for how far down - and therefore how far forward in the isometric
 * view - a building's content sits relative to every other building. No
 * separate geometry metadata (image bounds, transparent-pixel bounds, roof
 * position) is needed: SVG Y increases downward, and a larger effective
 * ground Y means the building is lower on screen and closer to the viewer.
 */
export const resolveBuildingGroundAnchorY = (
  scenePlacement: CitySceneBuildingPlacement,
  assetPlacement: BuildingAssetPlacement,
): number => scenePlacement.y + (assetPlacement.y + CITY_STAGE_HEIGHT) * scenePlacement.scaleY

/**
 * Isometric depth order for the 7 buildings from their precomputed ground
 * anchors (see `resolveBuildingGroundAnchorY`): a smaller anchor renders
 * first (further back), a larger anchor renders later (further front,
 * painted over anything behind it). BUILDING_IDS declaration order is used
 * only as a deterministic tie-breaker when two anchors are exactly equal -
 * it never decides ordering on its own otherwise.
 */
export const sortBuildingsByDepth = (
  groundAnchors: Record<BuildingId, number>,
): BuildingId[] =>
  [...BUILDING_IDS].sort((a, b) => {
    const delta = groundAnchors[a] - groundAnchors[b]
    return delta !== 0 ? delta : BUILDING_IDS.indexOf(a) - BUILDING_IDS.indexOf(b)
  })

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
