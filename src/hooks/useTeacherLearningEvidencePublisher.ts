import { useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '../context/GameContext'
import {
  createClassroomPublicLearningEvidence,
  shouldPublishClassroomLearningEvidence,
} from '../domain/competitionEvidence'
import { classroomFriendlyError } from '../services'
import type {
  ClassroomAssessmentRecord,
  ClassroomPublicLearningEvidence,
  ClassroomRoom,
} from '../types/classroomGame'
import { useAssessmentEvidence, type Loadable } from './useGameData'

export const publishTeacherLearningEvidenceSnapshot = async (
  room: ClassroomRoom,
  records: readonly ClassroomAssessmentRecord[],
  publish: (evidence: ClassroomPublicLearningEvidence) => Promise<void>,
): Promise<ClassroomPublicLearningEvidence> => {
  const evidence = createClassroomPublicLearningEvidence(room.lockedPlayerCount, records)
  if (shouldPublishClassroomLearningEvidence(room.publicLearningEvidence, evidence)) {
    await publish(evidence)
  }
  return evidence
}

interface TeacherLearningEvidencePublisherState {
  evidenceState: Loadable<ClassroomAssessmentRecord[]>
  liveEvidence: ClassroomPublicLearningEvidence | null
  publishing: boolean
  publicationError: string
}

/**
 * Teacher-owned publisher mounted for the active classroom lifecycle.
 * ResultPage reuses it only as a final safety refresh; publication begins in
 * TeacherPage and never depends on a finished Result mount.
 */
export const useTeacherLearningEvidencePublisher = (
  room: ClassroomRoom | null,
  enabled: boolean,
): TeacherLearningEvidencePublisherState => {
  const { service, uid } = useGame()
  const roomId = room?.roomId ?? ''
  const participantCount = room?.lockedPlayerCount ?? 0
  const evidenceState = useAssessmentEvidence(roomId, enabled)
  const [publishing, setPublishing] = useState(false)
  const [publicationError, setPublicationError] = useState('')
  const publicationInFlightRef = useRef(false)
  const publicationQueuedRef = useRef(false)
  const [publicationRevision, setPublicationRevision] = useState(0)
  const evidenceReady = enabled
    && evidenceState.identityKey === roomId
    && !evidenceState.loading
    && !evidenceState.error
  const liveEvidence = useMemo(
    () => roomId && evidenceReady
      ? createClassroomPublicLearningEvidence(participantCount, evidenceState.data)
      : null,
    [evidenceReady, evidenceState.data, participantCount, roomId],
  )

  useEffect(() => {
    if (!room || !enabled || !evidenceReady || !liveEvidence) return
    if (!shouldPublishClassroomLearningEvidence(room.publicLearningEvidence, liveEvidence)) return
    if (publicationInFlightRef.current) {
      publicationQueuedRef.current = true
      return
    }

    publicationInFlightRef.current = true
    setPublishing(true)
    setPublicationError('')
    void publishTeacherLearningEvidenceSnapshot(
      room,
      evidenceState.data,
      (evidence) => service.publishLearningEvidence(room.roomId, uid, evidence),
    )
      .catch((reason: unknown) => setPublicationError(classroomFriendlyError(reason)))
      .finally(() => {
        publicationInFlightRef.current = false
        setPublishing(false)
        if (publicationQueuedRef.current) {
          publicationQueuedRef.current = false
          setPublicationRevision((revision) => revision + 1)
        }
      })
  }, [enabled, evidenceReady, evidenceState.data, liveEvidence, publicationRevision, room, service, uid])

  return { evidenceState, liveEvidence, publishing, publicationError }
}
