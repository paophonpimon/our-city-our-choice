import type { ClassroomGameService } from './classroomGameService'
import { DemoClassroomGameService } from './demoClassroomService'

const demoMode = import.meta.env.VITE_DEMO_MODE !== 'false'

const createService = async (): Promise<ClassroomGameService> => {
  if (demoMode) return new DemoClassroomGameService()
  const { FirebaseClassroomGameService } = await import('./firebaseClassroomService')
  return new FirebaseClassroomGameService()
}

export const classroomGameServicePromise = createService()
export { classroomFriendlyError } from './classroomGameService'
export type { ClassroomGameService } from './classroomGameService'
