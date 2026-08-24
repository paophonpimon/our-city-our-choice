const DIRECT_SCENE_ROLES = ['doctor', 'municipal', 'police', 'merchant', 'contractor', 'student'] as const
const ALL_QUESTION_NUMBERS = Array.from({ length: 10 }, (_, index) => index + 1)
const TEACHER_SCENE_NUMBERS = ALL_QUESTION_NUMBERS

const directSceneEntries = DIRECT_SCENE_ROLES.flatMap((roleId) =>
  ALL_QUESTION_NUMBERS.map((questionNumber) => {
    const paddedNumber = String(questionNumber).padStart(2, '0')
    const questionId = `${roleId}-${paddedNumber}`
    const sourceFilename = questionId === 'contractor-09' ? 'contractor-9.webp' : `${questionId}.webp`
    return [questionId, `/assets/question-scenes/${roleId}/${sourceFilename}`] as const
  }),
)

const teacherSceneEntries = TEACHER_SCENE_NUMBERS.map((questionNumber) => {
  const questionId = `teacher-${String(questionNumber).padStart(2, '0')}`
  return [questionId, `/assets/question-scenes/teacher/${questionId}.webp`] as const
})

// Journalist scene filenames intentionally match the canonical question
// number one-to-one.
const journalistSceneEntries = [
  ['journalist-01', '/assets/question-scenes/journalist/news-01.webp'],
  ['journalist-02', '/assets/question-scenes/journalist/news-02.webp'],
  ['journalist-03', '/assets/question-scenes/journalist/news-03.webp'],
  ['journalist-04', '/assets/question-scenes/journalist/news-04.webp'],
  ['journalist-05', '/assets/question-scenes/journalist/news-05.webp'],
  ['journalist-06', '/assets/question-scenes/journalist/news-06.webp'],
  ['journalist-07', '/assets/question-scenes/journalist/news-07.webp'],
  ['journalist-08', '/assets/question-scenes/journalist/news-08.webp'],
  ['journalist-09', '/assets/question-scenes/journalist/news-09.webp'],
  ['journalist-10', '/assets/question-scenes/journalist/news-10.webp'],
] as const

export const QUESTION_SCENE_IMAGE_BY_QUESTION_ID: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries([
  ...directSceneEntries,
  ...teacherSceneEntries,
  ...journalistSceneEntries,
]))

export const resolveQuestionSceneImageUrl = (questionId: string, configuredImageUrl: string | null): string | null =>
  configuredImageUrl?.trim() || QUESTION_SCENE_IMAGE_BY_QUESTION_ID[questionId] || null

export const hideFailedQuestionScene = (image: HTMLImageElement): void => {
  image.closest('.game-play-question-media')?.setAttribute('hidden', '')
  image.closest('.game-play-question-layout')?.classList.remove('has-scene')
}
