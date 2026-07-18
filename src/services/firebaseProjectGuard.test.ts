import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readProjectFile = (relativePath: string): string =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')

describe('Firebase project guard', () => {
  it('binds local Firebase configuration to the confirmed Our City project', () => {
    const firebaseRc = JSON.parse(readProjectFile('.firebaserc')) as { projects: { default: string } }
    expect(firebaseRc.projects.default).toBe('our-city-our-choice')
    expect(readProjectFile('.env.example')).toContain('VITE_FIREBASE_PROJECT_ID=our-city-our-choice')
    expect(readFileSync(new URL('./firebaseClassroomService.ts', import.meta.url), 'utf8')).toContain(
      "EXPECTED_FIREBASE_PROJECT_ID = 'our-city-our-choice'",
    )
  })

  it('does not reference the prohibited legacy Firebase project in active configuration', () => {
    const activeConfiguration = [
      readProjectFile('.firebaserc'),
      readProjectFile('.env.example'),
      readProjectFile('firebase.json'),
      readFileSync(new URL('./firebaseClassroomService.ts', import.meta.url), 'utf8'),
    ].join('\n')
    expect(activeConfiguration).not.toContain('matana-must-survive')
  })
})
