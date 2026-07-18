import type { TeacherSession, TeamSession } from '../types/game'
import type { ClassroomStudentSession, ClassroomTeacherSession } from '../types/classroomGame'

const TEAM_SESSION_KEY = 'matana_team_session'
const TEACHER_SESSION_KEY = 'matana_teacher_session'
const CLASSROOM_STUDENT_SESSION_KEY = 'our_city_student_session_v1'
const CLASSROOM_TEACHER_SESSION_KEY = 'our_city_teacher_session_v1'

const safeParse = <T>(value: string | null): T | null => {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export const getTeamSession = (): TeamSession | null => safeParse<TeamSession>(localStorage.getItem(TEAM_SESSION_KEY))

export const saveTeamSession = (session: TeamSession): void => {
  localStorage.setItem(TEAM_SESSION_KEY, JSON.stringify(session))
}

export const clearTeamSession = (): void => localStorage.removeItem(TEAM_SESSION_KEY)

export const getTeacherSession = (): TeacherSession | null =>
  safeParse<TeacherSession>(localStorage.getItem(TEACHER_SESSION_KEY))

export const saveTeacherSession = (session: TeacherSession): void => {
  localStorage.setItem(TEACHER_SESSION_KEY, JSON.stringify(session))
}

export const clearTeacherSession = (): void => localStorage.removeItem(TEACHER_SESSION_KEY)

export const getClassroomStudentSession = (): ClassroomStudentSession | null =>
  safeParse<ClassroomStudentSession>(localStorage.getItem(CLASSROOM_STUDENT_SESSION_KEY))

export const saveClassroomStudentSession = (session: ClassroomStudentSession): void => {
  localStorage.setItem(CLASSROOM_STUDENT_SESSION_KEY, JSON.stringify(session))
}

export const clearClassroomStudentSession = (): void => localStorage.removeItem(CLASSROOM_STUDENT_SESSION_KEY)

export const getClassroomTeacherSession = (): ClassroomTeacherSession | null =>
  safeParse<ClassroomTeacherSession>(localStorage.getItem(CLASSROOM_TEACHER_SESSION_KEY))

export const saveClassroomTeacherSession = (session: ClassroomTeacherSession): void => {
  localStorage.setItem(CLASSROOM_TEACHER_SESSION_KEY, JSON.stringify(session))
}

export const clearClassroomTeacherSession = (): void => localStorage.removeItem(CLASSROOM_TEACHER_SESSION_KEY)
