export const LAYOUT_SCENES = Object.freeze(['degraded', 'normal', 'developed'])
export const LAYOUT_BUILDINGS = Object.freeze([
  'municipality', 'hospital', 'police', 'construction', 'market', 'school', 'newsAgency',
])
export const LAYOUT_LEVELS = Object.freeze([-2, -1, 0, 1, 2])
export const LAYOUT_PLACEMENT_COUNT = 105
export const CITY_STAGE_WIDTH = 1189.9199
export const CITY_STAGE_HEIGHT = 705.749994
export const LEGACY_LABEL_ANCHORS = Object.freeze({
  municipality: { x: 50, y: 89 },
  hospital: { x: 31, y: 66 },
  police: { x: 65, y: 61 },
  construction: { x: 65, y: 19 },
  market: { x: 83, y: 43 },
  school: { x: 31, y: 29 },
  newsAgency: { x: 81, y: 79 },
})

export const FROZEN_TABLE_START = '// CITY LAYOUT FROZEN TABLE START'
export const FROZEN_TABLE_END = '// CITY LAYOUT FROZEN TABLE END'

const exactKeys = (value, expected) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value).sort()
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index])
}

const saneModelPlacement = (value, expectedKeys) => value
  && typeof value === 'object'
  && ['x', 'y', 'scaleX', 'scaleY'].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))
  && exactKeys(value, expectedKeys)
  && Math.abs(value.x) <= 2_000
  && Math.abs(value.y) <= 2_000
  && value.scaleX >= 0.05
  && value.scaleX <= 10
  && value.scaleY >= 0.05
  && value.scaleY <= 10

const saneLabelPlacement = (value) => typeof value.labelX === 'number'
  && Number.isFinite(value.labelX)
  && typeof value.labelY === 'number'
  && Number.isFinite(value.labelY)
  && Math.abs(value.labelX) <= 2_000
  && Math.abs(value.labelY) <= 2_000

const deriveLegacyLabelPlacement = (building, placement) => ({
  labelX: placement.x + LEGACY_LABEL_ANCHORS[building].x / 100 * CITY_STAGE_WIDTH * placement.scaleX,
  labelY: placement.y + LEGACY_LABEL_ANCHORS[building].y / 100 * CITY_STAGE_HEIGHT * placement.scaleY,
})

export const validateStagingPublishedLayout = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('Staging Published layout is missing')
  if (snapshot.schemaVersion !== 1 && snapshot.schemaVersion !== 2) {
    throw new Error('Staging Published layout has an unsupported schemaVersion')
  }
  if (typeof snapshot.versionId !== 'string' || snapshot.versionId.length === 0) {
    throw new Error('Staging Published layout has no versionId')
  }
  if (!exactKeys(snapshot.placements, LAYOUT_SCENES)) {
    throw new Error('Staging Published layout must contain exactly 3 scenes')
  }

  const placements = {}
  let count = 0
  for (const scene of LAYOUT_SCENES) {
    const sceneValue = snapshot.placements[scene]
    if (!exactKeys(sceneValue, LAYOUT_BUILDINGS)) {
      throw new Error(`Scene ${scene} must contain exactly 7 buildings`)
    }
    placements[scene] = {}
    for (const building of LAYOUT_BUILDINGS) {
      const levels = sceneValue[building]
      if (!exactKeys(levels, LAYOUT_LEVELS.map(String))) {
        throw new Error(`${scene}/${building} must contain exactly levels -2,-1,0,1,2`)
      }
      placements[scene][building] = {}
      for (const level of LAYOUT_LEVELS) {
        const placement = levels[String(level)]
        const isCurrentSchema = snapshot.schemaVersion === 2
        const expectedKeys = isCurrentSchema
          ? ['x', 'y', 'scaleX', 'scaleY', 'labelX', 'labelY']
          : ['x', 'y', 'scaleX', 'scaleY']
        if (!saneModelPlacement(placement, expectedKeys)
          || (isCurrentSchema && !saneLabelPlacement(placement))) {
          throw new Error(`Invalid placement at ${scene}/${building}/${level}`)
        }
        const labelPlacement = isCurrentSchema ? {
          labelX: placement.labelX,
          labelY: placement.labelY,
        } : deriveLegacyLabelPlacement(building, placement)
        placements[scene][building][level] = {
          x: placement.x,
          y: placement.y,
          scaleX: placement.scaleX,
          scaleY: placement.scaleY,
          ...labelPlacement,
        }
        count += 1
      }
    }
  }
  if (count !== LAYOUT_PLACEMENT_COUNT) throw new Error(`Expected 105 placements, received ${count}`)
  return { versionId: snapshot.versionId, placements, count }
}

const numberText = (value) => Object.is(value, -0) ? '0' : String(value)

export const formatFrozenPlacementTable = (placements) => {
  const lines = [
    'export const CITY_SCENE_BUILDING_PLACEMENTS: Record<',
    '  CitySceneProfileId,',
    '  Record<BuildingId, Record<BuildingLevel, CitySceneFrozenPlacement>>',
    '> = {',
  ]
  for (const scene of LAYOUT_SCENES) {
    lines.push(`  ${scene}: {`)
    for (const building of LAYOUT_BUILDINGS) {
      lines.push(`    ${building}: {`)
      for (const level of LAYOUT_LEVELS) {
        const placement = placements[scene][building][level]
        lines.push(
          `      ${level < 0 ? `[${level}]` : level}: { x: ${numberText(placement.x)}, y: ${numberText(placement.y)}, ` +
          `scaleX: ${numberText(placement.scaleX)}, scaleY: ${numberText(placement.scaleY)}, ` +
          `labelX: ${numberText(placement.labelX)}, labelY: ${numberText(placement.labelY)} },`,
        )
      }
      lines.push('    },')
    }
    lines.push('  },')
  }
  lines.push('}')
  return lines.join('\n')
}

export const freezeCityBuildingsSource = (source, validated) => {
  const start = source.indexOf(FROZEN_TABLE_START)
  const endStart = source.indexOf(FROZEN_TABLE_END)
  if (start === -1 || endStart === -1 || endStart <= start) {
    throw new Error('cityBuildings.ts is missing frozen-table markers')
  }
  const end = endStart + FROZEN_TABLE_END.length
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const replacement = `${FROZEN_TABLE_START}\n${formatFrozenPlacementTable(validated.placements)}\n${FROZEN_TABLE_END}`
    .replaceAll('\n', newline)
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}
