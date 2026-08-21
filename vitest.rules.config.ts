import { defineConfig } from 'vitest/config'

// Separate from the default `npm test` suite on purpose: these tests need a
// live Firestore emulator (see package.json's test:rules script, which
// wraps this in `firebase emulators:exec`). Running them under the default
// config would make every `npm test` fail/hang unless the emulator happens
// to already be up.
export default defineConfig({
  test: {
    include: ['firestore-tests/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
