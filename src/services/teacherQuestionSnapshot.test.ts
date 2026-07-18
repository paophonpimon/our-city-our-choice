import { describe, expect, it } from 'vitest'
import { createRoomQuestionSnapshot } from '../domain/classroomQuestions'
import { createTrustedQuestions } from '../test/classroomFixtures'
import {
  deserializeTeacherSnapshot,
  getTeacherSnapshotStorageKey,
  restoreTeacherSnapshot,
  saveTeacherSnapshot,
  type StorageLike,
} from './teacherQuestionSnapshot'

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>()
  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
  removeItem(key: string): void {
    this.values.delete(key)
  }
}

describe('teacher trusted snapshot restore', () => {
  it('serializes and restores integrity mapping after refresh', () => {
    const storage = new MemoryStorage()
    const snapshot = createRoomQuestionSnapshot('ROOM01', createTrustedQuestions(), 100)
    saveTeacherSnapshot(snapshot, storage)

    const restored = restoreTeacherSnapshot('ROOM01', storage)
    expect(restored).toEqual(snapshot)
    expect(restored?.trustedQuestions[0]?.integrityChoiceId).toBe('doctor-01-c1')
    expect(storage.getItem(getTeacherSnapshotStorageKey('ROOM01'))).not.toBeNull()
  })

  it('rejects corrupt, mismatched, or incomplete snapshots', () => {
    const storage = new MemoryStorage()
    storage.setItem(getTeacherSnapshotStorageKey('ROOM01'), '{broken')
    expect(restoreTeacherSnapshot('ROOM01', storage)).toBeNull()
    expect(deserializeTeacherSnapshot(JSON.stringify({ schemaVersion: 1, roomId: 'ROOM01' }))).toBeNull()

    const snapshot = createRoomQuestionSnapshot('OTHER', createTrustedQuestions(), 100)
    storage.setItem(getTeacherSnapshotStorageKey('ROOM01'), JSON.stringify(snapshot))
    expect(restoreTeacherSnapshot('ROOM01', storage)).toBeNull()
  })
})
