// Validates .env.staging.local BEFORE any Vite build runs. This exists
// because Vite's own env cascade (.env -> .env.local -> .env.staging ->
// .env.staging.local) merges per KEY, not per file: an incomplete
// .env.staging.local (e.g. only VITE_FIREBASE_PROJECT_ID set) would
// silently pull every other VITE_FIREBASE_* value from .env.local, which
// today holds production's. This module never reads .env.local — it is
// only ever given .env.staging.local's own parsed content, so there is
// structurally no fallback path available to it.

export const REQUIRED_STAGING_FIREBASE_KEYS = Object.freeze([
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
])

// Kept in sync with src/domain/firebaseEnvironment.ts's FIREBASE_PROJECT_IDS
// (a plain Node script can't import that .ts module directly). Both are
// public project identifiers, not secrets.
export const PRODUCTION_FIREBASE_PROJECT_ID = 'our-city-our-choice'
export const STAGING_FIREBASE_PROJECT_ID = 'our-city-our-choice-staging'

export class StagingEnvValidationError extends Error {}

// Minimal KEY=VALUE parser matching the one already used by
// scripts/classroom-bots.mjs / scripts/load-test-40.mjs. Blank lines and
// '#' comments are ignored.
export const parseEnvFileContent = (text) =>
  Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return null
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
      })
      .filter((entry) => entry !== null),
  )

/**
 * Throws StagingEnvValidationError unless `env` (the parsed content of
 * .env.staging.local, and only that file) has every required Firebase
 * variable non-empty AND an explicitly-staging project id. `env` is the
 * function's only input — there is no second data source it could fall
 * back to, which is what makes "production values cannot silently fill a
 * missing staging value" true by construction, not just by convention.
 */
export const validateStagingFirebaseEnv = (env) => {
  const missingKeys = REQUIRED_STAGING_FIREBASE_KEYS.filter((key) => !env[key] || env[key].length === 0)
  if (missingKeys.length > 0) {
    throw new StagingEnvValidationError(
      `.env.staging.local is missing required value(s): ${missingKeys.join(', ')}. Each must be set explicitly ` +
        'in that file — it is never allowed to fall back to .env.local.',
    )
  }
  if (env.VITE_FIREBASE_PROJECT_ID === PRODUCTION_FIREBASE_PROJECT_ID) {
    throw new StagingEnvValidationError(
      `.env.staging.local's VITE_FIREBASE_PROJECT_ID is the production project (${PRODUCTION_FIREBASE_PROJECT_ID}). ` +
        `It must be ${STAGING_FIREBASE_PROJECT_ID}.`,
    )
  }
  if (env.VITE_FIREBASE_PROJECT_ID !== STAGING_FIREBASE_PROJECT_ID) {
    throw new StagingEnvValidationError(
      `.env.staging.local's VITE_FIREBASE_PROJECT_ID must be exactly "${STAGING_FIREBASE_PROJECT_ID}" ` +
        `(got "${env.VITE_FIREBASE_PROJECT_ID}").`,
    )
  }
  return true
}
