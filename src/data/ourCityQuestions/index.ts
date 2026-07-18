import type { QuestionBank } from '../../domain/questionBank'
import { contractorQuestions } from './contractor'
import { journalistQuestions } from './journalist'
import { doctorQuestions } from './doctor'
import { merchantQuestions } from './merchant'
import { municipalQuestions } from './municipal'
import { policeQuestions } from './police'
import { studentQuestions } from './student'
import { teacherQuestions } from './teacher'

/** Structure only: no question content is canonical yet. */
export const OUR_CITY_QUESTION_BANK_SCAFFOLD: QuestionBank = {
  doctor: doctorQuestions,
  municipal: municipalQuestions,
  police: policeQuestions,
  teacher: teacherQuestions,
  merchant: merchantQuestions,
  contractor: contractorQuestions,
  student: studentQuestions,
  journalist: journalistQuestions,
}
