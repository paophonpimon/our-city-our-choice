import {
  BUILDING_IDS,
  CITY_SCENE_PROFILES,
  CITY_STAGE_HEIGHT,
  CITY_STAGE_WIDTH,
  normalizeBuildingLevels,
  resolveBuildingAsset,
  resolveBuildingAssetPlacement,
  resolveCitySceneProfile,
  type BuildingId,
  type BuildingLevels,
  type CitySceneBuildingPlacement,
  type CitySceneProfileId,
} from '../domain/cityBuildings'
import type { CityLevel } from '../domain/ourCity'

export type BuildingEffectTone = 'integrity' | 'corruption'

interface CitySceneProps {
  buildingLevels?: BuildingLevels
  buildingEffects?: Partial<Record<BuildingId, BuildingEffectTone>>
  buildingPlacementOverrides?: Partial<Record<BuildingId, CitySceneBuildingPlacement>>
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
        {BUILDING_IDS.map((buildingId) => {
          const requestedLevel = levels[buildingId]
          const asset = resolveBuildingAsset(buildingId, requestedLevel)
          const placement = asset
            ? resolveBuildingAssetPlacement(buildingId, asset.level)
            : null
          const effectTone = buildingEffects?.[buildingId]
          const calibratedScenePlacement = buildingPlacementOverrides?.[buildingId]
            ?? sceneProfile.buildingPlacements[buildingId]
          const normalScenePlacement = CITY_SCENE_PROFILES.normal.buildingPlacements[buildingId]
          // Level 0/1 exports use the same full-canvas coordinate system as the
          // overview. Use only the scene-to-scene delta; the older -2/-1/2
          // exports still need the full calibrated placement.
          const scenePlacement = asset?.fit === 'slice' && !buildingPlacementOverrides?.[buildingId]
            ? {
                x: calibratedScenePlacement.x - normalScenePlacement.x,
                y: calibratedScenePlacement.y - normalScenePlacement.y,
                scaleX: calibratedScenePlacement.scaleX / normalScenePlacement.scaleX,
                scaleY: calibratedScenePlacement.scaleY / normalScenePlacement.scaleY,
              }
            : calibratedScenePlacement
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
