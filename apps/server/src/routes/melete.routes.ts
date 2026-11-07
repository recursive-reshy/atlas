// Express
import { Router } from 'express'
// Controllers
import {
  getMeleteNote,
  getMeleteSyllabus,
  getMeleteSubject,
  getMeleteToday,
  getReviewNext,
  patchMeleteNote,
  patchMeleteSubject,
  postGradeAnswer,
  postApproveSyllabus,
  postDraftSyllabus,
  postDropQuestion,
  postRecordReview,
  postRemapSyllabus,
  postRegenerateNote,
  postRetryGeneration,
  postSubjectEnrollment,
  putMeleteSyllabus,
} from '../controllers/melete.controller.js'

export const meleteRoutes: Router = Router()

meleteRoutes.get( '/melete/today', getMeleteToday )
meleteRoutes.get( '/melete/subjects/:id', getMeleteSubject )
meleteRoutes.patch( '/melete/subjects/:id', patchMeleteSubject )
meleteRoutes.post( '/melete/subjects/:id/enrollment', postSubjectEnrollment )
meleteRoutes.post( '/melete/subjects/:id/syllabus/draft', postDraftSyllabus )
meleteRoutes.get( '/melete/subjects/:id/syllabus', getMeleteSyllabus )
meleteRoutes.put( '/melete/subjects/:id/syllabus', putMeleteSyllabus )
meleteRoutes.post( '/melete/subjects/:id/syllabus/approve', postApproveSyllabus )
meleteRoutes.post( '/melete/subjects/:id/syllabus/remap', postRemapSyllabus )
meleteRoutes.get( '/melete/notes/:id', getMeleteNote )
meleteRoutes.patch( '/melete/notes/:id', patchMeleteNote )
meleteRoutes.post( '/melete/notes/:id/regenerate', postRegenerateNote )
meleteRoutes.post( '/melete/notes/:id/retry', postRetryGeneration )
meleteRoutes.post( '/melete/questions/:id/drop', postDropQuestion )
meleteRoutes.get( '/melete/review/next', getReviewNext )
meleteRoutes.post( '/melete/questions/:id/grade', postGradeAnswer )
meleteRoutes.post( '/melete/questions/:id/review', postRecordReview )
