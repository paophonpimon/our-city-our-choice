// Shared safety guard for automated multi-client/load-test scripts
// (classroom-bots.mjs, load-test-40.mjs). These write bulk simulated data
// straight to Firestore, bypassing the UI entirely — pointing one at the
// production project or hosting URL by mistake would pollute a real
// classroom's data. This guard makes that impossible; there is no override.

export const PRODUCTION_FIREBASE_PROJECT_ID = 'our-city-our-choice'
export const PRODUCTION_HOSTING_HOSTS = Object.freeze([
  'our-city-our-choice.web.app',
  'our-city-our-choice.firebaseapp.com',
])

export class ProductionSafetyError extends Error {}

export const assertNotProductionProject = (projectId, context) => {
  if (projectId === PRODUCTION_FIREBASE_PROJECT_ID) {
    throw new ProductionSafetyError(
      `[production-safety] Refusing to run ${context} against the production Firebase project ` +
        `(${PRODUCTION_FIREBASE_PROJECT_ID}). Point .env.local at the staging project, or pass --target emulator.`,
    )
  }
}

export const assertNotProductionUrl = (url, context) => {
  const host = new URL(url).host
  if (PRODUCTION_HOSTING_HOSTS.includes(host)) {
    throw new ProductionSafetyError(
      `[production-safety] Refusing to run ${context} against the production hosting URL (${host}). ` +
        'Use --base-url pointed at staging or a local target instead.',
    )
  }
}
