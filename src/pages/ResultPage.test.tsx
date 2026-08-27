import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const resultPage = readFileSync(new URL('./ResultPage.tsx', import.meta.url), 'utf8')
const teacherPage = readFileSync(new URL('./TeacherPage.tsx', import.meta.url), 'utf8')
const publisherHook = readFileSync(new URL('../hooks/useTeacherLearningEvidencePublisher.ts', import.meta.url), 'utf8')

describe('ResultPage finished learning evidence publication lifecycle', () => {
  it('waits for the current room private-evidence snapshot before deriving an aggregate', () => {
    expect(publisherHook).toContain('evidenceState.identityKey === roomId')
    expect(publisherHook).toContain('&& !evidenceState.loading')
    expect(publisherHook).toContain('&& !evidenceState.error')
  })

  it('publishes from TeacherPage before ResultPage and reuses the same hook for final safety', () => {
    expect(teacherPage).toContain('useTeacherLearningEvidencePublisher(')
    expect(publisherHook).toContain('shouldPublishClassroomLearningEvidence(room.publicLearningEvidence, liveEvidence)')
    expect(publisherHook).toContain('service.publishLearningEvidence(room.roomId, uid, evidence)')
    expect(publisherHook).toContain('publicationInFlightRef.current')
    expect(publisherHook).toContain('publicationQueuedRef.current = true')
    expect(publisherHook).toContain('setPublicationRevision((revision) => revision + 1)')
    expect(resultPage).toContain('useTeacherLearningEvidencePublisher(')
    expect(resultPage).not.toContain('service.publishLearningEvidence(')

    const publicStart = resultPage.indexOf('if (isPublicFinishedResult)')
    const publicEnd = resultPage.indexOf('if (!isTeacher && !hasStudentSession)', publicStart)
    expect(resultPage.slice(publicStart, publicEnd)).not.toContain('publishLearningEvidence')
  })

  it('contains no manual publication control', () => {
    expect(resultPage).not.toMatch(/onClick=\{[^}]*publishLearningEvidence/)
    expect(resultPage).not.toMatch(/button[^>]+publishLearningEvidence/)
  })
})
