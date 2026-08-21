import { isRoomQuestionSnapshot, type RoomQuestionSnapshot } from '../domain/classroomQuestions'

export interface StorageLike {
  readonly length?: number
  key?(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const SNAPSHOT_KEY_PREFIX = 'our_city_teacher_question_snapshot_v1:'
export const getTeacherSnapshotStorageKey = (roomId: string): string => `${SNAPSHOT_KEY_PREFIX}${roomId}`

export const serializeTeacherSnapshot = (snapshot: RoomQuestionSnapshot): string => JSON.stringify(snapshot)

export const deserializeTeacherSnapshot = (serialized: string): RoomQuestionSnapshot | null => {
  try {
    const value: unknown = JSON.parse(serialized)
    return isRoomQuestionSnapshot(value) ? value : null
  } catch {
    return null
  }
}

const browserStorage = (): StorageLike => localStorage

export const saveTeacherSnapshot = (snapshot: RoomQuestionSnapshot, storage = browserStorage()): void => {
  storage.setItem(getTeacherSnapshotStorageKey(snapshot.roomId), serializeTeacherSnapshot(snapshot))
}

export const restoreTeacherSnapshot = (roomId: string, storage = browserStorage()): RoomQuestionSnapshot | null => {
  const serialized = storage.getItem(getTeacherSnapshotStorageKey(roomId))
  if (!serialized) return null
  const snapshot = deserializeTeacherSnapshot(serialized)
  return snapshot?.roomId === roomId ? snapshot : null
}

export const clearTeacherSnapshot = (roomId: string, storage = browserStorage()): void => {
  storage.removeItem(getTeacherSnapshotStorageKey(roomId))
}

export const clearAllTeacherSnapshots = (storage = browserStorage()): void => {
  const snapshotKeys: string[] = []
  for (let index = 0; index < (storage.length ?? 0); index += 1) {
    const key = storage.key?.(index)
    if (key?.startsWith(SNAPSHOT_KEY_PREFIX)) snapshotKeys.push(key)
  }
  snapshotKeys.forEach((key) => storage.removeItem(key))
}
