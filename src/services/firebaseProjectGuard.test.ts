import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readProjectFile = (relativePath: string): string =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')

describe('Firebase project guard', () => {
  it('binds local Firebase configuration to the confirmed Our City project', () => {
    const firebaseRc = JSON.parse(readProjectFile('.firebaserc')) as { projects: { default: string; staging?: string } }
    expect(firebaseRc.projects.default).toBe('our-city-our-choice')
    expect(readProjectFile('.env.example')).toContain('VITE_FIREBASE_PROJECT_ID=our-city-our-choice')
    // Production id now lives in firebaseEnvironment.ts (shared with the
    // staging allow-list) — verify it's still exactly the confirmed project,
    // and that firebaseClassroomService.ts actually enforces it at startup.
    expect(readProjectFile('src/domain/firebaseEnvironment.ts')).toContain("production: 'our-city-our-choice'")
    expect(readFileSync(new URL('./firebaseClassroomService.ts', import.meta.url), 'utf8')).toContain(
      'resolveFirebaseEnvironmentName(firebaseConfig.projectId)',
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

  it('keeps Firestore realtime listeners working through buffered tablet and school networks', () => {
    const classroomService = readFileSync(new URL('./firebaseClassroomService.ts', import.meta.url), 'utf8')
    expect(classroomService).toContain('experimentalAutoDetectLongPolling: true')
  })

  it('accepts active-room answers from both legacy and current classroom clients', () => {
    const rules = readProjectFile('firestore.rules')
    expect(rules).toContain("!request.resource.data.keys().hasAny(['recordType'])")
    expect(rules).toContain("request.resource.data.recordType == 'question'")
    expect(rules).toContain("affectedKeys().hasOnly(['ownerUid', 'lastSeenAt'])")
    expect(rules).toContain('request.resource.data.ownerUid == request.auth.uid')
    expect(rules).toContain('!exists(/databases/$(database)/documents/rooms/$(roomId)/answers/$(answerId))')
    expect(rules).toContain('isPlayerOwnerAfter(roomId, request.resource.data.playerId)')
  })
})
