import { describe, expect, it } from 'vitest'
import type { ClassroomAssessmentRecord } from '../types/classroomGame'
import {
  calculateCompetitionAssessmentEvidence,
  calculateCompetitionSimulationEvidence,
  createClassroomPublicLearningEvidence,
  shouldPublishClassroomLearningEvidence,
} from './competitionEvidence'

const assessment = (
  recordType: 'pre' | 'post',
  playerId: string,
  responses: number[],
): ClassroomAssessmentRecord => ({
  schemaVersion: 1,
  recordType,
  roomId: 'ROOM01',
  playerId,
  ownerUid: `owner-${playerId}`,
  responses,
  submittedAt: 1,
})

describe('competition assessment evidence', () => {
  it('keeps completion denominators separate from the matched cohort', () => {
    const records: ClassroomAssessmentRecord[] = [
      assessment('pre', 'a', Array(10).fill(2)),
      assessment('pre', 'b', Array(10).fill(3)),
      assessment('pre', 'pre-only', Array(10).fill(4)),
      assessment('post', 'a', Array(10).fill(4)),
      assessment('post', 'b', Array(10).fill(3)),
      assessment('post', 'post-only', Array(10).fill(5)),
      { schemaVersion: 1, recordType: 'reflection', roomId: 'ROOM01', playerId: 'a', ownerUid: 'owner-a', r1: 'หนึ่ง', r2: 'สอง', r3: 'สาม', submittedAt: 2 },
    ]

    const result = calculateCompetitionAssessmentEvidence(4, records)

    expect(result.preCompleteCount).toBe(3)
    expect(result.postCompleteCount).toBe(3)
    expect(result.matched.matchedCount).toBe(2)
    expect(result.reflectionCompleteCount).toBe(1)
    expect(result.preCompletionPercent).toBe(75)
    expect(result.postCompletionPercent).toBe(75)
    expect(result.reflectionCompletionPercent).toBe(25)
    expect(result.matched.preMean).toBe(2.5)
    expect(result.matched.postMean).toBe(3.5)
    expect(result.matched.meanGain).toBe(10)
    expect(result.matched.meanGainFivePoint).toBe(1)
    expect(result.matched.improvedCount).toBe(1)
    expect(result.matched.unchangedCount).toBe(1)
    expect(result.matched.decreasedCount).toBe(0)
    expect(result.matched.improvedPercent).toBe(50)
    expect(result.matched.unchangedPercent).toBe(50)
    expect(result.matched.decreasedPercent).toBe(0)
  })

  it('returns missing percentages and Observation mean instead of measured zeros', () => {
    const result = calculateCompetitionAssessmentEvidence(0, [])
    expect(result.preCompletionPercent).toBeNull()
    expect(result.postCompletionPercent).toBeNull()
    expect(result.reflectionCompletionPercent).toBeNull()
    expect(result.matched.matchedCount).toBe(0)
    expect(result.observation).toBeNull()
    expect(result.observationMean).toBeNull()
  })

  it('uses the current complete 1-4 Observation scale only', () => {
    const observation: ClassroomAssessmentRecord = {
      schemaVersion: 1,
      recordType: 'observation',
      roomId: 'ROOM01',
      teacherSessionId: 'teacher',
      o1: 2,
      o2: 3,
      o3: 4,
      o4: 3,
      notes: 'หลักฐานจากครู',
      submittedAt: 3,
    }
    const result = calculateCompetitionAssessmentEvidence(10, [observation])
    expect(result.observationMean).toBe(3)
  })
})

describe('competition simulation evidence', () => {
  it('reconciles 12 outcomes per participant for every completed cycle', () => {
    expect(calculateCompetitionSimulationEvidence(34, 1, 200, 150, 58)).toEqual({
      normalScenariosCompleted: 10,
      crisisScenariosCompleted: 2,
      expectedDecisionOpportunities: 408,
      actualDecisionOutcomes: 408,
      reconciles: true,
    })
  })

  it('exposes a discrepancy without forcing stored outcome totals', () => {
    const result = calculateCompetitionSimulationEvidence(3, 1, 10, 10, 10)
    expect(result.expectedDecisionOpportunities).toBe(36)
    expect(result.actualDecisionOutcomes).toBe(30)
    expect(result.reconciles).toBe(false)
  })
})

describe('public finished learning evidence', () => {
  it('publishes only aggregate matched, completion, and Observation values', () => {
    const records: ClassroomAssessmentRecord[] = [
      assessment('pre', 'private-player', Array(10).fill(2)),
      assessment('post', 'private-player', Array(10).fill(4)),
      { schemaVersion: 1, recordType: 'reflection', roomId: 'ROOM01', playerId: 'private-player', ownerUid: 'private-owner', r1: 'raw one', r2: 'raw two', r3: 'raw three', submittedAt: 2 },
      { schemaVersion: 1, recordType: 'observation', roomId: 'ROOM01', teacherSessionId: 'private-teacher', o1: 2, o2: 3, o3: 4, o4: 3, notes: 'private notes', submittedAt: 3 },
    ]

    const result = createClassroomPublicLearningEvidence(2, records)
    expect(result).toEqual({
      schemaVersion: 1,
      participantCount: 2,
      preCompleteCount: 1,
      postCompleteCount: 1,
      matchedCount: 1,
      preMean: 2,
      postMean: 4,
      meanGainFivePoint: 2,
      improvedCount: 1,
      unchangedCount: 0,
      decreasedCount: 0,
      improvedPercent: 100,
      unchangedPercent: 0,
      decreasedPercent: 0,
      reflectionCompleteCount: 1,
      reflectionCompletionPercent: 50,
      observation: { o1: 2, o2: 3, o3: 4, o4: 3, mean: 3 },
    })
    expect(JSON.stringify(result)).not.toMatch(/player|owner|teacherSession|responses|notes|raw one/)
  })

  it('uses null for missing matched and Observation measurements', () => {
    const result = createClassroomPublicLearningEvidence(3, [])
    expect(result.preMean).toBeNull()
    expect(result.postMean).toBeNull()
    expect(result.meanGainFivePoint).toBeNull()
    expect(result.improvedPercent).toBeNull()
    expect(result.observation).toBeNull()
  })

  it('is idempotent and detects later POST or Reflection completion updates', () => {
    const pre = assessment('pre', 'student-a', Array(10).fill(2))
    const post = assessment('post', 'student-a', Array(10).fill(4))
    const reflection: ClassroomAssessmentRecord = {
      schemaVersion: 1,
      recordType: 'reflection',
      roomId: 'ROOM01',
      playerId: 'student-a',
      ownerUid: 'private-owner',
      r1: 'raw one',
      r2: 'raw two',
      r3: 'raw three',
      submittedAt: 2,
    }

    const preOnly = createClassroomPublicLearningEvidence(1, [pre])
    expect(shouldPublishClassroomLearningEvidence(preOnly, preOnly)).toBe(false)

    const withPost = createClassroomPublicLearningEvidence(1, [pre, post])
    expect(shouldPublishClassroomLearningEvidence(preOnly, withPost)).toBe(true)
    expect(withPost.postCompleteCount).toBe(1)
    expect(withPost.matchedCount).toBe(1)

    const withReflection = createClassroomPublicLearningEvidence(1, [pre, post, reflection])
    expect(shouldPublishClassroomLearningEvidence(withPost, withReflection)).toBe(true)
    expect(withReflection.reflectionCompleteCount).toBe(1)
    expect(JSON.stringify(withReflection)).not.toMatch(/student-a|private-owner|raw one/)
  })
})
