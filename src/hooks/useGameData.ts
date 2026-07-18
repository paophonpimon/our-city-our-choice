import { useEffect, useState } from 'react'
import { useGame } from '../context/GameContext'
import type {
  ClassroomAnswerRecord,
  ClassroomPlayer,
  ClassroomRoom,
  ClassroomRoundResult,
  PublicRoomQuestion,
} from '../types/classroomGame'

interface Loadable<T> {
  data: T
  loading: boolean
  error: string
}

const initial = <T,>(data: T): Loadable<T> => ({ data, loading: true, error: '' })

export const useRoom = (roomId: string): Loadable<ClassroomRoom | null> => {
  const { service } = useGame()
  const [state, setState] = useState(initial<ClassroomRoom | null>(null))
  useEffect(() => {
    if (!roomId) return setState({ data: null, loading: false, error: '' }), undefined
    setState(initial(null))
    return service.subscribeRoom(
      roomId,
      (data) => setState({ data, loading: false, error: '' }),
      (error) => setState((current) => ({ ...current, loading: false, error })),
    )
  }, [roomId, service])
  return state
}

export const usePlayers = (roomId: string): Loadable<ClassroomPlayer[]> => {
  const { service } = useGame()
  const [state, setState] = useState(initial<ClassroomPlayer[]>([]))
  useEffect(() => {
    if (!roomId) return setState({ data: [], loading: false, error: '' }), undefined
    return service.subscribePlayers(
      roomId,
      (data) => setState({ data, loading: false, error: '' }),
      (error) => setState((current) => ({ ...current, loading: false, error })),
    )
  }, [roomId, service])
  return state
}

export const usePlayer = (roomId: string, playerId: string): Loadable<ClassroomPlayer | null> => {
  const { service } = useGame()
  const [state, setState] = useState(initial<ClassroomPlayer | null>(null))
  useEffect(() => {
    if (!roomId || !playerId) return setState({ data: null, loading: false, error: '' }), undefined
    return service.subscribePlayer(
      roomId,
      playerId,
      (data) => setState({ data, loading: false, error: '' }),
      (error) => setState((current) => ({ ...current, loading: false, error })),
    )
  }, [playerId, roomId, service])
  return state
}

export const useQuestions = (roomId: string): Loadable<PublicRoomQuestion[]> => {
  const { service } = useGame()
  const [state, setState] = useState(initial<PublicRoomQuestion[]>([]))
  useEffect(() => {
    if (!roomId) return setState({ data: [], loading: false, error: '' }), undefined
    return service.subscribeQuestions(
      roomId,
      (data) => setState({ data, loading: false, error: '' }),
      (error) => setState((current) => ({ ...current, loading: false, error })),
    )
  }, [roomId, service])
  return state
}

export const useAnswers = (roomId: string): Loadable<ClassroomAnswerRecord[]> => {
  const { service } = useGame()
  const [state, setState] = useState(initial<ClassroomAnswerRecord[]>([]))
  useEffect(() => {
    if (!roomId) return setState({ data: [], loading: false, error: '' }), undefined
    return service.subscribeAnswers(
      roomId,
      (data) => setState({ data, loading: false, error: '' }),
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
    if (!roomId || !playerId || !ownerUid) return setState({ data: [], loading: false, error: '' }), undefined
    return service.subscribePlayerAnswers(
      roomId,
      playerId,
      ownerUid,
      (data) => setState({ data, loading: false, error: '' }),
      (error) => setState((current) => ({ ...current, loading: false, error })),
    )
  }, [ownerUid, playerId, roomId, service])
  return state
}

export const useRounds = (roomId: string): Loadable<ClassroomRoundResult[]> => {
  const { service } = useGame()
  const [state, setState] = useState(initial<ClassroomRoundResult[]>([]))
  useEffect(() => {
    if (!roomId) return setState({ data: [], loading: false, error: '' }), undefined
    return service.subscribeRounds(
      roomId,
      (data) => setState({ data, loading: false, error: '' }),
      (error) => setState((current) => ({ ...current, loading: false, error })),
    )
  }, [roomId, service])
  return state
}
