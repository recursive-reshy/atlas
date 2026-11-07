// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import {
  ApproveMeleteSyllabusResponse,
  RemapMeleteSyllabusResponse,
  EnrollSubjectBody,
  GetMeleteNoteResponse,
  GetMeleteSubjectResponse,
  GetMeleteTodayResponse,
  GetNextReviewResponse,
  GradeAnswerBody,
  GradeAnswerResponse,
  MeleteQuestion,
  MeleteSubject,
  MeleteSyllabus,
  MeleteSyllabusEdit,
  RecordReviewBody,
  RecordReviewResponse,
  SaveMeleteSyllabusResponse,
  UpdateMeleteNoteBody,
  UpdateMeleteSubjectBody,
} from '@atlas/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import {
  dropQuestion,
  getNote,
  getSubject,
  getToday,
  regenerateNote,
  retryGeneration,
  setNoteEnrolled,
  setSubjectEnrolled,
  updateSubject,
} from '../services/melete.service.js'
import { getNextReview, gradeAnswer, recordReview } from '../services/meleteReview.service.js'
import {
  approveSyllabus,
  remapSyllabus,
  getSyllabus,
  requestSyllabusDraft,
  saveSyllabus,
} from '../services/meleteSyllabus.service.js'

const Id = z.uuid()

export const getMeleteToday = async (
  req: Request,
  res: Response< GetMeleteTodayResponse >,
): Promise< void > => {
  res.status( 200 ).json( await getToday( currentUser( req ).id ) )
}

export const getMeleteSubject = async (
  req: Request,
  res: Response< GetMeleteSubjectResponse >,
): Promise< void > => {
  res.status( 200 ).json( await getSubject( currentUser( req ).id, Id.parse( req.params.id ) ) )
}

export const patchMeleteSubject = (
  req: Request,
  res: Response< { subject: MeleteSubject } >,
): void => {
  const subject = updateSubject(
    currentUser( req ).id,
    Id.parse( req.params.id ),
    UpdateMeleteSubjectBody.parse( req.body ),
  )

  res.status( 200 ).json( { subject } )
}

export const postDraftSyllabus = (
  req: Request,
  res: Response< { subject: MeleteSubject } >,
): void => {
  const subject = requestSyllabusDraft( currentUser( req ).id, Id.parse( req.params.id ) )

  res.status( 202 ).json( { subject } )
}

export const getMeleteSyllabus = (
  req: Request,
  res: Response< MeleteSyllabus >,
): void => {
  res.status( 200 ).json( getSyllabus( currentUser( req ).id, Id.parse( req.params.id ) ) )
}

export const putMeleteSyllabus = (
  req: Request,
  res: Response< SaveMeleteSyllabusResponse >,
): void => {
  res.status( 200 ).json( saveSyllabus(
    currentUser( req ).id,
    Id.parse( req.params.id ),
    MeleteSyllabusEdit.parse( req.body ),
  ) )
}

export const postApproveSyllabus = (
  req: Request,
  res: Response< ApproveMeleteSyllabusResponse >,
): void => {
  const subject = approveSyllabus( currentUser( req ).id, Id.parse( req.params.id ) )

  res.status( 200 ).json( { subject } )
}

export const postRemapSyllabus = (
  req: Request,
  res: Response< RemapMeleteSyllabusResponse >,
): void => {
  res.status( 202 ).json( remapSyllabus( currentUser( req ).id, Id.parse( req.params.id ) ) )
}

export const postSubjectEnrollment = async (
  req: Request,
  res: Response< GetMeleteSubjectResponse >,
): Promise< void > => {
  const { enrolled } = EnrollSubjectBody.parse( req.body )

  res.status( 200 ).json(
    await setSubjectEnrolled( currentUser( req ).id, Id.parse( req.params.id ), enrolled ),
  )
}

export const getMeleteNote = (
  req: Request,
  res: Response< GetMeleteNoteResponse >,
): void => {
  res.status( 200 ).json( getNote( currentUser( req ).id, Id.parse( req.params.id ) ) )
}

export const patchMeleteNote = (
  req: Request,
  res: Response< GetMeleteNoteResponse >,
): void => {
  const { enrolled } = UpdateMeleteNoteBody.parse( req.body )

  res.status( 200 ).json(
    setNoteEnrolled( currentUser( req ).id, Id.parse( req.params.id ), enrolled ),
  )
}

export const postRegenerateNote = (
  req: Request,
  res: Response< GetMeleteNoteResponse >,
): void => {
  res.status( 202 ).json( regenerateNote( currentUser( req ).id, Id.parse( req.params.id ) ) )
}

export const postRetryGeneration = (
  req: Request,
  res: Response< GetMeleteNoteResponse >,
): void => {
  res.status( 202 ).json( retryGeneration( currentUser( req ).id, Id.parse( req.params.id ) ) )
}

export const postDropQuestion = (
  req: Request,
  res: Response< { question: MeleteQuestion } >,
): void => {
  res.status( 200 ).json( {
    question: dropQuestion( currentUser( req ).id, Id.parse( req.params.id ) ),
  } )
}

export const getReviewNext = async (
  req: Request,
  res: Response< GetNextReviewResponse >,
): Promise< void > => {
  const { subject } = z.object( { subject: Id.optional() } ).parse( req.query )

  res.status( 200 ).json( await getNextReview( currentUser( req ).id, { subjectId: subject } ) )
}

export const postGradeAnswer = async (
  req: Request,
  res: Response< GradeAnswerResponse >,
): Promise< void > => {
  const grade = await gradeAnswer(
    currentUser( req ).id,
    Id.parse( req.params.id ),
    GradeAnswerBody.parse( req.body ),
  )

  res.status( 200 ).json( grade )
}

export const postRecordReview = async (
  req: Request,
  res: Response< RecordReviewResponse >,
): Promise< void > => {
  const review = await recordReview(
    currentUser( req ).id,
    Id.parse( req.params.id ),
    RecordReviewBody.parse( req.body ),
  )

  res.status( 200 ).json( review )
}
