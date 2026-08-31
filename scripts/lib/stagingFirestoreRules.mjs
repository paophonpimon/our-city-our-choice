export const CITY_LAYOUT_RULES_START = '    // CITY LAYOUT ENVIRONMENT BLOCK START'
export const CITY_LAYOUT_RULES_END = '    // CITY LAYOUT ENVIRONMENT BLOCK END'

const STAGING_LAYOUT_RULES = `    // CITY LAYOUT ENVIRONMENT BLOCK START
    // STAGING ONLY: every app client already has an anonymous Firebase
    // session. Any signed-in staging user may calibrate layout, while all
    // classroom/player/assessment rules below remain byte-for-byte identical
    // to production.
    function isCityLayoutScene(value) {
      return value in ['degraded', 'normal', 'developed'];
    }

    function isCityLayoutBuilding(value) {
      return value in ['school', 'hospital', 'police', 'construction', 'market', 'municipality', 'newsAgency'];
    }

    function isCityLayoutLevel(value) {
      return value is int && value in [-2, -1, 0, 1, 2];
    }

    function isSaneCityLayoutPlacement(data) {
      return data.x is number && data.x >= -2000 && data.x <= 2000
        && data.y is number && data.y >= -2000 && data.y <= 2000
        && data.scaleX is number && data.scaleX >= 0.05 && data.scaleX <= 10
        && data.scaleY is number && data.scaleY >= 0.05 && data.scaleY <= 10;
    }

    function isCompleteCityLayoutBuilding(levels) {
      return levels is map
        && levels.size() == 5
        && levels.keys().hasOnly(['-2', '-1', '0', '1', '2']);
    }

    function isCompleteCityLayoutScene(scene) {
      return scene is map
        && scene.size() == 7
        && scene.keys().hasOnly(['school', 'hospital', 'police', 'construction', 'market', 'municipality', 'newsAgency'])
        && isCompleteCityLayoutBuilding(scene.school)
        && isCompleteCityLayoutBuilding(scene.hospital)
        && isCompleteCityLayoutBuilding(scene.police)
        && isCompleteCityLayoutBuilding(scene.construction)
        && isCompleteCityLayoutBuilding(scene.market)
        && isCompleteCityLayoutBuilding(scene.municipality)
        && isCompleteCityLayoutBuilding(scene.newsAgency);
    }

    function isCompleteCityLayout(placements) {
      return placements is map
        && placements.size() == 3
        && placements.keys().hasOnly(['degraded', 'normal', 'developed'])
        && isCompleteCityLayoutScene(placements.degraded)
        && isCompleteCityLayoutScene(placements.normal)
        && isCompleteCityLayoutScene(placements.developed);
    }

    match /system/cityLayoutAccess {
      allow read, write: if false;
    }

    match /cityLayoutDraft/{draftId} {
      allow read: if signedIn();
      allow create, update: if signedIn()
        && isCityLayoutScene(request.resource.data.scene)
        && isCityLayoutBuilding(request.resource.data.building)
        && isCityLayoutLevel(request.resource.data.level)
        && request.resource.data.updatedAt == request.time
        && (
          (
            request.resource.data.keys().hasOnly(['scene', 'building', 'level', 'x', 'y', 'scaleX', 'scaleY', 'updatedAt'])
            && draftId == request.resource.data.scene + '__' + request.resource.data.building + '__' + string(request.resource.data.level)
            && isSaneCityLayoutPlacement(request.resource.data)
          )
          ||
          (
            request.resource.data.keys().hasOnly(['scene', 'building', 'level', 'labelX', 'labelY', 'updatedAt'])
            && draftId == request.resource.data.scene + '__' + request.resource.data.building + '__' + string(request.resource.data.level) + '__label'
            && request.resource.data.labelX is number
            && request.resource.data.labelX >= -2000
            && request.resource.data.labelX <= 2000
            && request.resource.data.labelY is number
            && request.resource.data.labelY >= -2000
            && request.resource.data.labelY <= 2000
          )
        );
      allow delete: if signedIn();
    }

    match /cityLayoutVersions/{versionId} {
      allow read: if signedIn();
      allow create: if signedIn()
        && request.resource.data.keys().hasOnly(['schemaVersion', 'versionId', 'placements', 'publishedAt'])
        && request.resource.data.schemaVersion == 2
        && request.resource.data.versionId == versionId
        && isCompleteCityLayout(request.resource.data.placements)
        && request.resource.data.publishedAt == request.time;
      allow update, delete: if false;
    }

    match /cityLayoutPublished/current {
      allow read: if signedIn();
      allow create, update: if signedIn()
        && request.resource.data.keys().hasOnly(['schemaVersion', 'versionId', 'placements', 'publishedAt'])
        && request.resource.data.schemaVersion in [1, 2]
        && request.resource.data.versionId is string
        && isCompleteCityLayout(request.resource.data.placements)
        && request.resource.data.publishedAt == request.time
        && existsAfter(/databases/$(database)/documents/cityLayoutVersions/$(request.resource.data.versionId))
        && getAfter(/databases/$(database)/documents/cityLayoutVersions/$(request.resource.data.versionId)).data.schemaVersion == request.resource.data.schemaVersion
        && getAfter(/databases/$(database)/documents/cityLayoutVersions/$(request.resource.data.versionId)).data.placements == request.resource.data.placements;
      allow delete: if false;
    }
    // CITY LAYOUT ENVIRONMENT BLOCK END`

export const buildStagingFirestoreRules = (productionRules) => {
  const start = productionRules.indexOf(CITY_LAYOUT_RULES_START)
  const endStart = productionRules.indexOf(CITY_LAYOUT_RULES_END)
  if (start === -1 || endStart === -1 || endStart <= start) {
    throw new Error('Production Firestore rules are missing the city-layout environment markers')
  }
  const end = endStart + CITY_LAYOUT_RULES_END.length
  return `${productionRules.slice(0, start)}${STAGING_LAYOUT_RULES}${productionRules.slice(end)}`
}
