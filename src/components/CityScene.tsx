import {
  BUILDING_IDS,
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
  type CitySceneProfileId,
} from '../domain/cityBuildings'
import { resolveEffectivePlacement, type EffectivePlacementRecord, type SceneLayoutOverrides } from '../domain/cityLayoutOverrides'
import type { CityLevel } from '../domain/ourCity'

export type BuildingEffectTone = 'integrity' | 'corruption'

interface CitySceneProps {
  buildingLevels?: BuildingLevels
  buildingEffects?: Partial<Record<BuildingId, BuildingEffectTone>>
  buildingPlacementOverrides?: SceneLayoutOverrides
  cityLevel?: CityLevel
  sceneProfileId?: CitySceneProfileId
}

export const CityScene = ({
  buildingLevels,
  buildingEffects,
  buildingPlacementOverrides,
  cityLevel = 'neutral',
  sceneProfileId,
}: CitySceneProps) => {
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
      resolveEffectivePlacement(buildingPlacementOverrides, sceneProfile.id, buildingId, levels[buildingId]),
    ]),
  ) as Record<BuildingId, EffectivePlacementRecord>
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
          const effectTone = buildingEffects?.[buildingId]
          // The single source of truth for "what does this scene/building/level
          // actually render at" - also used by the calibration recovery export
          // and the depth sort above, so all three are guaranteed to agree.
          const scenePlacement = scenePlacements[buildingId]
          return (
            <g
              data-building-id={buildingId}
              data-building-level={requestedLevel}
              data-asset-level={asset?.level ?? 0}
              data-scene-profile={sceneProfile.id}
              key={buildingId}
              transform={`translate(${scenePlacement.x} ${scenePlacement.y}) scale(${scenePlacement.scaleX} ${scenePlacement.scaleY})`}
            >
              {asset && effectTone ? (
                <image
                  aria-hidden="true"
                  className={`city-scene__building-aura is-${effectTone}`}
                  href={asset.src}
                  x={placement?.x ?? 0}
                  y={placement?.y ?? 0}
                  width={CITY_STAGE_WIDTH}
                  height={CITY_STAGE_HEIGHT}
                  preserveAspectRatio={`xMidYMid ${asset.fit ?? 'meet'}`}
                />
              ) : null}
              {asset ? (
                <image
                  className={`city-scene__building${effectTone ? ` has-${effectTone}-effect` : ''}`}
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
