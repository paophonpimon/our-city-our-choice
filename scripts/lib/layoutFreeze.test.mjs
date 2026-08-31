import { describe, expect, it } from 'vitest'
import {
  FROZEN_TABLE_END,
  FROZEN_TABLE_START,
  LAYOUT_BUILDINGS,
  LAYOUT_LEVELS,
  LAYOUT_SCENES,
  formatFrozenPlacementTable,
  freezeCityBuildingsSource,
  validateStagingPublishedLayout,
} from './layoutFreeze.mjs'

const completeSnapshot = (schemaVersion = 2) => ({
  schemaVersion,
  versionId: 'staging-version-1',
  placements: Object.fromEntries(LAYOUT_SCENES.map((scene, sceneIndex) => [
    scene,
    Object.fromEntries(LAYOUT_BUILDINGS.map((building, buildingIndex) => [
      building,
      Object.fromEntries(LAYOUT_LEVELS.map((level) => [String(level), {
        x: sceneIndex * 100 + buildingIndex * 10 + level,
        y: level * 2,
        scaleX: 1,
        scaleY: 1,
        ...(schemaVersion === 2 ? {
          labelX: sceneIndex * 100 + buildingIndex * 10 + level + .25,
          labelY: level * 2 + .5,
        } : {}),
      }])),
    ])),
  ])),
})

describe('staging layout freeze', () => {
  it('rejects missing and incomplete Published data', () => {
    expect(() => validateStagingPublishedLayout(null)).toThrow('missing')
    const incomplete = completeSnapshot()
    delete incomplete.placements.normal.hospital['2']
    expect(() => validateStagingPublishedLayout(incomplete)).toThrow('exactly levels')
  })

  it('rejects a malformed or unsafe placement', () => {
    const unsafe = completeSnapshot()
    unsafe.placements.developed.school['1'].scaleX = 99
    expect(() => validateStagingPublishedLayout(unsafe)).toThrow('Invalid placement')
  })

  it('validates exactly 3 x 7 x 5 = 105 unique placements', () => {
    const validated = validateStagingPublishedLayout(completeSnapshot())
    expect(validated.count).toBe(105)
    expect(Object.keys(validated.placements)).toEqual(LAYOUT_SCENES)
  })

  it('formats all 105 placements deterministically', () => {
    const validated = validateStagingPublishedLayout(completeSnapshot())
    const first = formatFrozenPlacementTable(validated.placements)
    const second = formatFrozenPlacementTable(validated.placements)
    expect(second).toBe(first)
    expect((first.match(/scaleX:/g) ?? [])).toHaveLength(105)
    expect((first.match(/labelX:/g) ?? [])).toHaveLength(105)
    expect(first.indexOf('degraded:')).toBeLessThan(first.indexOf('normal:'))
    expect(first.indexOf('normal:')).toBeLessThan(first.indexOf('developed:'))
  })

  it('replaces only the marked authoritative frozen table', () => {
    const validated = validateStagingPublishedLayout(completeSnapshot())
    const source = `before\n${FROZEN_TABLE_START}\nold table\n${FROZEN_TABLE_END}\nafter\n`
    const frozen = freezeCityBuildingsSource(source, validated)
    expect(frozen.startsWith('before\n')).toBe(true)
    expect(frozen.endsWith('after\n')).toBe(true)
    expect(frozen).not.toContain('old table')
    expect((frozen.match(/scaleX:/g) ?? [])).toHaveLength(105)
    expect((frozen.match(/labelX:/g) ?? [])).toHaveLength(105)
  })

  it('hydrates legacy Published snapshots with the existing deterministic label positions', () => {
    const validated = validateStagingPublishedLayout(completeSnapshot(1))
    expect(validated.placements.normal.hospital[0]).toMatchObject({
      x: 110,
      labelX: 110 + 31 / 100 * 1189.9199,
      labelY: 66 / 100 * 705.749994,
    })
  })
})
