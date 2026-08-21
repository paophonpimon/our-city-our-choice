import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CityScene } from '../components/CityScene'
import type { LocationId, LocationSummary } from './cityScoring'
import {
  BUILDING_ASSETS,
  BUILDING_IDS,
  BUILDING_LOCATION,
  BUILDING_SCORE_POLICY,
  CITY_SCENE_PROFILES,
  CITY_OVERVIEW_ASSET,
  DEGRADED_CITY_OVERVIEW_ASSET,
  DEVELOPED_CITY_OVERVIEW_ASSET,
  CITY_STAGE_HEIGHT,
  CITY_STAGE_WIDTH,
  clampBuildingScore,
  deriveBuildingLevels,
  getBuildingLevelFromScore,
  INITIAL_BUILDING_LEVELS,
  INITIAL_BUILDING_SCORES,
  LOCATION_BUILDING,
  normalizeBuildingScores,
  resolveBuildingAssetPlacement,
  resolveCitySceneProfile,
  setBuildingLevel,
  updateBuildingScores,
  type BuildingLevels,
} from './cityBuildings'

const summary = (scoreAverage: number, participantCount = 1): LocationSummary => ({
  integrityCount: scoreAverage > 0 ? 1 : 0,
  corruptionCount: scoreAverage < 0 ? 1 : 0,
  timeoutCount: 0,
  participantCount,
  scoreTotal: scoreAverage * participantCount,
  scoreAverage,
})

const summaries = (impact: number): Record<LocationId, LocationSummary> => ({
  hospital: summary(impact),
  'municipal-office': summary(impact),
  'police-station': summary(impact),
  school: summary(impact),
  market: summary(impact),
  construction: summary(impact),
  'news-office': summary(impact),
})

describe('independent city building scene', () => {
  it('starts all seven buildings at Level 0 on the supplied overview stage', () => {
    const markup = renderToStaticMarkup(<CityScene buildingLevels={INITIAL_BUILDING_LEVELS} />)
    expect(BUILDING_IDS).toHaveLength(7)
    expect(markup).toContain(`viewBox="0 0 ${CITY_STAGE_WIDTH} ${CITY_STAGE_HEIGHT}"`)
    expect(markup).toContain(`data-stage-width="${CITY_STAGE_WIDTH}"`)
    expect(markup).toContain(`data-stage-height="${CITY_STAGE_HEIGHT}"`)
    expect(markup).toContain(CITY_OVERVIEW_ASSET)
    expect(markup).toContain('data-city-scene="normal"')
    expect(markup).toContain('preserveAspectRatio="xMidYMid slice"')
    for (const buildingId of BUILDING_IDS) {
      expect(markup).toContain(`data-building-id="${buildingId}"`)
      expect(markup).toContain(`data-building-id="${buildingId}" data-building-level="0" data-asset-level="0"`)
      expect(BUILDING_ASSETS[buildingId][0]?.src).toMatch(/level-0\.png$/)
      expect(markup).toContain(BUILDING_ASSETS[buildingId][0]?.src)
      expect(BUILDING_ASSETS[buildingId][-1]?.src).toMatch(/level-minus-1\.png$/)
    }
    expect(markup).not.toMatch(/lv3|composer|grid|save layout|load layout/i)
  })

  it('uses the supplied minus-one model and keeps other buildings at zero', () => {
    const changed = setBuildingLevel(INITIAL_BUILDING_LEVELS, 'school', -1)
    expect(changed.school).toBe(-1)
    for (const buildingId of BUILDING_IDS.filter((id) => id !== 'school')) {
      expect(changed[buildingId]).toBe(0)
    }

    const markup = renderToStaticMarkup(<CityScene buildingLevels={changed} />)
    expect(markup).toContain('data-building-id="school" data-building-level="-1" data-asset-level="-1"')
    expect(markup).toContain('/images/new-city/buildings/school/school-level-minus-1.png')
  })

  it('does not make unrelated buildings structural variants when only the hospital declines', () => {
    const hospitalOnly = setBuildingLevel(INITIAL_BUILDING_LEVELS, 'hospital', -1)
    const markup = renderToStaticMarkup(<CityScene buildingLevels={hospitalOnly} cityLevel="critical" />)

    expect(markup).toContain(DEGRADED_CITY_OVERVIEW_ASSET)
    expect(markup).not.toContain(DEVELOPED_CITY_OVERVIEW_ASSET)
    expect(markup).toContain('data-city-level="critical"')
    expect(markup).toContain('data-city-scene="degraded"')
    expect(markup).toContain('data-building-id="hospital" data-building-level="-1" data-asset-level="-1"')
    expect(markup).toContain(BUILDING_ASSETS.hospital[-1]?.src)
    for (const buildingId of BUILDING_IDS.filter((id) => id !== 'hospital')) {
      expect(markup).toContain(`data-building-id="${buildingId}" data-building-level="0" data-asset-level="0"`)
      expect(markup).toContain(BUILDING_ASSETS[buildingId][0]?.src)
      expect(markup).not.toContain(BUILDING_ASSETS[buildingId][-1]?.src)
      expect(markup).not.toContain(BUILDING_ASSETS[buildingId][-2]?.src)
      expect(markup).not.toContain(BUILDING_ASSETS[buildingId][2]?.src)
    }
  })

  it('uses each optimized level-two model over the developed city overview', () => {
    const developed = Object.fromEntries(BUILDING_IDS.map((buildingId) => [buildingId, 2])) as BuildingLevels
    const markup = renderToStaticMarkup(<CityScene buildingLevels={developed} cityLevel="improving" />)

    expect(markup).toContain(DEVELOPED_CITY_OVERVIEW_ASSET)
    expect(markup).toContain('data-city-level="improving"')
    expect(markup).toContain('data-city-scene="developed"')
    for (const buildingId of BUILDING_IDS) {
      expect(markup).toContain(`data-building-id="${buildingId}" data-building-level="2" data-asset-level="2"`)
      expect(BUILDING_ASSETS[buildingId][2]?.src).toMatch(/level-2\.webp$/)
      expect(markup).toContain(BUILDING_ASSETS[buildingId][2]?.src)
    }
  })

  it('uses each supplied level-one model instead of falling back to level zero', () => {
    const improving = Object.fromEntries(BUILDING_IDS.map((buildingId) => [buildingId, 1])) as BuildingLevels
    const markup = renderToStaticMarkup(<CityScene buildingLevels={improving} cityLevel="improving" />)

    expect(markup).toContain(DEVELOPED_CITY_OVERVIEW_ASSET)
    for (const buildingId of BUILDING_IDS) {
      expect(markup).toContain(`data-building-id="${buildingId}" data-building-level="1" data-asset-level="1"`)
      expect(BUILDING_ASSETS[buildingId][1]?.src).toMatch(/level-1\.png$/)
      expect(markup).toContain(BUILDING_ASSETS[buildingId][1]?.src)
      expect(markup).not.toContain(BUILDING_ASSETS[buildingId][0]?.src)
    }
  })

  it('uses each optimized minus-two model over the degraded city overview', () => {
    const critical = Object.fromEntries(BUILDING_IDS.map((buildingId) => [buildingId, -2])) as BuildingLevels
    const markup = renderToStaticMarkup(<CityScene buildingLevels={critical} cityLevel="critical" />)

    expect(markup).toContain(DEGRADED_CITY_OVERVIEW_ASSET)
    expect(markup).toContain('data-city-level="critical"')
    expect(markup).toContain('data-city-scene="degraded"')
    for (const buildingId of BUILDING_IDS) {
      expect(markup).toContain(`data-building-id="${buildingId}" data-building-level="-2" data-asset-level="-2"`)
      expect(BUILDING_ASSETS[buildingId][-2]?.src).toMatch(/level-minus-2\.webp$/)
      expect(markup).toContain(BUILDING_ASSETS[buildingId][-2]?.src)
    }
  })

  it('aligns each generated model independently with its Level 0 building', () => {
    for (const buildingId of BUILDING_IDS) {
      expect(resolveBuildingAssetPlacement(buildingId, 0)).toEqual({ x: 0, y: 0 })
      expect(resolveBuildingAssetPlacement(buildingId, -2)).toEqual({ x: 0, y: 18.75 })
      expect(resolveBuildingAssetPlacement(buildingId, -1)).toEqual({ x: 0, y: 0 })
      expect(resolveBuildingAssetPlacement(buildingId, 2)).toEqual({ x: 0, y: 18.75 })
    }

    const developed = Object.fromEntries(BUILDING_IDS.map((buildingId) => [buildingId, 2])) as BuildingLevels
    const markup = renderToStaticMarkup(<CityScene buildingLevels={developed} />)
    expect(markup.match(/y="18\.75"/g)).toHaveLength(BUILDING_IDS.length)
  })

  it('switches the overview with city level while registering every model above it', () => {
    expect(resolveCitySceneProfile('critical')).toBe(CITY_SCENE_PROFILES.degraded)
    expect(resolveCitySceneProfile('declining')).toBe(CITY_SCENE_PROFILES.degraded)
    expect(resolveCitySceneProfile('neutral')).toBe(CITY_SCENE_PROFILES.normal)
    expect(resolveCitySceneProfile('improving')).toBe(CITY_SCENE_PROFILES.developed)
    expect(resolveCitySceneProfile('prosperous')).toBe(CITY_SCENE_PROFILES.developed)

    const developedBuildings = Object.fromEntries(BUILDING_IDS.map((buildingId) => [buildingId, 2])) as BuildingLevels
    const markup = renderToStaticMarkup(<CityScene buildingLevels={developedBuildings} cityLevel="declining" />)
    expect(markup).toContain(DEGRADED_CITY_OVERVIEW_ASSET)
    expect(markup).toContain('data-city-level="declining"')
    expect(markup).toContain('preserveAspectRatio="xMidYMid slice"')
    expect(markup).toContain('clip-path="url(#city-scene-model-clip)"')
    expect(markup).toContain('data-city-model-layer="clipped-to-stage"')
    for (const buildingId of BUILDING_IDS) {
      const placement = CITY_SCENE_PROFILES.degraded.buildingPlacements[buildingId]
      expect(markup).toContain(
        `data-building-id="${buildingId}" data-building-level="2" data-asset-level="2" data-scene-profile="degraded"`,
      )
      expect(markup).toContain(
        `transform="translate(${placement.x} ${placement.y}) scale(${placement.scaleX} ${placement.scaleY})"`,
      )
    }
  })

  it('renders a saved calibration override through the real model transform', () => {
    const developed = setBuildingLevel(INITIAL_BUILDING_LEVELS, 'market', 2)
    const markup = renderToStaticMarkup(
      <CityScene
        buildingLevels={developed}
        buildingPlacementOverrides={{
          market: { x: -44.25, y: 2.5, scaleX: 1.031, scaleY: .997 },
        }}
        cityLevel="declining"
        sceneProfileId="degraded"
      />,
    )

    expect(markup).toContain('data-building-id="market" data-building-level="2"')
    expect(markup).toContain('transform="translate(-44.25 2.5) scale(1.031 0.997)"')
  })

  it('maps every score location back to the model whose placement effects must follow', () => {
    for (const buildingId of BUILDING_IDS) {
      expect(LOCATION_BUILDING[BUILDING_LOCATION[buildingId]]).toBe(buildingId)
    }
  })

  describe('building scores', () => {
    it('starts every building at score 500 which maps to Level 0', () => {
      for (const buildingId of BUILDING_IDS) {
        expect(INITIAL_BUILDING_SCORES[buildingId]).toBe(500)
        expect(getBuildingLevelFromScore(INITIAL_BUILDING_SCORES[buildingId])).toBe(0)
      }
      expect(deriveBuildingLevels(INITIAL_BUILDING_SCORES)).toEqual(INITIAL_BUILDING_LEVELS)
    })

    it.each([
      [0, -2], [199, -2],
      [200, -1], [399, -1],
      [400, 0], [599, 0],
      [600, 1], [799, 1],
      [800, 2], [1000, 2],
    ])('maps score %i to level %i', (score, level) => {
      expect(getBuildingLevelFromScore(score)).toBe(level)
    })

    it('clamps building scores to the 0-1000 range', () => {
      expect(clampBuildingScore(-500)).toBe(BUILDING_SCORE_POLICY.min)
      expect(clampBuildingScore(1500)).toBe(BUILDING_SCORE_POLICY.max)
      expect(clampBuildingScore(500)).toBe(500)

      const overflowing = updateBuildingScores(
        { ...INITIAL_BUILDING_SCORES, school: 950 },
        summaries(200),
      )
      expect(overflowing.school).toBe(1000)

      const underflowing = updateBuildingScores(
        { ...INITIAL_BUILDING_SCORES, school: 50 },
        summaries(-200),
      )
      expect(underflowing.school).toBe(0)
    })

    it('only updates the building mapped to a location with participants, leaving others independent', () => {
      const onlySchoolActive: Record<LocationId, LocationSummary> = {
        hospital: summary(0, 0),
        'municipal-office': summary(0, 0),
        'police-station': summary(0, 0),
        school: summary(80),
        market: summary(0, 0),
        construction: summary(0, 0),
        'news-office': summary(0, 0),
      }
      const next = updateBuildingScores(INITIAL_BUILDING_SCORES, onlySchoolActive)
      expect(next.school).toBe(580)
      for (const buildingId of BUILDING_IDS.filter((id) => id !== 'school')) {
        expect(next[buildingId]).toBe(500)
      }
    })

    it('recovers a building from a negative level back to a positive level across several rounds', () => {
      const declined = updateBuildingScores(INITIAL_BUILDING_SCORES, summaries(-350))
      expect(declined.school).toBe(150)
      expect(getBuildingLevelFromScore(declined.school)).toBe(-2)

      const recoveringOnce = updateBuildingScores(declined, summaries(300))
      expect(recoveringOnce.school).toBe(450)
      expect(getBuildingLevelFromScore(recoveringOnce.school)).toBe(0)

      const recoveredFully = updateBuildingScores(recoveringOnce, summaries(300))
      expect(recoveredFully.school).toBe(750)
      expect(getBuildingLevelFromScore(recoveredFully.school)).toBe(1)
    })

    it('applies newBuildingScore = oldBuildingScore + locationSummary.scoreAverage per building', () => {
      const next = updateBuildingScores(INITIAL_BUILDING_SCORES, summaries(37.5))
      for (const buildingId of BUILDING_IDS) {
        expect(next[buildingId]).toBe(537.5)
      }
    })

    it('derives the initial score from an existing buildingLevels field when buildingScores is missing (backward compatibility)', () => {
      const legacyLevels: BuildingLevels = {
        municipality: -2,
        hospital: -1,
        police: 0,
        construction: 1,
        market: 2,
        school: 0,
        newsAgency: -1,
      }
      const derived = normalizeBuildingScores(undefined, legacyLevels)
      expect(derived).toEqual({
        municipality: 100,
        hospital: 300,
        police: 500,
        construction: 700,
        market: 900,
        school: 500,
        newsAgency: 300,
      })
    })

    it('falls back to the default initial score when neither buildingScores nor buildingLevels are present', () => {
      expect(normalizeBuildingScores(undefined, undefined)).toEqual(INITIAL_BUILDING_SCORES)
    })
  })
})
