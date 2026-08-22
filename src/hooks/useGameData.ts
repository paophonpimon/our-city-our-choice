import { useEffect, useState } from 'react'
import { useGame } from '../context/GameContext'
import { subscribeWithIdentityGuard } from '../services/subscriptionLifecycle'
// TEMPORARY DIAGNOSTIC — remove alongside src/debug when done
import { debugLog, isDebugMode } from '../debug/useDebugLog'
import type {
  ClassroomAnswerRecord,
  ClassroomPlayer,
  ClassroomRoom,
  ClassroomRoundResult,
  ClassroomCrisisResult,
  ClassroomPersonalDecisionResult,
  PublicRoomQuestion,
} from '../types/classroomGame'

interface Loadable<T> {
  data: T
  loading: boolean
  error: string
  identityKey: string
}

const initial = <T,>(data: T, identityKey = ''): Loadable<T> => ({ data, loading: true, error: '', identityKey })

export const useRoom = (roomId: string): Loadable<ClassroomRoom | null> => {
  const { service } = useGame()
  const [state, setState] = useState(initial<ClassroomRoom | null>(null))
  useEffect(() => {
    if (!roomId) return setState({ data: null, loading: false, error: '', identityKey: '' }), undefined
    setState(initial(null, roomId))
    return subscribeWithIdentityGuard<ClassroomRoom | null>(
      (listener, onError) => service.subscribeRoom(roomId, listener, onError),
      (data) => {
        if (isDebugMode()) debugLog('hook', 'room snapshot', `status=${data?.status ?? 'null'} q=${data?.currentQuestionNumber ?? '-'} deadline=${data?.questionDeadlineAt ?? 'null'}`)
        setState({ data, loading: false, error: '', identityKey: roomId })
      },
      (error) => setState((current) => ({ ...current, loading: false, error })),
    )
  }, [roomId, service])
  return state
}

export const usePlayers = (roomId: string): Loadable<ClassroomPlayer[]> => {
  const { service } = useGame()
  const [state, setState] = useState(initial<ClassroomPlayer[]>([]))
  useEffect(() => {
    if (!roomId) return setState({ data: [], loading: false, error: '', identityKey: '' }), undefined
    setState(initial([], roomId))
    return subscribeWithIdentityGuard<ClassroomPlayer[]>(
      (listener, onError) => service.subscribePlayers(roomId, listener, onError),
      (data) => {
        if (isDebugMode()) debugLog('hook', 'players snapshot', `count=${data.length}`)
        setState({ data, loading: false, error: '', identityKey: roomId })
      },
      (error) => setState((current) => ({ ...current, loading: false, error })),
    )
  }, [roomId, service])
  return state
}

export const usePlayer = (roomId: string, playerId: string): Loadable<ClassroomPlayer | null> => {
  const { service } = useGame()
  const [state, setState] = useState(initial<ClassroomPlayer | null>(null))
  useEffect(() => {
    const identityKey = `${roomId}:${playerId}`
    if (!roomId || !playerId) return setState({ data: null, loading: false, error: '', identityKey: '' }), undefined
    setState(initial(null, identityKey))
    return subscribeWithIdentityGuard<ClassroomPlayer | null>(
      (listener, onError) => service.subscribePlayer(roomId, playerId, listener, onError),
      (data) => setState({ data, loading: false, error: '', identityKey }),
      (error) => setState((current) => ({ ...current, loading: false, error })),
    )
  }, [playerId, roomId, service])
  return state
}

export const useQuestions = (roomId: string): Loadable<PublicRoomQuestion[]> => {
  const { service } = useGame()
  const [state, setState] = useState(initial<PublicRoomQuestion[]>([]))
  useEffect(() => {
    if (!roomId) return setState({ data: [], loading: false, error: '', identityKey: '' }), undefined
    setState(initial([], roomId))
    return subscribeWithIdentityGuard<PublicRoomQuestion[]>(
      (listener, onError) => service.subscribeQuestions(roomId, listener, onError),
      (data) => setState({ data, loading: false, error: '', identityKey: roomId }),
      (error) => setState((current) => ({ ...current, loading: false, error })),
    )
  }, [roomId, service])
  return state
}

export const useAnswers = (roomId: string): Loadable<ClassroomAnswerRecord[]> => {
  const { service } = useGame()
  const [state, setState] = useState(initial<ClassroomAnswerRecord[]>([]))
  useEffect(() => {
    if (!roomId) return setState({ data: [], loading: false, error: '', identityKey: '' }), undefined
    setState(initial([], roomId))
    return subscribeWithIdentityGuard<ClassroomAnswerRecord[]>(
      (listener, onError) => service.subscribeAnswers(roomId, listener, onError),
      (data) => {
        if (isDebugMode()) debugLog('hook', 'answers snapshot', `count=${data.length}`)
        setState({ data, loading: false, error: '', identityKey: roomId })
      },
      (error) => setState((current) => ({ ...current, loading: false, error })),
    )
  }, [roomId, service])
  return state
}

export const usePlayerAnswers = (
  roomId: string,
  playerId: string,
  ownerUid: string,
): Loadable<ClassroomAnswerRecord[]> => {
  const { service } = useGame()
  const [state, setState] = useState(initial<ClassroomAnswerRecord[]>([]))
  useEffect(() => {
    const identityKey = `${roomId}:${playerId}:${ownerUid}`
    if (!roomId || !playerId || !ownerUid) return setState({ data: [], loading: false, error: '', identityKey: '' }), undefined
    setState(initial([], identityKey))
    return subscribeWithIdentityGuard<ClassroomAnswerRecord[]>(
      (listener, onError) => service.subscribePlayerAnswers(roomId, playerId, ownerUid, listener, onError),
      (data) => {
        if (isDebugMode()) debugLog('student', 'answer snapshot rcvd', `count=${data.length}`)
        setState({ data, loading: false, error: '', identityKey })
      },
      (error) => setState((current) => ({ ...current, loading: false, error })),
    )
  }, [ownerUid, playerId, roomId, service])
  return state
}

export const useRounds = (roomId: string): Loadable<ClassroomRoundResult[]> => {
  const { service } = useGame()
  const [state, setState] = useState(initial<ClassroomRoundResult[]>([]))
  useEffect(() => {
    if (!roomId) return setState({ data: [], loading: false, error: '', identityKey: '' }), undefined
    setState(initial([], roomId))
    return subscribeWithIdentityGuard<ClassroomRoundResult[]>(
      (listener, onError) => service.subscribeRounds(roomId, listener, onError),
      (data) => setState({ data, loading: false, error: '', identityKey: roomId }),
      (error) => setState((current) => ({ ...current, loading: false, error })),
    )
  }, [roomId, service])
  return state
}

export const useCrisisResults = (roomId: string): Loadable<ClassroomCrisisResult[]> => {
  const { service } = useGame()
  const [state, setState] = useState(initial<ClassroomCrisisResult[]>([]))
  useEffect(() => {
    if (!roomId) return setState({ data: [], loading: false, error: '', identityKey: '' }), undefined
    setState(initial([], roomId))
    return subscribeWithIdentityGuard<ClassroomCrisisResult[]>(
      (listener, onError) => service.subscribeCrisisResults(roomId, listener, onError),
      (data) => setState({ data, loading: false, error: '', identityKey: roomId }),
      (error) => setState((current) => ({ ...current, loading: false, error })),
    )
  }, [roomId, service])
  return state
}

export const usePersonalDecisionResults = (
  roomId: string,
  playerId: string,
  ownerUid: string,
): Loadable<ClassroomPersonalDecisionResult[]> => {
  const { service } = useGame()
  const [state, setState] = useState(initial<ClassroomPersonalDecisionResult[]>([]))
  useEffect(() => {
    if (!roomId || !playerId || !ownerUid) {
      setState({ data: [], loading: false, error: '', identityKey: '' })
      return undefined
    }
    const identityKey = `${roomId}:${playerId}:${ownerUid}`
    setState(initial([], identityKey))
    return subscribeWithIdentityGuard<ClassroomPersonalDecisionResult[]>(
      (listener, onError) => service.subscribePersonalDecisionResults(roomId, playerId, ownerUid, listener, onError),
      (data) => setState({ data, loading: false, error: '', identityKey }),
      (error) => setState((current) => ({ ...current, loading: false, error })),
    )
  }, [ownerUid, playerId, roomId, service])
  return state
}
