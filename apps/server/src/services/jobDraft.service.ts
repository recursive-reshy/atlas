// Shared
import {
  NoteParseError,
  applyLockedProperties,
  lockedPropertiesFor,
  parseFolderPath,
  parseNote,
  serializeNote,
} from '@atlas/shared'
import type { Job, SubmitPastedTextBody, UpdateDraftBody } from '@atlas/shared'
// Clients
import { writeNote } from '../clients/vault.client.js'
// Errors
import { ConflictError, ValidationError } from '../errors.js'
// Repositories
import { deleteJob, type StoredJob } from '../repositories/jobStore.repository.js'
import { setLastFolder } from '../repositories/promptProfiles.repository.js'
// Sources
import { articleFromText } from '../sources/text.js'
// Services
import {
  assertFrom,
  assertMove,
  defaultFolderFor,
  downloadableStatuses,
  expiryFromNow,
  moveTo,
  requireJob,
} from './jobs.service.js'
import { vaultRootFor } from './vault.service.js'

export const discardJob = ( userId: string, id: string ): void => {
  const job = requireJob( userId, id )

  if( !downloadableStatuses.includes( job.status ) ) {
    throw new ConflictError( `Cannot discard a job that is ${ job.status }` )
  }

  deleteJob( userId, id )
}

export const submitPastedText = (
  userId: string,
  id: string,
  { text, title }: SubmitPastedTextBody,
): Job => {
  const job = requireJob( userId, id )

  if( job.source_type !== 'article' || job.status !== 'failed' ) {
    throw new ConflictError( 'Pasted text can only continue a failed article job' )
  }

  const document = articleFromText( { url: job.url, text, title, origin: 'pasted' } )

  return moveTo( userId, job, 'summarizing', {
    source_document: document,
    title: document.meta.title,
    error: null,
  } )
}

const today = (): string => new Date().toISOString().slice( 0, 10 )

export const updateDraft = ( userId: string, id: string, body: UpdateDraftBody ): Job => {
  const job = requireJob( userId, id )

  assertFrom( job, 'ready_for_review', 'ready_for_review' )

  if( job.source_document === null ) {
    throw new Error( `Job ${ id } is ${ job.status } but has no transcript` )
  }

  const changes: Partial< StoredJob > = { expires_at: expiryFromNow() }

  if( body.note_markdown !== undefined ) {
    let created = today()

    try {
      if( job.note_markdown !== null ) {
        created = parseNote( job.note_markdown ).properties.created
      }

      const note = applyLockedProperties(
        parseNote( body.note_markdown ),
        lockedPropertiesFor( job.source_document, created ),
      )

      changes.note_markdown = serializeNote( note )
      changes.title = note.properties.title
    } catch( error ) {
      if( !( error instanceof NoteParseError ) ) {
        throw error
      }

      throw new ValidationError( `front-matter invalid: ${ error.message }` )
    }
  }

  if( body.target_folder !== undefined ) {
    if( body.target_folder !== null ) {
      try {
        parseFolderPath( body.target_folder )
      } catch( error ) {
        throw new ValidationError( error instanceof Error ? error.message : 'Invalid folder' )
      }
    }

    changes.target_folder = body.target_folder
  }

  return moveTo( userId, job, job.status, changes )
}

export const saveJob = async ( userId: string, id: string ): Promise< string > => {
  const job = requireJob( userId, id )

  assertMove( job, 'saved' )

  if( job.source_document === null ) {
    throw new Error( `Job ${ id } is ${ job.status } but has no transcript` )
  }

  if( job.note_markdown === null ) {
    throw new ConflictError( 'The job has no draft to save' )
  }

  const note = applyLockedProperties(
    parseNote( job.note_markdown ),
    lockedPropertiesFor( job.source_document, today() ),
  )

  const folder = job.target_folder ?? defaultFolderFor( userId, job )

  const savedPath = await writeNote(
    vaultRootFor( userId ),
    folder,
    note.properties.title,
    serializeNote( note ),
  )

  if( job.prompt_profile_id !== null ) {
    setLastFolder( userId, job.prompt_profile_id, folder )
  }

  moveTo( userId, job, 'saved', {
    saved_path: savedPath,
    title: note.properties.title,
    source_document: null,
  } )

  return savedPath
}
