import { Link, Navigate, useParams } from 'react-router-dom'
import { CityLoader } from '../components/CityLoader'
import { BrandHeader, ErrorPanel, ScenePage } from '../components/Layout'
import { TeacherCompetitionEvidenceDashboard } from '../components/TeacherCompetitionEvidenceDashboard'
import { useRoom } from '../hooks/useGameData'
import { useTeacherLearningEvidencePublisher } from '../hooks/useTeacherLearningEvidencePublisher'
import {
  getClassroomStudentSession,
  getClassroomTeacherSession,
  getClassroomViewerRole,
} from '../services/sessionStorage'

export const TeacherEvidencePage = () => {
  const roomId = (useParams().roomCode ?? '').toUpperCase()
  const teacherSession = getClassroomTeacherSession()
  const studentSession = getClassroomStudentSession()
  const viewerRole = getClassroomViewerRole()
  const isTeacher = teacherSession?.roomId === roomId
    && (viewerRole === 'teacher' || (viewerRole === null && studentSession?.roomId !== roomId))
  const roomState = useRoom(roomId)
  const evidencePublisher = useTeacherLearningEvidencePublisher(
    roomState.data,
    isTeacher && roomState.data?.status === 'finished',
  )
  const evidenceState = evidencePublisher.evidenceState

  if (!roomId) return <Navigate replace to="/teacher" />
  if (roomState.loading) return <CityLoader variant="full" message="กำลังเตรียมหลักฐานการเรียนรู้และพัฒนา…" />

  if (!isTeacher) {
    return (
      <ScenePage compact>
        <BrandHeader backTo="/" />
        <div className="flex flex-1 items-center px-5 pb-8">
          <ErrorPanel
            action={<Link className="primary-button inline-flex w-full items-center justify-center" to={`/result/${roomId}`}>ดูผลสรุปสาธารณะ</Link>}
            message="หลักฐานการประเมินหน้านี้เปิดได้เฉพาะครูผู้สร้างห้องจากอุปกรณ์นี้"
          />
        </div>
      </ScenePage>
    )
  }

  if (!roomState.data) return <Navigate replace to="/teacher" />
  if (roomState.data.status !== 'finished') {
    return (
      <ScenePage compact>
        <BrandHeader backTo={`/result/${roomId}`} />
        <div className="flex flex-1 items-center px-5 pb-8">
          <ErrorPanel
            action={<Link className="primary-button inline-flex w-full items-center justify-center" to={`/result/${roomId}`}>กลับหน้าผลกิจกรรม</Link>}
            message="แดชบอร์ดหลักฐานการเรียนรู้และพัฒนาจะแสดงเมื่อกิจกรรมจบแล้ว"
          />
        </div>
      </ScenePage>
    )
  }

  return (
    <main className="teacher-evidence-page">
      <nav className="teacher-evidence-page__nav" aria-label="การนำทางหลักฐานการเรียนรู้และพัฒนา">
        <Link to={`/result/${roomId}`}>← กลับหน้าผลกิจกรรม</Link>
        <span>ห้อง {roomId}</span>
      </nav>
      <TeacherCompetitionEvidenceDashboard
        error={evidenceState.error || evidencePublisher.publicationError || roomState.error}
        loading={evidenceState.loading}
        records={evidenceState.data}
        room={roomState.data}
      />
    </main>
  )
}
