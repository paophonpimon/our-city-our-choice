import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BUILDING_IDS,
  CITY_SCENE_PROFILES,
  resolveBuildingAsset,
  resolveFrozenBuildingPlacement,
  type BuildingId,
  type BuildingLevel,
  type CitySceneProfileId,
} from './cityBuildings'
import {
  CITY_LAYOUT_STORAGE_KEY,
  CITY_LAYOUT_STORAGE_KEY_V1,
  clearLayoutPlacement,
  clearLayoutScene,
  exportAllEffectivePlacements,
  getLayoutPlacement,
  migrateCityLayoutOverridesV1,
  parseCityLayoutOverridesV2,
  readCityLayoutOverrides,
  resolveEffectivePlacement,
  setLayoutPlacement,
  writeCityLayoutOverrides,
  type CityLayoutOverrides,
  type StorageLike,
} from './cityLayoutOverrides'

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>()
  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
  removeItem(key: string): void {
    this.values.delete(key)
  }
}

const HOSPITAL_LV1 = { x: 1.5, y: -2, scaleX: 1.01, scaleY: .99 }
const HOSPITAL_LV2 = { x: 8, y: -6, scaleX: 1.05, scaleY: .95 }

describe('calibration override serialization (v2)', () => {
  it('round-trips a scene/building/level override through write and read', () => {
    const storage = new MemoryStorage()
    const overrides = setLayoutPlacement({}, 'normal', 'hospital', 1, HOSPITAL_LV1)

    writeCityLayoutOverrides(overrides, storage)
    const restored = readCityLayoutOverrides(storage)

    expect(restored).toEqual(overrides)
    expect(getLayoutPlacement(restored, 'normal', 'hospital', 1)).toEqual(HOSPITAL_LV1)
  })

  it('drops malformed entries instead of throwing', () => {
    expect(parseCityLayoutOverridesV2('{not json')).toEqual({})
    expect(parseCityLayoutOverridesV2('null')).toEqual({})
    expect(parseCityLayoutOverridesV2('42')).toEqual({})
    expect(parseCityLayoutOverridesV2(JSON.stringify({
      normal: {
        hospital: {
          1: { x: 1, y: 2, scaleX: 1, scaleY: 1 }, // valid
          9: { x: 1, y: 2, scaleX: 1, scaleY: 1 }, // out-of-range level, dropped
          '-1': { x: 'not-a-number' }, // malformed placement, dropped
        },
        'not-a-building': { 0: { x: 1, y: 2, scaleX: 1, scaleY: 1 } }, // unknown building, dropped
      },
      'not-a-scene': { hospital: { 0: { x: 1, y: 2, scaleX: 1, scaleY: 1 } } }, // unknown scene, dropped
    }))).toEqual({
      normal: { hospital: { 1: { x: 1, y: 2, scaleX: 1, scaleY: 1 } } },
    })
  })

  it('falls back to the frozen production default when nothing is calibrated for a level', () => {
    const overrides: CityLayoutOverrides = {}
    expect(getLayoutPlacement(overrides, 'degraded', 'market', -2))
      .toEqual(resolveFrozenBuildingPlacement('degraded', 'market', -2))
  })
})

describe('v1 -> v2 migration', () => {
  it('duplicates a legacy scene/building placement as the initial value for all 5 model levels, since v1 cannot tell us which one the user was viewing', () => {
    const v1 = JSON.stringify({
      normal: { hospital: { x: 3, y: -4, scaleX: 1.02, scaleY: .98 } },
    })
    const migrated = migrateCityLayoutOverridesV1(v1)
    const expectedPlacement = { x: 3, y: -4, scaleX: 1.02, scaleY: .98 }
    expect(migrated).toEqual({
      normal: {
        hospital: {
          [-2]: expectedPlacement,
          [-1]: expectedPlacement,
          0: expectedPlacement,
          1: expectedPlacement,
          2: expectedPlacement,
        },
      },
    })
  })

  it('produces 5 independent records, not 5 references sharing later edits', () => {
    const v1 = JSON.stringify({
      normal: { hospital: { x: 3, y: -4, scaleX: 1.02, scaleY: .98 } },
    })
    let overrides = migrateCityLayoutOverridesV1(v1)

    // Editing one level right after migration must never touch the other 4.
    overrides = setLayoutPlacement(overrides, 'normal', 'hospital', 2, HOSPITAL_LV2)

    expect(getLayoutPlacement(overrides, 'normal', 'hospital', 2)).toEqual(HOSPITAL_LV2)
    for (const untouchedLevel of [-2, -1, 0, 1] as const) {
      expect(getLayoutPlacement(overrides, 'normal', 'hospital', untouchedLevel))
        .toEqual({ x: 3, y: -4, scaleX: 1.02, scaleY: .98 })
    }
  })

  it('never throws on corrupt v1 data and yields an empty override set instead', () => {
    expect(migrateCityLayoutOverridesV1('{not json')).toEqual({})
    expect(migrateCityLayoutOverridesV1('[]')).toEqual({})
  })

  it('reads v1 automatically when no v2 value has been saved yet, without deleting the v1 key', () => {
    const storage = new MemoryStorage()
    storage.setItem(CITY_LAYOUT_STORAGE_KEY_V1, JSON.stringify({
      degraded: { school: { x: -10, y: 5, scaleX: 1, scaleY: 1 } },
    }))

    const overrides = readCityLayoutOverrides(storage)

    const expectedPlacement = { x: -10, y: 5, scaleX: 1, scaleY: 1 }
    expect(overrides).toEqual({
      degraded: {
        school: {
          [-2]: expectedPlacement,
          [-1]: expectedPlacement,
          0: expectedPlacement,
          1: expectedPlacement,
          2: expectedPlacement,
        },
      },
    })
    // The original v1 value must never be silently discarded.
    expect(storage.getItem(CITY_LAYOUT_STORAGE_KEY_V1)).not.toBeNull()
  })

  it('prefers v2 once it exists and stops reading v1, even if v1 still has data', () => {
    const storage = new MemoryStorage()
    storage.setItem(CITY_LAYOUT_STORAGE_KEY_V1, JSON.stringify({
      normal: { hospital: { x: 999, y: 999, scaleX: 1, scaleY: 1 } },
    }))
    storage.setItem(CITY_LAYOUT_STORAGE_KEY, JSON.stringify({
      normal: { hospital: { 2: HOSPITAL_LV2 } },
    }))

    const overrides = readCityLayoutOverrides(storage)

    // v1 is never even consulted once v2 exists - the migration must not re-run.
    expect(overrides).toEqual({ normal: { hospital: { 2: HOSPITAL_LV2 } } })
  })

  it('returns an empty override set when neither v1 nor v2 has ever been saved', () => {
    expect(readCityLayoutOverrides(new MemoryStorage())).toEqual({})
  })
})

describe('per-level and per-scene isolation', () => {
  it('lets two model levels of the same building in the same scene hold independent placements', () => {
    let overrides: CityLayoutOverrides = {}
    overrides = setLayoutPlacement(overrides, 'normal', 'hospital', 1, HOSPITAL_LV1)
    overrides = setLayoutPlacement(overrides, 'normal', 'hospital', 2, HOSPITAL_LV2)

    expect(getLayoutPlacement(overrides, 'normal', 'hospital', 1)).toEqual(HOSPITAL_LV1)
    expect(getLayoutPlacement(overrides, 'normal', 'hospital', 2)).toEqual(HOSPITAL_LV2)
  })

  it('reproduces the reported bug scenario as a regression: calibrating Lv+2 must not move the already-aligned Lv+1', () => {
    let overrides: CityLayoutOverrides = {}
    overrides = setLayoutPlacement(overrides, 'normal', 'hospital', 1, HOSPITAL_LV1)
    // Switch to Lv+2 and adjust it - this must not touch Lv+1's saved value.
    overrides = setLayoutPlacement(overrides, 'normal', 'hospital', 2, HOSPITAL_LV2)
    // Switch back to Lv+1.
    expect(getLayoutPlacement(overrides, 'normal', 'hospital', 1)).toEqual(HOSPITAL_LV1)
  })

  it('keeps the same building/level calibrated independently per scene', () => {
    let overrides: CityLayoutOverrides = {}
    overrides = setLayoutPlacement(overrides, 'normal', 'hospital', 2, HOSPITAL_LV2)
    overrides = setLayoutPlacement(overrides, 'degraded', 'hospital', 2, { x: -1, y: -1, scaleX: 1, scaleY: 1 })

    expect(getLayoutPlacement(overrides, 'normal', 'hospital', 2)).toEqual(HOSPITAL_LV2)
    expect(getLayoutPlacement(overrides, 'degraded', 'hospital', 2)).toEqual({ x: -1, y: -1, scaleX: 1, scaleY: 1 })
  })

  it('does not let editing one building leak into a different building at the same level', () => {
    let overrides: CityLayoutOverrides = {}
    overrides = setLayoutPlacement(overrides, 'normal', 'hospital', 2, HOSPITAL_LV2)

    expect(getLayoutPlacement(overrides, 'normal', 'market', 2))
      .toEqual(resolveFrozenBuildingPlacement('normal', 'market', 2))
  })

  it('clearLayoutPlacement removes only the targeted scene/building/level', () => {
    let overrides: CityLayoutOverrides = {}
    overrides = setLayoutPlacement(overrides, 'normal', 'hospital', 1, HOSPITAL_LV1)
    overrides = setLayoutPlacement(overrides, 'normal', 'hospital', 2, HOSPITAL_LV2)
    overrides = setLayoutPlacement(overrides, 'degraded', 'hospital', 2, { x: -1, y: -1, scaleX: 1, scaleY: 1 })

    const cleared = clearLayoutPlacement(overrides, 'normal', 'hospital', 2)

    expect(getLayoutPlacement(cleared, 'normal', 'hospital', 2))
      .toEqual(resolveFrozenBuildingPlacement('normal', 'hospital', 2))
    expect(getLayoutPlacement(cleared, 'normal', 'hospital', 1)).toEqual(HOSPITAL_LV1)
    expect(getLayoutPlacement(cleared, 'degraded', 'hospital', 2)).toEqual({ x: -1, y: -1, scaleX: 1, scaleY: 1 })
  })

  it('clearLayoutPlacement is a no-op when nothing was saved for that slot', () => {
    const overrides = setLayoutPlacement({}, 'normal', 'hospital', 1, HOSPITAL_LV1)
    const cleared = clearLayoutPlacement(overrides, 'normal', 'hospital', 2)
    expect(cleared).toEqual(overrides)
  })

  it('clearLayoutScene wipes every building and every level for one scene only', () => {
    let overrides: CityLayoutOverrides = {}
    overrides = setLayoutPlacement(overrides, 'normal', 'hospital', 1, HOSPITAL_LV1)
    overrides = setLayoutPlacement(overrides, 'normal', 'hospital', 2, HOSPITAL_LV2)
    overrides = setLayoutPlacement(overrides, 'normal', 'market', -2, { x: 4, y: 4, scaleX: 1, scaleY: 1 })
    overrides = setLayoutPlacement(overrides, 'degraded', 'hospital', 2, { x: -1, y: -1, scaleX: 1, scaleY: 1 })

    const cleared = clearLayoutScene(overrides, 'normal')

    expect(cleared.normal).toBeUndefined()
    expect(getLayoutPlacement(cleared, 'degraded', 'hospital', 2)).toEqual({ x: -1, y: -1, scaleX: 1, scaleY: 1 })
  })
})

const ALL_LEVELS = [-2, -1, 0, 1, 2] as const

describe('resolveEffectivePlacement (recovery/export source of truth)', () => {
  it('returns the saved v2 override untouched when one exists for this exact scene/building/level', () => {
    const overrides = setLayoutPlacement({}, 'normal', 'hospital', 2, HOSPITAL_LV2)
    const record = resolveEffectivePlacement(overrides.normal, 'normal', 'hospital', 2)

    expect(record).toEqual({ scene: 'normal', building: 'hospital', level: 2, ...HOSPITAL_LV2, source: 'override' })
  })

  it('falls back to the frozen production default with no further math applied, for a non-slice level (-2/-1/2)', () => {
    expect(resolveBuildingAsset('hospital', -2)?.fit).not.toBe('slice')
    const record = resolveEffectivePlacement(undefined, 'degraded', 'hospital', -2)
    const frozen = resolveFrozenBuildingPlacement('degraded', 'hospital', -2)

    expect(record).toEqual({ scene: 'degraded', building: 'hospital', level: -2, ...frozen, source: 'fallback' })
  })

  it('falls back to the frozen production default with no further math applied, for a slice-fit level too (0/1) - the old scene-to-normal delta formula is gone entirely', () => {
    expect(resolveBuildingAsset('hospital', 0)?.fit).toBe('slice')
    const record = resolveEffectivePlacement(undefined, 'degraded', 'hospital', 0)
    const frozen = resolveFrozenBuildingPlacement('degraded', 'hospital', 0)

    expect(record).toEqual({ scene: 'degraded', building: 'hospital', level: 0, ...frozen, source: 'fallback' })
    // The frozen default already IS the final result - it must not equal the
    // raw scene/building base minus/divided by the normal scene (the old,
    // now-removed, double-applying formula) unless they happen to coincide.
  })

  it('an override always wins over the frozen default, regardless of asset fit', () => {
    const overrides = setLayoutPlacement({}, 'degraded', 'hospital', 1, HOSPITAL_LV1)
    const record = resolveEffectivePlacement(overrides.degraded, 'degraded', 'hospital', 1)

    expect(record).toEqual({ scene: 'degraded', building: 'hospital', level: 1, ...HOSPITAL_LV1, source: 'override' })
  })

  it('never writes to storage - it only reads the overrides object passed in', () => {
    const overrides = setLayoutPlacement({}, 'normal', 'hospital', 2, HOSPITAL_LV2)
    const before = JSON.stringify(overrides)
    resolveEffectivePlacement(overrides.normal, 'normal', 'hospital', 2)
    resolveEffectivePlacement(overrides.normal, 'normal', 'market', -1)
    expect(JSON.stringify(overrides)).toBe(before)
  })
})

describe('exportAllEffectivePlacements (105-combination recovery export)', () => {
  it('exports exactly 3 scenes x 7 buildings x 5 levels = 105 records', () => {
    expect(BUILDING_IDS).toHaveLength(7)
    const records = exportAllEffectivePlacements({})
    expect(records).toHaveLength(105)
  })

  it('covers every scene/building/level combination exactly once', () => {
    const records = exportAllEffectivePlacements({})
    const keys = new Set(records.map((record) => `${record.scene}::${record.building}::${record.level}`))
    expect(keys.size).toBe(105)
    for (const sceneId of Object.keys(CITY_SCENE_PROFILES) as (keyof typeof CITY_SCENE_PROFILES)[]) {
      for (const buildingId of BUILDING_IDS) {
        for (const level of ALL_LEVELS) {
          expect(keys.has(`${sceneId}::${buildingId}::${level}`)).toBe(true)
        }
      }
    }
  })

  it('reflects saved overrides for the combinations that have them, and fallback for every other combination', () => {
    let overrides: CityLayoutOverrides = {}
    overrides = setLayoutPlacement(overrides, 'normal', 'hospital', 2, HOSPITAL_LV2)
    overrides = setLayoutPlacement(overrides, 'degraded', 'market', -1, HOSPITAL_LV1)

    const records = exportAllEffectivePlacements(overrides)
    const overrideRecords = records.filter((record) => record.source === 'override')

    expect(overrideRecords).toHaveLength(2)
    expect(overrideRecords.find((record) => record.scene === 'normal' && record.building === 'hospital' && record.level === 2))
      .toMatchObject(HOSPITAL_LV2)
    expect(overrideRecords.find((record) => record.scene === 'degraded' && record.building === 'market' && record.level === -1))
      .toMatchObject(HOSPITAL_LV1)
    expect(records.filter((record) => record.source === 'fallback')).toHaveLength(103)
  })

  it('is a pure, read-only computation: exporting twice never mutates the overrides and always agrees with itself', () => {
    const overrides = setLayoutPlacement({}, 'normal', 'hospital', 2, HOSPITAL_LV2)
    const before = JSON.stringify(overrides)

    const first = exportAllEffectivePlacements(overrides)
    const second = exportAllEffectivePlacements(overrides)

    expect(JSON.stringify(overrides)).toBe(before)
    expect(second).toEqual(first)
  })

  it('never writes anything to storage - it has no storage parameter at all', () => {
    const storage = new MemoryStorage()
    exportAllEffectivePlacements(setLayoutPlacement({}, 'normal', 'hospital', 2, HOSPITAL_LV2))
    expect(storage.getItem(CITY_LAYOUT_STORAGE_KEY)).toBeNull()
    expect(storage.getItem(CITY_LAYOUT_STORAGE_KEY_V1)).toBeNull()
  })
})

interface SnapshotRecord {
  scene: CitySceneProfileId
  building: BuildingId
  level: BuildingLevel
  x: number
  y: number
  scaleX: number
  scaleY: number
  source: 'override' | 'fallback'
}

const SNAPSHOT_PATH = new URL('../../city-layout-effective-105.json', import.meta.url)
const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as SnapshotRecord[]

describe('city-layout-effective-105.json is frozen into the production defaults exactly', () => {
  it('the snapshot itself contains exactly 105 records with unique scene/building/level keys', () => {
    expect(snapshot).toHaveLength(105)
    const keys = new Set(snapshot.map((record) => `${record.scene}::${record.building}::${record.level}`))
    expect(keys.size).toBe(105)
  })

  it('the production resolver returns the exact x/y/scaleX/scaleY snapshot value for every one of the 105 records, with no local override present', () => {
    for (const record of snapshot) {
      const resolved = resolveEffectivePlacement(undefined, record.scene, record.building, record.level)
      expect(resolved.x).toBe(record.x)
      expect(resolved.y).toBe(record.y)
      expect(resolved.scaleX).toBe(record.scaleX)
      expect(resolved.scaleY).toBe(record.scaleY)
      expect(resolved.source).toBe('fallback')
    }
  })

  it('resolveFrozenBuildingPlacement (the production default table itself) also matches every snapshot record exactly', () => {
    for (const record of snapshot) {
      expect(resolveFrozenBuildingPlacement(record.scene, record.building, record.level)).toEqual({
        x: record.x, y: record.y, scaleX: record.scaleX, scaleY: record.scaleY,
      })
    }
  })

  it('a calibration override wins over the frozen default only for its own exact scene/building/level - every other one of the 105 combinations is unaffected', () => {
    const sample = snapshot[42]
    const customPlacement = { x: 12345, y: 6789, scaleX: 2, scaleY: 3 }
    const overrides = setLayoutPlacement({}, sample.scene, sample.building, sample.level, customPlacement)

    expect(getLayoutPlacement(overrides, sample.scene, sample.building, sample.level)).toEqual(customPlacement)

    for (const record of snapshot) {
      if (record.scene === sample.scene && record.building === sample.building && record.level === sample.level) continue
      expect(getLayoutPlacement(overrides, record.scene, record.building, record.level)).toEqual({
        x: record.x, y: record.y, scaleX: record.scaleX, scaleY: record.scaleY,
      })
    }
  })
})
