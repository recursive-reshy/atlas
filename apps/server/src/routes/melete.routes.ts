// Express
import { Router } from 'express'
// Controllers
import {
  getMeleteGaps,
  getMeleteNote,
  getMeleteSyllabus,
  getMeleteSubject,
  getMeleteToday,
  getReviewNext,
  patchMeleteNote,
  patchMeleteSubject,
  postGradeAnswer,
  postOffSyllabus,
  postApproveSyllabus,
  postDraftSyllabus,
  postDropQuestion,
  postRecordReview,
  postRemapSyllabus,
  postRegenerateNote,
  postRetryGeneration,
  postSubjectEnrollment,
  putMeleteSyllabus,
  putNoteConcepts,
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
meleteRoutes.get( '/melete/subjects/:id/gaps', getMeleteGaps )
meleteRoutes.post( '/melete/subjects/:id/syllabus/remap', postRemapSyllabus )
meleteRoutes.get( '/melete/notes/:id', getMeleteNote )
meleteRoutes.patch( '/melete/notes/:id', patchMeleteNote )
meleteRoutes.put( '/melete/notes/:id/concepts', putNoteConcepts )
meleteRoutes.post( '/melete/notes/:id/off-syllabus', postOffSyllabus )
meleteRoutes.post( '/melete/notes/:id/regenerate', postRegenerateNote )
meleteRoutes.post( '/melete/notes/:id/retry', postRetryGeneration )
meleteRoutes.post( '/melete/questions/:id/drop', postDropQuestion )
meleteRoutes.get( '/melete/review/next', getReviewNext )
meleteRoutes.post( '/melete/questions/:id/grade', postGradeAnswer )
meleteRoutes.post( '/melete/questions/:id/review', postRecordReview )
