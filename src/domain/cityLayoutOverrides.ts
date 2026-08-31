import {
  BUILDING_IDS,
  CITY_SCENE_PROFILES,
  deriveLegacyBuildingLabelPlacement,
  isBuildingLevel,
  resolveFrozenBuildingLabelPlacement,
  resolveFrozenBuildingPlacement,
  type BuildingId,
  type BuildingLevel,
  type CitySceneBuildingLabelPlacement,
  type CitySceneBuildingPlacement,
  type CitySceneProfileId,
} from './cityBuildings'

/**
 * Calibration overrides saved by the teacher-only `?layout=1` tool. Keyed
 * scene -> building -> model level so that every one of a building's five
 * model levels keeps its own alignment inside a given scene: adjusting the
 * Level +2 model can never overwrite what was tuned for Level +1, and a
 * scene-specific tweak never leaks into another scene. The production
 * placement defaults (`CITY_SCENE_BUILDING_PLACEMENTS` in cityBuildings.ts,
 * one frozen entry per scene/building/level) stay untouched by this module -
 * this is purely the in-progress, sparsely-populated calibration layer that
 * sits on top of them while someone is actively tuning.
 */
/** One scene's slice of `CityLayoutOverrides` - the shape CityScene actually receives as a prop, already scoped to whichever scene it is rendering. */
export type SceneLayoutOverrides = Partial<Record<BuildingId, Partial<Record<BuildingLevel, CitySceneBuildingPlacement>>>>

export type CityLayoutOverrides = Partial<Record<CitySceneProfileId, SceneLayoutOverrides>>

export type SceneLabelLayoutOverrides = Partial<Record<BuildingId, Partial<Record<BuildingLevel, CitySceneBuildingLabelPlacement>>>>
export type CityLabelLayoutOverrides = Partial<Record<CitySceneProfileId, SceneLabelLayoutOverrides>>

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const browserStorage = (): StorageLike => {
  const storage = (globalThis as { localStorage?: StorageLike }).localStorage
  if (!storage) throw new Error('Browser localStorage is unavailable')
  return storage
}

export const CITY_LAYOUT_STORAGE_KEY = 'our_city_scene_layout_overrides_v2'
export const CITY_LAYOUT_STORAGE_KEY_V1 = 'our_city_scene_layout_overrides_v1'

const isFinitePlacement = (value: unknown): value is CitySceneBuildingPlacement => {
  if (!value || typeof value !== 'object') return false
  const placement = value as Partial<CitySceneBuildingPlacement>
  return [placement.x, placement.y, placement.scaleX, placement.scaleY]
    .every((entry) => typeof entry === 'number' && Number.isFinite(entry))
}

/** Parses the v2 (scene -> building -> level -> placement) shape, dropping anything malformed rather than throwing. */
export const parseCityLayoutOverridesV2 = (raw: string): CityLayoutOverrides => {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      (Object.keys(CITY_SCENE_PROFILES) as CitySceneProfileId[]).flatMap((sceneId) => {
        const sceneSource = (parsed as Record<string, unknown>)[sceneId]
        if (!sceneSource || typeof sceneSource !== 'object') return []
        const buildings = Object.fromEntries(
          BUILDING_IDS.flatMap((buildingId) => {
            const buildingSource = (sceneSource as Record<string, unknown>)[buildingId]
            if (!buildingSource || typeof buildingSource !== 'object') return []
            const levels = Object.fromEntries(
              Object.entries(buildingSource as Record<string, unknown>).flatMap(([levelKey, placement]) => {
                const level = Number(levelKey)
                return isBuildingLevel(level) && isFinitePlacement(placement) ? [[level, placement]] : []
              }),
            )
            return Object.keys(levels).length > 0 ? [[buildingId, levels]] : []
          }),
        )
        return Object.keys(buildings).length > 0 ? [[sceneId, buildings]] : []
      }),
    ) as CityLayoutOverrides
  } catch {
    return {}
  }
}

export const ALL_BUILDING_LEVELS: readonly BuildingLevel[] = [-2, -1, 0, 1, 2]
export const CITY_LAYOUT_COMBINATION_COUNT = 3 * BUILDING_IDS.length * ALL_BUILDING_LEVELS.length
export const CITY_LAYOUT_SCHEMA_VERSION = 2 as const
export const LEGACY_CITY_LAYOUT_SCHEMA_VERSION = 1 as const

/**
 * v1 stored one placement per scene/building with no level axis at all, so
 * there is no way to know which model level the calibrator was looking at
 * when they saved it - it could have been any of Lv.-2 through Lv.+2. Rather
 * than guessing a single level (and risking silently discarding a manual
 * coordinate by filing it under the wrong one), migration duplicates that
 * one v1 placement as the INITIAL value for all 5 levels. This is
 * migration-only: once written, the 5 resulting records are fully
 * independent overrides - editing one afterward never touches the other 4,
 * and nothing keeps them in sync going forward. The user then manually
 * refines whichever levels actually need different alignment.
 */
export const migrateCityLayoutOverridesV1 = (raw: string): CityLayoutOverrides => {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      (Object.keys(CITY_SCENE_PROFILES) as CitySceneProfileId[]).flatMap((sceneId) => {
        const sceneSource = (parsed as Record<string, unknown>)[sceneId]
        if (!sceneSource || typeof sceneSource !== 'object') return []
        const buildings = Object.fromEntries(
          BUILDING_IDS.flatMap((buildingId) => {
            const placement = (sceneSource as Record<string, unknown>)[buildingId]
            if (!isFinitePlacement(placement)) return []
            const levels = Object.fromEntries(
              ALL_BUILDING_LEVELS.map((level) => [level, { ...placement }]),
            )
            return [[buildingId, levels]]
          }),
        )
        return Object.keys(buildings).length > 0 ? [[sceneId, buildings]] : []
      }),
    ) as CityLayoutOverrides
  } catch {
    return {}
  }
}

/**
 * Reads saved calibration overrides, migrating a legacy v1 value on the fly
 * if no v2 value has been saved yet. The original v1 key is never touched or
 * cleared here, so the source values survive even if a migration turns out
 * to be imperfect - the caller's own persistence effect is what writes the
 * migrated result back under the v2 key once it runs.
 */
export const readCityLayoutOverrides = (storage: StorageLike = browserStorage()): CityLayoutOverrides => {
  const storedV2 = storage.getItem(CITY_LAYOUT_STORAGE_KEY)
  if (storedV2 !== null) return parseCityLayoutOverridesV2(storedV2)
  const storedV1 = storage.getItem(CITY_LAYOUT_STORAGE_KEY_V1)
  return storedV1 !== null ? migrateCityLayoutOverridesV1(storedV1) : {}
}

export const writeCityLayoutOverrides = (overrides: CityLayoutOverrides, storage: StorageLike = browserStorage()): void => {
  storage.setItem(CITY_LAYOUT_STORAGE_KEY, JSON.stringify(overrides))
}

export const getLayoutPlacement = (
  overrides: CityLayoutOverrides,
  sceneId: CitySceneProfileId,
  buildingId: BuildingId,
  level: BuildingLevel,
): CitySceneBuildingPlacement =>
  overrides[sceneId]?.[buildingId]?.[level] ?? resolveFrozenBuildingPlacement(sceneId, buildingId, level)

export const setLayoutPlacement = (
  overrides: CityLayoutOverrides,
  sceneId: CitySceneProfileId,
  buildingId: BuildingId,
  level: BuildingLevel,
  placement: CitySceneBuildingPlacement,
): CityLayoutOverrides => ({
  ...overrides,
  [sceneId]: {
    ...overrides[sceneId],
    [buildingId]: {
      ...overrides[sceneId]?.[buildingId],
      [level]: placement,
    },
  },
})

export const setLabelLayoutPlacement = (
  overrides: CityLabelLayoutOverrides,
  sceneId: CitySceneProfileId,
  buildingId: BuildingId,
  level: BuildingLevel,
  placement: CitySceneBuildingLabelPlacement,
): CityLabelLayoutOverrides => ({
  ...overrides,
  [sceneId]: {
    ...overrides[sceneId],
    [buildingId]: {
      ...overrides[sceneId]?.[buildingId],
      [level]: placement,
    },
  },
})

export const clearLabelLayoutPlacement = (
  overrides: CityLabelLayoutOverrides,
  sceneId: CitySceneProfileId,
  buildingId: BuildingId,
  level: BuildingLevel,
): CityLabelLayoutOverrides => {
  const buildingOverrides = overrides[sceneId]?.[buildingId]
  if (!buildingOverrides || !(level in buildingOverrides)) return overrides
  const nextBuildingOverrides = { ...buildingOverrides }
  delete nextBuildingOverrides[level]
  const nextSceneOverrides = { ...overrides[sceneId] }
  if (Object.keys(nextBuildingOverrides).length > 0) nextSceneOverrides[buildingId] = nextBuildingOverrides
  else delete nextSceneOverrides[buildingId]
  const next = { ...overrides }
  if (Object.keys(nextSceneOverrides).length > 0) next[sceneId] = nextSceneOverrides
  else delete next[sceneId]
  return next
}

/** Clears only the given scene/building/level - every other level, building, and scene is left exactly as it was. */
export const clearLayoutPlacement = (
  overrides: CityLayoutOverrides,
  sceneId: CitySceneProfileId,
  buildingId: BuildingId,
  level: BuildingLevel,
): CityLayoutOverrides => {
  const buildingOverrides = overrides[sceneId]?.[buildingId]
  if (!buildingOverrides || !(level in buildingOverrides)) return overrides
  const nextBuildingOverrides = { ...buildingOverrides }
  delete nextBuildingOverrides[level]
  const nextSceneOverrides = { ...overrides[sceneId] }
  if (Object.keys(nextBuildingOverrides).length > 0) nextSceneOverrides[buildingId] = nextBuildingOverrides
  else delete nextSceneOverrides[buildingId]
  const next = { ...overrides }
  if (Object.keys(nextSceneOverrides).length > 0) next[sceneId] = nextSceneOverrides
  else delete next[sceneId]
  return next
}

/** Clears every building and every model level saved for one scene. Callers should confirm with the user first - this is a wide, all-levels reset. */
export const clearLayoutScene = (
  overrides: CityLayoutOverrides,
  sceneId: CitySceneProfileId,
): CityLayoutOverrides => {
  const next = { ...overrides }
  delete next[sceneId]
  return next
}

export interface EffectivePlacementRecord extends CitySceneBuildingPlacement {
  scene: CitySceneProfileId
  building: BuildingId
  level: BuildingLevel
  /** 'override' when this exact scene/building/level has a saved v2 value; 'fallback' when it is resolving to the frozen production default instead. */
  source: 'override' | 'fallback'
}

/**
 * Resolves the exact placement CityScene will render for one scene/building/
 * level combination - read-only, no storage access, no mutation. This must
 * stay the single source of truth for that computation: CityScene.tsx calls
 * it directly for rendering, so the recovery export below is guaranteed to
 * match pixel-for-pixel what is actually on screen rather than drifting from
 * a second, hand-duplicated copy of the same logic.
 *
 * With no override, this resolves straight to `CITY_SCENE_BUILDING_PLACEMENTS`
 * (the frozen, already-final production default for this exact combination)
 * and applies NO further math - no scene-delta, no slice fallback, no
 * BUILDING_ASSET_PLACEMENTS offset. That transform work already happened
 * once, when the frozen defaults were captured; redoing any part of it here
 * would double-apply it and silently shift every un-overridden building.
 */
export const resolveEffectivePlacement = (
  sceneOverrides: SceneLayoutOverrides | undefined,
  sceneId: CitySceneProfileId,
  buildingId: BuildingId,
  level: BuildingLevel,
): EffectivePlacementRecord => {
  const override = sceneOverrides?.[buildingId]?.[level]
  const placement = override ?? resolveFrozenBuildingPlacement(sceneId, buildingId, level)
  return {
    scene: sceneId,
    building: buildingId,
    level,
    x: placement.x,
    y: placement.y,
    scaleX: placement.scaleX,
    scaleY: placement.scaleY,
    source: override ? 'override' : 'fallback',
  }
}

/**
 * Recovery/export only: computes the full 3 scenes x 7 buildings x 5 levels
 * = 105 effective placements currently used by the renderer, whether each
 * one comes from a saved override or the scene/base + per-level fallback.
 * Pure and read-only - never writes to storage, never migrates, never
 * changes v1 or v2, never alters what is currently rendered.
 */
export const exportAllEffectivePlacements = (overrides: CityLayoutOverrides): EffectivePlacementRecord[] =>
  (Object.keys(CITY_SCENE_PROFILES) as CitySceneProfileId[]).flatMap((sceneId) =>
    BUILDING_IDS.flatMap((buildingId) =>
      ALL_BUILDING_LEVELS.map((level) => resolveEffectivePlacement(overrides[sceneId], sceneId, buildingId, level)),
    ),
  )

export interface CompleteCityLayoutPlacement extends CitySceneBuildingPlacement, CitySceneBuildingLabelPlacement {}

export type CompleteCityLayoutPlacements = Record<
  CitySceneProfileId,
  Record<BuildingId, Record<BuildingLevel, CompleteCityLayoutPlacement>>
>

export interface CityLayoutPublishedSnapshot {
  schemaVersion: typeof CITY_LAYOUT_SCHEMA_VERSION
  versionId: string
  placements: CompleteCityLayoutPlacements
  publishedAt: number
}

interface CityLayoutDraftRecordBase {
  scene: CitySceneProfileId
  building: BuildingId
  level: BuildingLevel
  updatedAt: number
}

export interface CityLayoutModelDraftRecord extends CityLayoutDraftRecordBase, CitySceneBuildingPlacement {}
export interface CityLayoutLabelDraftRecord extends CityLayoutDraftRecordBase, CitySceneBuildingLabelPlacement {}
export type CityLayoutDraftRecord = CityLayoutModelDraftRecord | CityLayoutLabelDraftRecord

export type CityLayoutPlacementSource = 'DRAFT' | 'PUBLISHED' | 'DEFAULT'

export interface ResolvedCityLayoutPlacement extends CompleteCityLayoutPlacement {
  source: CityLayoutPlacementSource
  labelSource: CityLayoutPlacementSource
}

export const cityLayoutDraftId = (
  scene: CitySceneProfileId,
  building: BuildingId,
  level: BuildingLevel,
): string => `${scene}__${building}__${level}`

export const cityLayoutLabelDraftId = (
  scene: CitySceneProfileId,
  building: BuildingId,
  level: BuildingLevel,
): string => `${cityLayoutDraftId(scene, building, level)}__label`

export const isSaneCityLayoutPlacement = (value: unknown): value is CitySceneBuildingPlacement => {
  if (!isFinitePlacement(value)) return false
  return Math.abs(value.x) <= 2_000
    && Math.abs(value.y) <= 2_000
    && value.scaleX >= 0.05
    && value.scaleX <= 10
    && value.scaleY >= 0.05
    && value.scaleY <= 10
}

export const isSaneCityLayoutLabelPlacement = (value: unknown): value is CitySceneBuildingLabelPlacement => {
  if (!value || typeof value !== 'object') return false
  const placement = value as Partial<CitySceneBuildingLabelPlacement>
  return typeof placement.labelX === 'number' && Number.isFinite(placement.labelX)
    && typeof placement.labelY === 'number' && Number.isFinite(placement.labelY)
    && Math.abs(placement.labelX) <= 2_000
    && Math.abs(placement.labelY) <= 2_000
}

export const isModelCityLayoutDraftRecord = (record: CityLayoutDraftRecord): record is CityLayoutModelDraftRecord =>
  'x' in record

export const isLabelCityLayoutDraftRecord = (record: CityLayoutDraftRecord): record is CityLayoutLabelDraftRecord =>
  'labelX' in record

const frozenCompletePlacement = (
  scene: CitySceneProfileId,
  building: BuildingId,
  level: BuildingLevel,
): CompleteCityLayoutPlacement => ({
  ...resolveFrozenBuildingPlacement(scene, building, level),
  ...resolveFrozenBuildingLabelPlacement(scene, building, level),
})

/** The only resolver used by normal gameplay: published snapshot, else frozen source. */
export const resolveProductionPlacement = (
  published: CityLayoutPublishedSnapshot | null | undefined,
  scene: CitySceneProfileId,
  building: BuildingId,
  level: BuildingLevel,
): ResolvedCityLayoutPlacement => {
  const placement = published?.placements[scene]?.[building]?.[level]
  const validPublished = placement
    && isSaneCityLayoutPlacement(placement)
    && isSaneCityLayoutLabelPlacement(placement)
  const resolved = validPublished
    ? placement
    : frozenCompletePlacement(scene, building, level)
  return {
    ...resolved,
    source: validPublished ? 'PUBLISHED' : 'DEFAULT',
    labelSource: validPublished ? 'PUBLISHED' : 'DEFAULT',
  }
}

/** Layout editor precedence is Draft -> Published -> committed frozen default. */
export const resolveLayoutEditorPlacement = (
  draft: CityLayoutOverrides,
  published: CityLayoutPublishedSnapshot | null | undefined,
  scene: CitySceneProfileId,
  building: BuildingId,
  level: BuildingLevel,
  labelDraft: CityLabelLayoutOverrides = {},
): ResolvedCityLayoutPlacement => {
  const production = resolveProductionPlacement(published, scene, building, level)
  const draftPlacement = draft[scene]?.[building]?.[level]
  const draftLabel = labelDraft[scene]?.[building]?.[level]
  return {
    ...(draftPlacement && isSaneCityLayoutPlacement(draftPlacement) ? draftPlacement : production),
    ...(draftLabel && isSaneCityLayoutLabelPlacement(draftLabel) ? draftLabel : {
      labelX: production.labelX,
      labelY: production.labelY,
    }),
    source: draftPlacement && isSaneCityLayoutPlacement(draftPlacement) ? 'DRAFT' : production.source,
    labelSource: draftLabel && isSaneCityLayoutLabelPlacement(draftLabel) ? 'DRAFT' : production.labelSource,
  }
}

export const resolveCompleteCityLayout = (
  draft: CityLayoutOverrides,
  published: CityLayoutPublishedSnapshot | null | undefined,
  labelDraft: CityLabelLayoutOverrides = {},
): CompleteCityLayoutPlacements => Object.fromEntries(
  (Object.keys(CITY_SCENE_PROFILES) as CitySceneProfileId[]).map((scene) => [
    scene,
    Object.fromEntries(BUILDING_IDS.map((building) => [
      building,
      Object.fromEntries(ALL_BUILDING_LEVELS.map((level) => {
        const resolved = resolveLayoutEditorPlacement(draft, published, scene, building, level, labelDraft)
        return [level, {
          x: resolved.x,
          y: resolved.y,
          scaleX: resolved.scaleX,
          scaleY: resolved.scaleY,
          labelX: resolved.labelX,
          labelY: resolved.labelY,
        }]
      })),
    ])),
  ]),
) as CompleteCityLayoutPlacements

export const isCompleteCityLayout = (placements: unknown): placements is CompleteCityLayoutPlacements => {
  if (!placements || typeof placements !== 'object') return false
  if (Object.keys(placements).length !== Object.keys(CITY_SCENE_PROFILES).length) return false
  return (Object.keys(CITY_SCENE_PROFILES) as CitySceneProfileId[]).every((scene) => {
    const sceneValue = (placements as Record<string, unknown>)[scene]
    if (!sceneValue || typeof sceneValue !== 'object' || Object.keys(sceneValue).length !== BUILDING_IDS.length) return false
    return BUILDING_IDS.every((building) => {
      const buildingValue = (sceneValue as Record<string, unknown>)[building]
      if (!buildingValue || typeof buildingValue !== 'object' || Object.keys(buildingValue).length !== ALL_BUILDING_LEVELS.length) return false
      return ALL_BUILDING_LEVELS.every((level) =>
        isSaneCityLayoutPlacement((buildingValue as Record<string, unknown>)[String(level)])
        && isSaneCityLayoutLabelPlacement((buildingValue as Record<string, unknown>)[String(level)]))
    })
  })
}

const isCompleteLegacyCityLayout = (placements: unknown): placements is Record<CitySceneProfileId, Record<BuildingId, Record<BuildingLevel, CitySceneBuildingPlacement>>> => {
  if (!placements || typeof placements !== 'object') return false
  if (Object.keys(placements).length !== Object.keys(CITY_SCENE_PROFILES).length) return false
  return (Object.keys(CITY_SCENE_PROFILES) as CitySceneProfileId[]).every((scene) => {
    const sceneValue = (placements as Record<string, unknown>)[scene]
    if (!sceneValue || typeof sceneValue !== 'object' || Object.keys(sceneValue).length !== BUILDING_IDS.length) return false
    return BUILDING_IDS.every((building) => {
      const buildingValue = (sceneValue as Record<string, unknown>)[building]
      return Boolean(buildingValue && typeof buildingValue === 'object'
        && Object.keys(buildingValue).length === ALL_BUILDING_LEVELS.length
        && ALL_BUILDING_LEVELS.every((level) =>
          isSaneCityLayoutPlacement((buildingValue as Record<string, unknown>)[String(level)])))
    })
  })
}

const hydrateLegacyCityLayout = (
  placements: Record<CitySceneProfileId, Record<BuildingId, Record<BuildingLevel, CitySceneBuildingPlacement>>>,
): CompleteCityLayoutPlacements => Object.fromEntries(
  (Object.keys(CITY_SCENE_PROFILES) as CitySceneProfileId[]).map((scene) => [
    scene,
    Object.fromEntries(BUILDING_IDS.map((building) => [
      building,
      Object.fromEntries(ALL_BUILDING_LEVELS.map((level) => {
        const placement = placements[scene][building][level]
        return [level, { ...placement, ...deriveLegacyBuildingLabelPlacement(building, placement) }]
      })),
    ])),
  ]),
) as CompleteCityLayoutPlacements

const timestampMillis = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    const millis = (value as { toMillis(): number }).toMillis()
    return Number.isFinite(millis) ? millis : null
  }
  return null
}

export const parseCityLayoutPublishedSnapshot = (value: unknown): CityLayoutPublishedSnapshot | null => {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  const publishedAt = timestampMillis(data.publishedAt)
  if (typeof data.versionId !== 'string'
    || data.versionId.length === 0
    || publishedAt === null) return null
  const placements = data.schemaVersion === CITY_LAYOUT_SCHEMA_VERSION && isCompleteCityLayout(data.placements)
    ? data.placements
    : data.schemaVersion === LEGACY_CITY_LAYOUT_SCHEMA_VERSION && isCompleteLegacyCityLayout(data.placements)
      ? hydrateLegacyCityLayout(data.placements)
      : null
  if (!placements) return null
  return {
    schemaVersion: CITY_LAYOUT_SCHEMA_VERSION,
    versionId: data.versionId,
    placements,
    publishedAt,
  }
}

export const draftRecordsToOverrides = (records: readonly CityLayoutDraftRecord[]): CityLayoutOverrides =>
  records.filter(isModelCityLayoutDraftRecord).reduce<CityLayoutOverrides>((overrides, record) =>
    setLayoutPlacement(overrides, record.scene, record.building, record.level, {
      x: record.x,
      y: record.y,
      scaleX: record.scaleX,
      scaleY: record.scaleY,
    }), {})

export const draftRecordsToLabelOverrides = (records: readonly CityLayoutDraftRecord[]): CityLabelLayoutOverrides =>
  records.filter(isLabelCityLayoutDraftRecord).reduce<CityLabelLayoutOverrides>((overrides, record) =>
    setLabelLayoutPlacement(overrides, record.scene, record.building, record.level, {
      labelX: record.labelX,
      labelY: record.labelY,
    }), {})

export const overridesToDraftRecords = (overrides: CityLayoutOverrides, updatedAt = Date.now()): CityLayoutDraftRecord[] =>
  (Object.keys(CITY_SCENE_PROFILES) as CitySceneProfileId[]).flatMap((scene) =>
    BUILDING_IDS.flatMap((building) =>
      ALL_BUILDING_LEVELS.flatMap((level) => {
        const placement = overrides[scene]?.[building]?.[level]
        return placement && isSaneCityLayoutPlacement(placement)
          ? [{ scene, building, level, ...placement, updatedAt }]
          : []
      }),
    ),
  )

export const labelOverridesToDraftRecords = (
  overrides: CityLabelLayoutOverrides,
  updatedAt = Date.now(),
): CityLayoutLabelDraftRecord[] => (Object.keys(CITY_SCENE_PROFILES) as CitySceneProfileId[]).flatMap((scene) =>
  BUILDING_IDS.flatMap((building) =>
    ALL_BUILDING_LEVELS.flatMap((level) => {
      const placement = overrides[scene]?.[building]?.[level]
      return placement && isSaneCityLayoutLabelPlacement(placement)
        ? [{ scene, building, level, ...placement, updatedAt }]
        : []
    })))

export const countCityLayoutDraftPlacements = (draft: CityLayoutOverrides): number =>
  (Object.keys(CITY_SCENE_PROFILES) as CitySceneProfileId[]).reduce((count, scene) =>
    count + BUILDING_IDS.reduce((buildingCount, building) =>
      buildingCount + ALL_BUILDING_LEVELS.filter((level) => draft[scene]?.[building]?.[level]).length,
    0), 0)

export const countCityLayoutDraftLabels = (draft: CityLabelLayoutOverrides): number =>
  (Object.keys(CITY_SCENE_PROFILES) as CitySceneProfileId[]).reduce((count, scene) =>
    count + BUILDING_IDS.reduce((buildingCount, building) =>
      buildingCount + ALL_BUILDING_LEVELS.filter((level) => draft[scene]?.[building]?.[level]).length,
    0), 0)
