import type { LocationId } from '../domain/cityScoring'

export const createClassroomJoinUrl = (origin: string, roomId: string): string =>
  `${origin.replace(/\/$/, '')}/join?room=${encodeURIComponent(roomId.trim().toUpperCase())}`

export const normalizeJoinRoomId = (value: string | null): string => (value ?? '').trim().toUpperCase()

export const LOCATION_POSITIONS = {
  hospital: { x: 31, y: 53 },
  'municipal-office': { x: 54, y: 75 },
  'police-station': { x: 68, y: 53 },
  school: { x: 31, y: 23 },
  market: { x: 86, y: 34 },
  construction: { x: 61, y: 20 },
  'news-office': { x: 82, y: 76 },
} as const satisfies Record<LocationId, { x: number; y: number }>
