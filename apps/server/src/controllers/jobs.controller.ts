// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import {
  AcceptLinkSuggestionsBody,
  CreateJobBody,
  CreateJobResponse,
  DownloadFormat,
  GetJobResponse,
  GetSourceResponse,
  LinkSuggestionsResponse,
  ListJobsResponse,
  ListLinkSuggestionsResponse,
  RegenerateSummaryBody,
  RejectLinkSuggestionsBody,
  RunLinkingBody,
  SaveJobResponse,
  SubmitPastedTextBody,
  UpdateDraftBody,
  UpdateDraftResponse,
} from '@atlas/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import {
  findJob,
  listJobs,
  queueJob,
  regenerateSummary,
  retrySummary,
} from '../services/jobs.service.js'
import {
  acceptSuggestions,
  listLinkSuggestions,
  rejectSuggestions,
  runLinking,
} from '../services/jobLinking.service.js'
import {
  discardJob,
  saveJob,
  submitPastedText,
  updateDraft,
} from '../services/jobDraft.service.js'
import { findSource, renderTranscript } from '../services/jobRender.service.js'

export const createJob = async (
  req: Request,
  res: Response< CreateJobResponse >,
): Promise< void > => {
  const job = await queueJob( currentUser( req ).id, CreateJobBody.parse( req.body ) )

  res
    .status( 202 )
    .location( `/api/jobs/${ job.id }` )
    .json( { job_id: job.id } )
}

export const submitJobText = (
  req: Request,
  res: Response< GetJobResponse >,
): void => {
  const body = SubmitPastedTextBody.parse( req.body )
  const job = submitPastedText( currentUser( req ).id, String( req.params.id ), body )

  res.status( 200 ).json( { job } )
}

export const listActiveJobs = ( req: Request, res: Response< ListJobsResponse > ): void => {
  res.status( 200 ).json( { jobs: listJobs( currentUser( req ).id ) } )
}

export const getJob = ( req: Request, res: Response< GetJobResponse > ): void => {
  const job = findJob( currentUser( req ).id, String( req.params.id ) )

  res.status( 200 ).json( { job } )
}

export const getSource = (
  req: Request,
  res: Response< GetSourceResponse >,
): void => {
  const source = findSource( currentUser( req ).id, String( req.params.id ) )

  res.status( 200 ).json( { source } )
}

export const updateJobDraft = (
  req: Request,
  res: Response< UpdateDraftResponse >,
): void => {
  const changes = UpdateDraftBody.parse( req.body )

  const job = updateDraft( currentUser( req ).id, String( req.params.id ), changes )

  res.status( 200 ).json( { job } )
}

export const saveReviewedJob = async (
  req: Request,
  res: Response< SaveJobResponse >,
): Promise< void > => {
  const savedPath = await saveJob( currentUser( req ).id, String( req.params.id ) )

  res.status( 200 ).json( { saved_path: savedPath } )
}

export const retryJobSummary = ( req: Request, res: Response< GetJobResponse > ): void => {
  const job = retrySummary( currentUser( req ).id, String( req.params.id ) )

  res.status( 202 ).json( { job } )
}

export const regenerateJobSummary = async (
  req: Request,
  res: Response< GetJobResponse >,
): Promise< void > => {
  const choices = RegenerateSummaryBody.parse( req.body ?? {} )
  const job = await regenerateSummary( currentUser( req ).id, String( req.params.id ), choices )

  res.status( 202 ).json( { job } )
}

export const discardReviewedJob = ( req: Request, res: Response ): void => {
  discardJob( currentUser( req ).id, String( req.params.id ) )

  res.status( 204 ).end()
}

export const downloadTranscript = ( req: Request, res: Response ): void => {
  const format = DownloadFormat.parse( req.query.format ?? 'md' )

  const { filename, contentType, body } = renderTranscript(
    currentUser( req ).id,
    String( req.params.id ),
    format,
  )

  res
    .status( 200 )
    .type( contentType )
    .attachment( filename )
    .send( body )
}

const jobIdParam = ( params: Request[ 'params' ] ): string => z.uuid().parse( params.id )

export const getLinkSuggestions = (
  req: Request,
  res: Response< ListLinkSuggestionsResponse >,
): void => {
  const suggestions = listLinkSuggestions( currentUser( req ).id, jobIdParam( req.params ) )

  res.status( 200 ).json( { suggestions } )
}

export const acceptLinkSuggestions = (
  req: Request,
  res: Response< LinkSuggestionsResponse >,
): void => {
  const result = acceptSuggestions(
    currentUser( req ).id,
    jobIdParam( req.params ),
    AcceptLinkSuggestionsBody.parse( req.body ),
  )

  res.status( 200 ).json( result )
}

export const rejectLinkSuggestions = (
  req: Request,
  res: Response< LinkSuggestionsResponse >,
): void => {
  const result = rejectSuggestions(
    currentUser( req ).id,
    jobIdParam( req.params ),
    RejectLinkSuggestionsBody.parse( req.body ),
  )

  res.status( 200 ).json( result )
}

export const runJobLinking = (
  req: Request,
  res: Response< GetJobResponse >,
): void => {
  const job = runLinking(
    currentUser( req ).id,
    jobIdParam( req.params ),
    RunLinkingBody.parse( req.body ?? {} ),
  )

  res.status( 202 ).json( { job } )
}
