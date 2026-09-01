import {
  BUILDING_IDS,
  BUILDING_LOCATION,
  CITY_SCENE_PROFILES,
  CITY_STAGE_HEIGHT,
  CITY_STAGE_WIDTH,
  normalizeBuildingLevels,
  resolveBuildingAsset,
  resolveBuildingAssetPlacement,
  resolveBuildingGroundAnchorY,
  resolveCitySceneProfile,
  sortBuildingsByDepth,
  type BuildingAssetPlacement,
  type BuildingId,
  type BuildingLevels,
  type CitySceneBuildingPlacement,
  type CitySceneProfileId,
} from '../domain/cityBuildings'
import { LOCATION_POSITIONS } from './classroomUi'
import { resolveEffectivePlacement, resolveProductionPlacement, type SceneLayoutOverrides } from '../domain/cityLayoutOverrides'
import { resolveBuildingVisualEffect, type BuildingLevelDisplayTransition } from '../domain/cityPresentation'
import type { CityLevel } from '../domain/ourCity'
import { usePublishedCityLayout } from '../context/CityLayoutContext'

interface CitySceneProps {
  buildingLevels?: BuildingLevels
  buildingLevelTransitions?: Partial<Record<BuildingId, BuildingLevelDisplayTransition>>
  buildingPlacementOverrides?: SceneLayoutOverrides
  cityLevel?: CityLevel
  sceneProfileId?: CitySceneProfileId
}

export const CityScene = ({
  buildingLevels,
  buildingLevelTransitions,
  buildingPlacementOverrides,
  cityLevel = 'neutral',
  sceneProfileId,
}: CitySceneProps) => {
  const { publishedLayout, status } = usePublishedCityLayout()
  if (status === 'unresolved') {
    return (
      <div className="city-scene city-scene--layout-loading" role="status" aria-live="polite">
        <span aria-hidden="true" />
        <strong>กำลังโหลดผังเมือง...</strong>
      </div>
    )
  }
  const levels = normalizeBuildingLevels(buildingLevels)
  const sceneProfile = sceneProfileId ? CITY_SCENE_PROFILES[sceneProfileId] : resolveCitySceneProfile(cityLevel)
  // Resolve every building's scene placement AND its model-level asset
  // offset once, then paint back-to-front by the real ground/contact anchor
  // - the exact effective screen-space position CityScene renders the
  // building's canvas at, including the asset offset's own contribution
  // (scaled by the same group transform) - so a building spatially in front
  // of another always draws over it. The fixed BUILDING_IDS order must never
  // decide visual depth.
  const buildingAssets = Object.fromEntries(
    BUILDING_IDS.map((buildingId) => [buildingId, resolveBuildingAsset(buildingId, levels[buildingId])]),
  ) as Record<BuildingId, ReturnType<typeof resolveBuildingAsset>>
  const assetPlacements = Object.fromEntries(
    BUILDING_IDS.map((buildingId) => {
      const asset = buildingAssets[buildingId]
      return [buildingId, asset ? resolveBuildingAssetPlacement(buildingId, asset.level) : { x: 0, y: 0 }]
    }),
  ) as Record<BuildingId, BuildingAssetPlacement>
  const scenePlacements = Object.fromEntries(
    BUILDING_IDS.map((buildingId) => [
      buildingId,
      buildingPlacementOverrides
        ? resolveEffectivePlacement(buildingPlacementOverrides, sceneProfile.id, buildingId, levels[buildingId])
        : resolveProductionPlacement(publishedLayout, sceneProfile.id, buildingId, levels[buildingId]),
    ]),
  ) as unknown as Record<BuildingId, CitySceneBuildingPlacement>
  const groundAnchors = Object.fromEntries(
    BUILDING_IDS.map((buildingId) => [
      buildingId,
      resolveBuildingGroundAnchorY(scenePlacements[buildingId], assetPlacements[buildingId]),
    ]),
  ) as Record<BuildingId, number>
  const buildingRenderOrder = sortBuildingsByDepth(groundAnchors)

  return (
    <svg
      className={`city-scene is-scene-${sceneProfile.id}`}
      data-city-level={cityLevel}
      data-city-scene={sceneProfile.id}
      data-stage-height={CITY_STAGE_HEIGHT}
      data-stage-width={CITY_STAGE_WIDTH}
      viewBox={`0 0 ${CITY_STAGE_WIDTH} ${CITY_STAGE_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="เมืองที่ประกอบจากอาคารหลักทั้งเจ็ดแห่ง"
    >
      <defs>
        <clipPath id="city-scene-model-clip">
          <rect height={CITY_STAGE_HEIGHT} width={CITY_STAGE_WIDTH} x="0" y="0" />
        </clipPath>
      </defs>
      <image
        className="city-scene__background"
        href={sceneProfile.backgroundAsset}
        x="0"
        y="0"
        width={CITY_STAGE_WIDTH}
        height={CITY_STAGE_HEIGHT}
        preserveAspectRatio={`xMidYMid ${sceneProfile.backgroundFit}`}
      />
      <g clipPath="url(#city-scene-model-clip)" data-city-model-layer="clipped-to-stage">
        {buildingRenderOrder.map((buildingId) => {
          const requestedLevel = levels[buildingId]
          const asset = buildingAssets[buildingId]
          const placement = asset ? assetPlacements[buildingId] : null
          const levelTransition = buildingLevelTransitions?.[buildingId] ?? {
            previousLevel: requestedLevel,
            currentLevel: requestedLevel,
            changeDirection: 'same' as const,
          }
          const visualEffect = resolveBuildingVisualEffect(levelTransition)
          const hasActiveEffect = visualEffect.state !== 'neutral'
          const environmentPosition = LOCATION_POSITIONS[BUILDING_LOCATION[buildingId]]
          const environmentX = environmentPosition.x / 100 * CITY_STAGE_WIDTH + (placement?.x ?? 0)
          const environmentY = environmentPosition.y / 100 * CITY_STAGE_HEIGHT + (placement?.y ?? 0)
          // The single source of truth for "what does this scene/building/level
          // actually render at" - also used by the calibration recovery export
          // and the depth sort above, so all three are guaranteed to agree.
          const scenePlacement = scenePlacements[buildingId]
          return (
            <g
              data-building-id={buildingId}
              data-building-level={requestedLevel}
              data-asset-level={asset?.level ?? 0}
              data-building-visual-state={visualEffect.state}
              data-building-effect-intensity={visualEffect.intensity}
              data-scene-profile={sceneProfile.id}
              key={buildingId}
              transform={`translate(${scenePlacement.x} ${scenePlacement.y}) scale(${scenePlacement.scaleX} ${scenePlacement.scaleY})`}
            >
              {asset && hasActiveEffect ? (
                <g
                  aria-hidden="true"
                  className={`city-scene__building-environment is-${visualEffect.state} is-intensity-${visualEffect.intensity}`}
                  data-environment-tone={visualEffect.state}
                >
                  <ellipse
                    className="city-scene__building-ambient-glow"
                    cx={environmentX}
                    cy={environmentY + CITY_STAGE_HEIGHT * .025}
                    rx={CITY_STAGE_WIDTH * .115}
                    ry={CITY_STAGE_HEIGHT * .13}
                  />
                  <ellipse
                    className="city-scene__building-ground-halo"
                    cx={environmentX}
                    cy={environmentY + CITY_STAGE_HEIGHT * .075}
                    rx={CITY_STAGE_WIDTH * .105}
                    ry={CITY_STAGE_HEIGHT * .028}
                  />
                  {visualEffect.state === 'downgrade' ? (
                    <ellipse
                      className="city-scene__building-warning-ring"
                      cx={environmentX}
                      cy={environmentY + CITY_STAGE_HEIGHT * .075}
                      rx={CITY_STAGE_WIDTH * .09}
                      ry={CITY_STAGE_HEIGHT * .021}
                    />
                  ) : null}
                </g>
              ) : null}
              {asset ? (
                <image
                  className={`city-scene__building is-effect-${visualEffect.state} is-intensity-${visualEffect.intensity}`}
                  href={asset.src}
                  x={placement?.x ?? 0}
                  y={placement?.y ?? 0}
                  width={CITY_STAGE_WIDTH}
                  height={CITY_STAGE_HEIGHT}
                  preserveAspectRatio={`xMidYMid ${asset.fit ?? 'meet'}`}
                />
              ) : null}
            </g>
          )
        })}
      </g>
    </svg>
  )
}
