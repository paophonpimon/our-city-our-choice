// Minimal environment abstraction: which Firebase project ids the app is
// allowed to run against, and how to tell them apart. Production behavior
// is unchanged — 'our-city-our-choice' remains required exactly as before.
// Staging is a reserved, not-yet-created project id: the app will accept it
// once it exists, but nothing here creates or deploys it.
export const FIREBASE_PROJECT_IDS = {
  production: 'our-city-our-choice',
  staging: 'our-city-our-choice-staging',
} as const

export type FirebaseEnvironmentName = keyof typeof FIREBASE_PROJECT_IDS
export type CityLayoutRuntime = 'staging' | 'production'

export const resolveFirebaseEnvironmentName = (projectId: string | undefined | null): FirebaseEnvironmentName | null => {
  const match = (Object.entries(FIREBASE_PROJECT_IDS) as [FirebaseEnvironmentName, string][]).find(
    ([, id]) => id === projectId,
  )
  return match ? match[0] : null
}

export const resolveCityLayoutRuntime = (environmentName: FirebaseEnvironmentName): CityLayoutRuntime =>
  environmentName === 'staging' ? 'staging' : 'production'

/**
 * A `vite build --mode staging` build (see package.json's build:staging)
 * only pulls staging Firebase config from .env.staging.local. If that file
 * is missing or incomplete, Vite's env cascade silently falls back to
 * whatever .env.local has — which today is production. This is the guard
 * against that: it runs at app startup (mode and project id are both
 * baked in at build time), so a misconfigured staging build fails loudly
 * instead of quietly talking to the real project.
 */
export const assertStagingBuildNotUsingProduction = (
  mode: string | undefined,
  environmentName: FirebaseEnvironmentName,
): void => {
  if (mode === 'staging' && environmentName === 'production') {
    throw new Error(
      'Staging build (mode=staging) resolved the production Firebase project — .env.staging.local is missing or ' +
        'incomplete, so it silently fell back to .env.local. Create .env.staging.local with the staging project\'s ' +
        'VITE_FIREBASE_* values before building.',
    )
  }
}
