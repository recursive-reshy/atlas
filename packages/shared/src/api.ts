// Packages
import { z } from 'zod'
// Job
import { Job } from './job.js'
// Source
import { detectSourceType, videoRefusal } from './detectSourceType.js'
import {
  ARTICLE_LIMITS,
  SourceDocument,
  SourceType,
} from './source.js'

const PastedText = z.string().trim()
  .min( ARTICLE_LIMITS.minPastedChars )
  .max( ARTICLE_LIMITS.maxChars )
const PastedTitle = z.string().trim().min( 1 ).max( 300 )

export const CreateJobBody = z.object( {
  url: z.url( { protocol: /^https?$/ } ),
  model: z.string().min( 1 ).optional(),
  profile_id: z.uuid().optional(),
  source_type: SourceType.optional(),
  text: PastedText.optional(),
  title: PastedTitle.optional(),
} ).refine(
  ( body ) => {
    const hasPasted = body.text !== undefined || body.title !== undefined

    return !hasPasted || ( body.source_type ?? detectSourceType( body.url ) ) === 'article'
  },
  { message: 'Pasted text and a title are only for articles', path: [ 'text' ] },
).superRefine( ( body, context ) => {
  const message = videoRefusal( body )

  if( message !== null ) {
    context.addIssue( { code: 'custom', message, path: [ 'url' ] } )
  }
} )
export type CreateJobBody = z.infer< typeof CreateJobBody >

export const CreateJobResponse = z.object( {
  job_id: z.uuid(),
} )
export type CreateJobResponse = z.infer< typeof CreateJobResponse >

export const GetJobResponse = z.object( {
  job: Job,
} )
export type GetJobResponse = z.infer< typeof GetJobResponse >

export const ListJobsResponse = z.object( {
  jobs: z.array( Job ),
} )
export type ListJobsResponse = z.infer< typeof ListJobsResponse >

export const SubmitPastedTextBody = z.object( {
  text: PastedText,
  title: PastedTitle.optional(),
} )
export type SubmitPastedTextBody = z.infer< typeof SubmitPastedTextBody >

export const GetSourceResponse = z.object( {
  source: SourceDocument,
} )
export type GetSourceResponse = z.infer< typeof GetSourceResponse >

export const SaveJobResponse = z.object( {
  saved_path: z.string().min( 1 ),
} )
export type SaveJobResponse = z.infer< typeof SaveJobResponse >

export const DownloadFormat = z.enum( [ 'md', 'txt' ] )
export type DownloadFormat = z.infer< typeof DownloadFormat >

export const FolderNode = z.object( {
  name: z.string(),
  path: z.string(),
  get children(): z.ZodArray< typeof FolderNode > {
    return z.array( FolderNode )
  },
} )
export type FolderNode = z.infer< typeof FolderNode >

export const ListFoldersResponse = z.object( {
  default_folder: z.string(),
  folders: z.array( FolderNode ),
} )
export type ListFoldersResponse = z.infer< typeof ListFoldersResponse >

export const UpdateDraftBody = z
  .object( {
    note_markdown: z.string().optional(),
    target_folder: z.string().nullable().optional(),
  } )
  .refine(
    ( body ) => body.note_markdown !== undefined || body.target_folder !== undefined,
    'Send note_markdown, target_folder or both',
  )
export type UpdateDraftBody = z.infer< typeof UpdateDraftBody >

export const UpdateDraftResponse = z.object( {
  job: Job,
} )
export type UpdateDraftResponse = z.infer< typeof UpdateDraftResponse >
