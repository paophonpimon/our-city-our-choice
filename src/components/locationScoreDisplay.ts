import type { LocationId } from '../domain/cityScoring'
import { LOCATION_POSITIONS } from './classroomUi'

export const SCORE_POSITIONS: Record<LocationId, { x: number; y: number }> = {
  hospital: { x: LOCATION_POSITIONS.hospital.x, y: 43 },
  'municipal-office': { x: LOCATION_POSITIONS['municipal-office'].x, y: 61 },
  'police-station': { x: LOCATION_POSITIONS['police-station'].x, y: 43 },
  school: { x: LOCATION_POSITIONS.school.x, y: 8 },
  market: { x: LOCATION_POSITIONS.market.x, y: 20 },
  construction: { x: LOCATION_POSITIONS.construction.x, y: 7 },
  'news-office': { x: LOCATION_POSITIONS['news-office'].x, y: 65 },
}

export const signedLocationScore = (value: number): string => {
  const rounded = Math.round(value)
  if (rounded > 0) return `+${rounded}`
  if (rounded < 0) return `−${Math.abs(rounded)}`
  return '0'
}

