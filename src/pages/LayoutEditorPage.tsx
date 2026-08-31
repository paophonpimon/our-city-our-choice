import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CityStage } from '../components/CityStage'
import { INITIAL_BUILDING_LEVELS } from '../domain/cityBuildings'
import type { ClassroomRoom } from '../types/classroomGame'

const LAYOUT_EDITOR_ROOM: ClassroomRoom = {
  roomId: 'LAYOUT EDITOR',
  teacherSessionId: 'layout-editor',
  status: 'playing',
  gameCycle: 0,
  completedGameCount: 0,
  currentQuestionNumber: 1,
  currentCrisisEventIndex: 0,
  currentCrisisEventId: null,
  questionDurationSec: 30,
  questionStartedAt: null,
  questionDeadlineAt: null,
  lockedPlayerCount: 0,
  cityScore: 500,
  cityLevel: 'neutral',
  buildingLevels: INITIAL_BUILDING_LEVELS,
  integrityTotal: 0,
  corruptionTotal: 0,
  timeoutTotal: 0,
  roleRotation: [],
  preAssessmentOpened: false,
  createdAt: 0,
  updatedAt: 0,
}

export const LayoutEditorPage = () => {
  const navigate = useNavigate()

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'ปรับโมเดลตึก | Our City, Our Choice'
    return () => { document.title = previousTitle }
  }, [])

  return (
    <CityStage
      answerCount={0}
      layoutMode
      locationImpacts={null}
      onExitLayoutMode={() => navigate('/teacher')}
      remainingSeconds={0}
      room={LAYOUT_EDITOR_ROOM}
      roundImpact={null}
      visualBuildingLevels={LAYOUT_EDITOR_ROOM.buildingLevels}
      visualCityLevel={LAYOUT_EDITOR_ROOM.cityLevel}
    />
  )
}
