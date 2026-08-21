// Resolves which base URL an E2E run targets. Never assumes production —
// every run must say explicitly where it's pointed, via --target or
// --base-url. This is deliberately less strict than the load-test
// production-safety guard (scripts/lib/productionSafetyGuard.mjs): the E2E
// harness drives the real UI like a real user and has been explicitly used
// against the deployed app before, so it may still target production —
// just never by silent default.
const KNOWN_TARGET_URLS = {
  production: 'https://our-city-our-choice.web.app',
}

export const resolveBaseUrl = (argv = process.argv) => {
  const valueOf = (flag) => {
    const index = argv.indexOf(flag)
    return index >= 0 ? argv[index + 1] : undefined
  }

  const target = valueOf('--target')
  const explicitBaseUrl = valueOf('--base-url')

  if (explicitBaseUrl) return explicitBaseUrl
  if (target === 'production') return KNOWN_TARGET_URLS.production
  if (target === 'staging') {
    throw new Error(
      'No staging URL is configured yet (no staging deployment exists). Pass --base-url <staging-url> explicitly once one does.',
    )
  }
  if (target) {
    throw new Error(
      `Unknown --target "${target}". Use --target production, or pass --base-url <url> directly for staging/local/emulator-backed targets.`,
    )
  }
  throw new Error('Refusing to assume a target. Pass --target production or --base-url <url> explicitly.')
}

export const isProductionUrl = (baseUrl) => {
  try {
    return new URL(baseUrl).host === new URL(KNOWN_TARGET_URLS.production).host
  } catch {
    return false
  }
}

// The only headcount production may ever see, and only via --smoke.
export const MAX_PRODUCTION_SMOKE_STUDENTS = 3

/**
 * Gate for the single-room flow (run-flow.mjs): production is reachable
 * only through an explicit --smoke run capped at 1 teacher + this many
 * students. Staging/local/emulator base URLs are never restricted here —
 * they're always available for full-scale QA regardless of --smoke.
 */
export const assertProductionUsageAllowed = ({ baseUrl, smoke, studentCount, context }) => {
  if (!isProductionUrl(baseUrl)) return
  if (!smoke) {
    throw new Error(
      `[production-safety] Refusing to run ${context} against production without --smoke. Production is only ` +
        `reachable through the explicit smoke-test mode (max 1 teacher + ${MAX_PRODUCTION_SMOKE_STUDENTS} students). ` +
        'Use --target staging or a local/emulator-backed --base-url for full QA.',
    )
  }
  if (studentCount > MAX_PRODUCTION_SMOKE_STUDENTS) {
    throw new Error(
      `[production-safety] --smoke against production allows at most 1 teacher + ${MAX_PRODUCTION_SMOKE_STUDENTS} ` +
        `students (got ${studentCount}). Reduce --students, or use --target staging/local for a full run.`,
    )
  }
}

/**
 * Gate for multi-client/stress scenarios (two-rooms-flow.mjs,
 * continue-city-flow.mjs): production is refused unconditionally — there is
 * no --smoke bypass for these, by design.
 */
export const assertProductionNeverAllowed = ({ baseUrl, context }) => {
  if (isProductionUrl(baseUrl)) {
    throw new Error(
      `[production-safety] ${context} may never target production, even with --smoke — there is no bypass for ` +
        'multi-client/stress scenarios. Use --target staging or a local/emulator-backed --base-url instead.',
    )
  }
}
