import type { LocationId } from '../domain/cityScoring'

export const createClassroomJoinUrl = (origin: string, roomId: string): string =>
  `${origin.replace(/\/$/, '')}/join?room=${encodeURIComponent(roomId.trim().toUpperCase())}`

export const normalizeJoinRoomId = (value: string | null): string => (value ?? '').trim().toUpperCase()

export const LOCATION_POSITIONS = {
  hospital: { x: 36, y: 49 },
  'municipal-office': { x: 16, y: 50 },
  'police-station': { x: 62, y: 49 },
  school: { x: 48, y: 79 },
  market: { x: 84, y: 49 },
  construction: { x: 17, y: 79 },
  'news-office': { x: 83, y: 79 },
} as const satisfies Record<LocationId, { x: number; y: number }>
