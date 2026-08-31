import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['firestore-tests/stagingRules.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: false,
  },
})
