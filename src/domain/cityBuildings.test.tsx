import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CityScene } from '../components/CityScene'
import type { LocationId, LocationSummary } from './cityScoring'
import type { BuildingLevelDisplayTransition } from './cityPresentation'
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
  resolveBuildingGroundAnchorY,
  resolveCitySceneProfile,
  resolveFrozenBuildingPlacement,
  setBuildingLevel,
  sortBuildingsByDepth,
  updateBuildingScores,
  type BuildingLevels,
  type CitySceneBuildingPlacement,
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

  it('uses one transition-driven effect system for all seven building models', () => {
    const buildingLevels: BuildingLevels = {
      school: 1,
      construction: 2,
      market: 0,
      hospital: -1,
      police: -2,
      municipality: 1,
      newsAgency: -1,
    }
    const buildingLevelTransitions: Record<(typeof BUILDING_IDS)[number], BuildingLevelDisplayTransition> = {
      school: { previousLevel: 0, currentLevel: 1, changeDirection: 'up' },
      construction: { previousLevel: 1, currentLevel: 2, changeDirection: 'up' },
      market: { previousLevel: 0, currentLevel: 0, changeDirection: 'same' },
      hospital: { previousLevel: 0, currentLevel: -1, changeDirection: 'down' },
      police: { previousLevel: -1, currentLevel: -2, changeDirection: 'down' },
      municipality: { previousLevel: 0, currentLevel: 1, changeDirection: 'up' },
      newsAgency: { previousLevel: 0, currentLevel: -1, changeDirection: 'down' },
    }

    const markup = renderToStaticMarkup(
      <CityScene buildingLevels={buildingLevels} buildingLevelTransitions={buildingLevelTransitions} />,
    )

    expect(markup.match(/data-building-visual-state=/g)).toHaveLength(7)
    expect(markup.match(/data-building-effect-intensity=/g)).toHaveLength(7)
    expect(markup.match(/data-building-visual-state="upgrade"/g)).toHaveLength(3)
    expect(markup.match(/data-building-visual-state="downgrade"/g)).toHaveLength(3)
    expect(markup.match(/data-building-visual-state="neutral"/g)).toHaveLength(1)
    expect(markup).toContain('is-effect-upgrade is-intensity-strong')
    expect(markup).toContain('is-effect-downgrade is-intensity-strong')
    expect(markup).toContain('is-effect-neutral is-intensity-none')
    expect(markup).not.toMatch(/integrity-effect|corruption-effect|data-effect-building/)
  })

  it.each([-1, -2] as const)('keeps every level %s model in the red shared warning family without a transition prop', (level) => {
    const buildingLevels = Object.fromEntries(BUILDING_IDS.map((buildingId) => [buildingId, level])) as BuildingLevels
    const markup = renderToStaticMarkup(<CityScene buildingLevels={buildingLevels} />)

    expect(markup.match(/data-building-visual-state="downgrade"/g)).toHaveLength(7)
    expect(markup.match(new RegExp(`data-building-effect-intensity="${level === -2 ? 'strong' : 'medium'}"`, 'g'))).toHaveLength(7)
    expect(markup.match(/city-scene__building-warning-ring/g)).toHaveLength(7)
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
      const placement = resolveFrozenBuildingPlacement('degraded', buildingId, 2)
      expect(markup).toContain(
        `data-building-id="${buildingId}" data-building-level="2" data-asset-level="2" data-building-visual-state="neutral" data-building-effect-intensity="none" data-scene-profile="degraded"`,
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
          market: { 2: { x: -44.25, y: 2.5, scaleX: 1.031, scaleY: .997 } },
        }}
        cityLevel="declining"
        sceneProfileId="degraded"
      />,
    )

    expect(markup).toContain('data-building-id="market" data-building-level="2"')
    expect(markup).toContain('transform="translate(-44.25 2.5) scale(1.031 0.997)"')
  })

  it('keeps a calibration override scoped to the model level it was saved for, leaving other levels on the scene default', () => {
    const overrides = { market: { 2: { x: -44.25, y: 2.5, scaleX: 1.031, scaleY: .997 } } }

    const atLevelZero = renderToStaticMarkup(
      <CityScene buildingLevels={INITIAL_BUILDING_LEVELS} buildingPlacementOverrides={overrides} sceneProfileId="degraded" />,
    )
    expect(atLevelZero).not.toContain('translate(-44.25 2.5)')

    const atLevelTwo = setBuildingLevel(INITIAL_BUILDING_LEVELS, 'market', 2)
    const markupAtLevelTwo = renderToStaticMarkup(
      <CityScene buildingLevels={atLevelTwo} buildingPlacementOverrides={overrides} sceneProfileId="degraded" />,
    )
    expect(markupAtLevelTwo).toContain('transform="translate(-44.25 2.5) scale(1.031 0.997)"')
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

describe('isometric building depth ordering', () => {
  const placementAt = (y: number, scaleY = 1): CitySceneBuildingPlacement => ({ x: 0, y, scaleX: 1, scaleY })
  // No asset offset (matches Lv.-1/0/1, where BUILDING_ASSET_PLACEMENTS is {x:0,y:0}).
  const NO_ASSET_OFFSET = { x: 0, y: 0 }
  const anchorAt = (y: number, scaleY = 1) => resolveBuildingGroundAnchorY(placementAt(y, scaleY), NO_ASSET_OFFSET)

  it('sorts smaller ground Y behind and larger ground Y in front (later in render order)', () => {
    // municipality=0, hospital=10, police=20, construction=30, market=40, school=50, newsAgency=60
    const anchors = Object.fromEntries(
      BUILDING_IDS.map((buildingId, index) => [buildingId, anchorAt(index * 10)]),
    ) as Record<(typeof BUILDING_IDS)[number], number>

    const order = sortBuildingsByDepth(anchors)

    // Ascending Y in, ascending render order out - front (largest Y) is last.
    expect(order).toEqual([...BUILDING_IDS])
    for (let i = 1; i < order.length; i += 1) {
      expect(anchors[order[i]]).toBeGreaterThan(anchors[order[i - 1]])
    }
    expect(order[order.length - 1]).toBe('newsAgency') // largest Y (60) -> furthest front -> renders last

    // Reversing which building has which Y must reverse the render order too.
    const reversedAnchors = Object.fromEntries(
      [...BUILDING_IDS].map((buildingId, index) => [buildingId, anchorAt((BUILDING_IDS.length - 1 - index) * 10)]),
    ) as Record<(typeof BUILDING_IDS)[number], number>
    expect(sortBuildingsByDepth(reversedAnchors)).toEqual([...BUILDING_IDS].reverse())
  })

  it('does not sort by image height, transparent bounds, or roof position - only by the resolved ground anchor Y', () => {
    // Two anchors with identical Y but very different scaleX (a proxy for
    // "wider image") must not out-rank each other on scale alone unless it
    // actually changes the anchor's effective screen position (scaleX plays
    // no part in the ground anchor formula at all).
    const anchors = {
      municipality: anchorAt(10, 1),
      hospital: resolveBuildingGroundAnchorY({ x: 0, y: 10, scaleX: 5, scaleY: 1 }, NO_ASSET_OFFSET), // much wider, same Y and scaleY
      police: anchorAt(-5),
      construction: anchorAt(-5),
      market: anchorAt(-5),
      school: anchorAt(-5),
      newsAgency: anchorAt(-5),
    } as Record<(typeof BUILDING_IDS)[number], number>
    const order = sortBuildingsByDepth(anchors)
    // municipality and hospital share the same ground anchor Y (scaleX does not
    // factor into it) - a deterministic tie-breaker (declaration order) must
    // decide between them, not scale/width.
    expect(order.indexOf('municipality')).toBeLessThan(order.indexOf('hospital'))
  })

  it('uses a deterministic tie-breaker (BUILDING_IDS declaration order) only when anchors are exactly equal', () => {
    const anchors = Object.fromEntries(
      BUILDING_IDS.map((buildingId) => [buildingId, anchorAt(0)]),
    ) as Record<(typeof BUILDING_IDS)[number], number>

    expect(sortBuildingsByDepth(anchors)).toEqual([...BUILDING_IDS])
  })

  it('factors scaleY into the ground anchor (effective screen-space position), not just raw y', () => {
    const shorter = resolveBuildingGroundAnchorY({ x: 0, y: 0, scaleX: 1, scaleY: 1 }, NO_ASSET_OFFSET)
    const taller = resolveBuildingGroundAnchorY({ x: 0, y: 0, scaleX: 1, scaleY: 1.5 }, NO_ASSET_OFFSET)
    expect(taller).toBeGreaterThan(shorter)
  })

  describe('model-level asset placement offset (BUILDING_ASSET_PLACEMENTS) contributes to ground depth', () => {
    it('audit result: YES, asset-level Y changes the rendered ground/contact Y - it sits inside the scaled group', () => {
      // CityScene renders: <g transform="translate(scene.x scene.y) scale(scene.scaleX scene.scaleY)">
      //   <image x={asset.x} y={asset.y} width=STAGE_WIDTH height=STAGE_HEIGHT />
      // </g>
      // SVG scales a child's local coordinates before applying the group's
      // translate, so the image's local bottom edge (asset.y + STAGE_HEIGHT)
      // maps to screen Y = scene.y + (asset.y + STAGE_HEIGHT) * scene.scaleY.
      // A non-zero asset.y must therefore shift the ground anchor by
      // asset.y * scene.scaleY - proven directly against that formula here.
      const scenePlacement = { x: 0, y: 100, scaleX: 1, scaleY: 2 }
      const zeroOffsetAnchor = resolveBuildingGroundAnchorY(scenePlacement, { x: 0, y: 0 })
      const nonZeroOffsetAnchor = resolveBuildingGroundAnchorY(scenePlacement, { x: 0, y: 18.75 })

      expect(nonZeroOffsetAnchor).not.toBe(zeroOffsetAnchor)
      expect(nonZeroOffsetAnchor - zeroOffsetAnchor).toBe(18.75 * scenePlacement.scaleY) // scaled, not added raw
      expect(nonZeroOffsetAnchor).toBe(scenePlacement.y + (18.75 + CITY_STAGE_HEIGHT) * scenePlacement.scaleY)
    })

    it('two buildings with the identical scene placement but different asset offsets (Lv.-2/+2 vs Lv.-1/0/1) resolve to different ground anchors', () => {
      const sharedScenePlacement = { x: 0, y: -33.25, scaleX: 1.061, scaleY: 1.001 } // e.g. degraded/hospital at Lv.-2 and Lv.-1 share this exact scene placement
      const anchorAtMinus1 = resolveBuildingGroundAnchorY(sharedScenePlacement, resolveBuildingAssetPlacement('hospital', -1)) // asset y = 0
      const anchorAtMinus2 = resolveBuildingGroundAnchorY(sharedScenePlacement, resolveBuildingAssetPlacement('hospital', -2)) // asset y = 18.75
      expect(resolveBuildingAssetPlacement('hospital', -2).y).toBe(18.75)
      expect(resolveBuildingAssetPlacement('hospital', -1).y).toBe(0)
      expect(anchorAtMinus2).toBeGreaterThan(anchorAtMinus1)
    })

    it.each([-2, 2] as const)(
      'at Lv.%i, the rendered depth order matches the ground anchor computed WITH the asset offset, not without it',
      (level) => {
        const hospitalScene = resolveFrozenBuildingPlacement('degraded', 'hospital', level)
        const schoolScene = resolveFrozenBuildingPlacement('degraded', 'school', level)
        const hospitalAsset = resolveBuildingAssetPlacement('hospital', level)
        const schoolAsset = resolveBuildingAssetPlacement('school', level)
        expect(hospitalAsset.y).toBe(18.75) // this is the non-zero offset under audit
        expect(schoolAsset.y).toBe(18.75)

        const correctlyOrdered = resolveBuildingGroundAnchorY(hospitalScene, hospitalAsset)
          > resolveBuildingGroundAnchorY(schoolScene, schoolAsset)

        const levels = Object.fromEntries(BUILDING_IDS.map((buildingId) => [buildingId, level])) as BuildingLevels
        const markup = renderToStaticMarkup(<CityScene buildingLevels={levels} sceneProfileId="degraded" />)
        const hospitalRendersAfterSchool = markup.indexOf('data-building-id="hospital"')
          > markup.indexOf('data-building-id="school"')

        expect(hospitalRendersAfterSchool).toBe(correctlyOrdered)
      },
    )

    it('regression: at degraded Lv.-2 specifically, including the shared 18.75 asset offset flips Hospital from behind to in front of School', () => {
      // hospital.scaleY (1.001) is fractionally larger than school.scaleY (1)
      // in the degraded scene, so the identical 18.75 asset offset each
      // receives gets scaled slightly more for hospital - a difference only
      // large enough to matter once the asset offset is actually included.
      const hospitalScene = resolveFrozenBuildingPlacement('degraded', 'hospital', -2)
      const schoolScene = resolveFrozenBuildingPlacement('degraded', 'school', -2)

      const withoutAssetOffsetDelta = resolveBuildingGroundAnchorY(hospitalScene, { x: 0, y: 0 })
        - resolveBuildingGroundAnchorY(schoolScene, { x: 0, y: 0 })
      const withAssetOffsetDelta = resolveBuildingGroundAnchorY(hospitalScene, resolveBuildingAssetPlacement('hospital', -2))
        - resolveBuildingGroundAnchorY(schoolScene, resolveBuildingAssetPlacement('school', -2))

      expect(withoutAssetOffsetDelta).toBeLessThan(0) // omitting the asset offset: School in front (the bug)
      expect(withAssetOffsetDelta).toBeGreaterThan(0) // including it: Hospital in front (the fix)
    })
  })

  describe('Hospital/School regression (confirmed bug: Hospital in front but School drew over it)', () => {
    // Using the CORRECTED ground anchor (scene placement + asset offset,
    // scaled together) against the real frozen 105-record data.
    const hospitalInFrontCases: Array<{ scene: 'degraded' | 'normal' | 'developed'; level: -2 | -1 | 0 | 1 | 2 }> = [
      { scene: 'degraded', level: -2 }, // only flips to "Hospital in front" once the Lv.-2 asset offset (18.75) is included
      { scene: 'degraded', level: 0 },
      { scene: 'degraded', level: 1 },
      { scene: 'normal', level: 0 },
      { scene: 'normal', level: 1 },
      { scene: 'developed', level: 1 },
    ]

    it.each(hospitalInFrontCases)(
      'in the $scene scene at level $level, Hospital has a larger real ground anchor than School and must render after it',
      ({ scene, level }) => {
        const hospitalAnchor = resolveBuildingGroundAnchorY(
          resolveFrozenBuildingPlacement(scene, 'hospital', level), resolveBuildingAssetPlacement('hospital', level),
        )
        const schoolAnchor = resolveBuildingGroundAnchorY(
          resolveFrozenBuildingPlacement(scene, 'school', level), resolveBuildingAssetPlacement('school', level),
        )
        // Confirms these are genuinely the "Hospital in front" cases before
        // asserting the fix - if the frozen data ever changes, this test
        // will fail loudly here rather than silently passing on the wrong premise.
        expect(hospitalAnchor).toBeGreaterThan(schoolAnchor)

        const levels = Object.fromEntries(BUILDING_IDS.map((buildingId) => [buildingId, level])) as BuildingLevels
        const markup = renderToStaticMarkup(<CityScene buildingLevels={levels} sceneProfileId={scene} />)
        const hospitalIndex = markup.indexOf('data-building-id="hospital"')
        const schoolIndex = markup.indexOf('data-building-id="school"')
        expect(hospitalIndex).toBeGreaterThan(-1)
        expect(schoolIndex).toBeGreaterThan(-1)
        // Later in the SVG document order paints on top - Hospital must come
        // after School, no matter where 'hospital'/'school' sit in BUILDING_IDS.
        expect(hospitalIndex).toBeGreaterThan(schoolIndex)
      },
    )

    it('BUILDING_IDS declaration order alone (hospital before school) is not what decides this - the ground anchor is', () => {
      expect(BUILDING_IDS.indexOf('hospital')).toBeLessThan(BUILDING_IDS.indexOf('school'))
      const levels = Object.fromEntries(BUILDING_IDS.map((buildingId) => [buildingId, 0])) as BuildingLevels
      const markup = renderToStaticMarkup(<CityScene buildingLevels={levels} sceneProfileId="normal" />)
      // Despite hospital preceding school in BUILDING_IDS, hospital's larger
      // ground anchor at Lv.0/normal must still put it after school in paint order.
      expect(markup.indexOf('data-building-id="hospital"')).toBeGreaterThan(markup.indexOf('data-building-id="school"'))
    })
  })

  it('reacts to manual calibration movement: pushing a building further down (larger Y) moves it later in render order', () => {
    const levels = Object.fromEntries(BUILDING_IDS.map((buildingId) => [buildingId, 0])) as BuildingLevels
    const startingOverrides = {
      hospital: { 0: { x: 0, y: -20, scaleX: 1, scaleY: 1 } },
      school: { 0: { x: 0, y: 20, scaleX: 1, scaleY: 1 } },
    }

    // To start, hospital is well behind school (smaller Y) - it must render first.
    const before = renderToStaticMarkup(
      <CityScene buildingLevels={levels} buildingPlacementOverrides={startingOverrides} sceneProfileId="normal" />,
    )
    expect(before.indexOf('data-building-id="hospital"')).toBeLessThan(before.indexOf('data-building-id="school"'))

    // Manually calibrate hospital much further down than school - depth order must flip to match.
    const movedOverrides = {
      ...startingOverrides,
      hospital: { 0: { x: 0, y: 999, scaleX: 1, scaleY: 1 } },
    }
    const after = renderToStaticMarkup(
      <CityScene buildingLevels={levels} buildingPlacementOverrides={movedOverrides} sceneProfileId="normal" />,
    )
    expect(after.indexOf('data-building-id="hospital"')).toBeGreaterThan(after.indexOf('data-building-id="school"'))
  })
})
