// Shared
import {
  CreateJobResponse,
  GetJobResponse,
  GetSourceResponse,
  ListJobsResponse,
  SaveJobResponse,
  UpdateDraftResponse,
} from '@atlas/shared'
import type {
  CreateJobBody,
  DownloadFormat,
  Job,
  RegenerateSummaryBody,
  SourceDocument,
  SubmitPastedTextBody,
  UpdateDraftBody,
} from '@atlas/shared'
// App
import { request, send } from './request'

const jobPath = ( id: string ): string => `/api/jobs/${ encodeURIComponent( id ) }`

export const createJob = async ( body: CreateJobBody ): Promise< string > => {
  const { job_id } = await request( '/api/jobs', CreateJobResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  } )

  return job_id
}

export const submitPastedText = async (
  id: string,
  body: SubmitPastedTextBody,
): Promise< Job > => {
  const { job } = await request( `${ jobPath( id ) }/text`, GetJobResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  } )

  return job
}

export const getJob = async ( id: string ): Promise< Job > => {
  const { job } = await request( jobPath( id ), GetJobResponse )
  return job
}

export const listJobs = async (): Promise< Job[] > => {
  const { jobs } = await request( '/api/jobs', ListJobsResponse )
  return jobs
}

export const getSource = async ( id: string ): Promise< SourceDocument > => {
  const { source } = await request( `${ jobPath( id ) }/source`, GetSourceResponse )

  return source
}

export const updateDraft = async ( id: string, draft: UpdateDraftBody ): Promise< Job > => {
  const { job } = await request( `${ jobPath( id ) }/draft`, UpdateDraftResponse, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( draft ),
  } )
  return job
}

export const saveJob = async ( id: string ): Promise< string > => {
  const { saved_path } = await request( `${ jobPath( id ) }/save`, SaveJobResponse, {
    method: 'POST',
  } )
  return saved_path
}

export const retrySummary = async ( id: string ): Promise< Job > => {
  const { job } = await request( `${ jobPath( id ) }/retry-summary`, GetJobResponse, {
    method: 'POST',
  } )
  return job
}

export const regenerateSummary = async (
  id: string,
  body: RegenerateSummaryBody,
): Promise< Job > => {
  const { job } = await request( `${ jobPath( id ) }/regenerate-summary`, GetJobResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  } )
  return job
}

export const discardJob = async ( id: string ): Promise< void > => {
  await send( jobPath( id ), { method: 'DELETE' } )
}

export const downloadUrl = ( id: string, format: DownloadFormat ): string => {
  return `/api/jobs/${ encodeURIComponent( id ) }/download?format=${ format }`
}
