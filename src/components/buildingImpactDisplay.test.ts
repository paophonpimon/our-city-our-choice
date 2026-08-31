import { describe, expect, it } from 'vitest'
import type { LocationId, LocationSummary } from '../domain/cityScoring'
import type { ClassroomRoundResult } from '../types/classroomGame'
import { calculateCumulativeBuildingImpact } from './buildingImpactDisplay'

const LOCATIONS: readonly LocationId[] = [
  'school',
  'construction',
  'market',
  'hospital',
  'police-station',
  'municipal-office',
  'news-office',
]

const summaries = (schoolScore: number): Record<LocationId, LocationSummary> =>
  Object.fromEntries(LOCATIONS.map((locationId) => [locationId, {
    integrityCount: schoolScore > 0 ? 1 : 0,
    corruptionCount: schoolScore < 0 ? 1 : 0,
    timeoutCount: 0,
    participantCount: locationId === 'school' ? 1 : 0,
    scoreTotal: locationId === 'school' ? schoolScore : 0,
    scoreAverage: locationId === 'school' ? schoolScore : 0,
  }])) as Record<LocationId, LocationSummary>

const round = (gameCycle: number, questionNumber: number, schoolScore: number): ClassroomRoundResult => ({
  gameCycle,
  questionNumber: questionNumber as ClassroomRoundResult['questionNumber'],
  integrityCount: 1,
  corruptionCount: 0,
  timeoutCount: 0,
  roundTotal: schoolScore,
  roundAverage: schoolScore,
  previousCityScore: 500,
  newCityScore: 500 + schoolScore,
  cityLevel: 'neutral',
  locationSummaries: summaries(schoolScore),
  finalizedAt: questionNumber,
})

const calculate = (
  roundHistory: readonly ClassroomRoundResult[],
  currentQuestionNumber: number,
  currentScore?: number,
  currentGameCycle = 1,
): number => calculateCumulativeBuildingImpact({
  currentGameCycle,
  currentQuestionNumber,
  currentLocationImpacts: currentScore === undefined ? null : summaries(currentScore),
  locationId: 'school',
  roundHistory,
})

describe('teacher cumulative building impact display', () => {
  it('shows the current Q1 impact', () => {
    expect(calculate([], 1, 12)).toBe(12)
  })

  it('shows Q1 + Q2 + the available current Q3 impact', () => {
    expect(calculate([round(1, 1, 10), round(1, 2, -4)], 3, 7)).toBe(13)
  })

  it('keeps completed impact when entering a new question without a current impact yet', () => {
    expect(calculate([round(1, 1, 10), round(1, 2, -4), round(1, 3, 7)], 4)).toBe(13)
  })

  it('does not double-count the current round after it appears in roundHistory', () => {
    expect(calculate([round(1, 1, 10), round(1, 2, -4), round(1, 3, 7)], 3, 7)).toBe(13)
  })

  it('excludes rounds from previous game cycles', () => {
    expect(calculate([round(1, 1, 100), round(2, 1, 8)], 2, -3, 2)).toBe(5)
  })

  it('does not mutate history or current summaries while calculating display data', () => {
    const history = [round(1, 1, 10), round(1, 2, -4)]
    const current = summaries(7)
    const beforeHistory = structuredClone(history)
    const beforeCurrent = structuredClone(current)

    expect(calculateCumulativeBuildingImpact({
      currentGameCycle: 1,
      currentQuestionNumber: 3,
      currentLocationImpacts: current,
      locationId: 'school',
      roundHistory: history,
    })).toBe(13)
    expect(history).toEqual(beforeHistory)
    expect(current).toEqual(beforeCurrent)
  })
})
