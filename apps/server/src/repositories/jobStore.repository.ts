// Lifecycle
import { statusesWhere } from '../jobs/lifecycle.js'
// Repositories
import { getDatabase } from './database.js'
import {
  SELECT_JOB,
  SELECT_JOB_LIST,
  StoredJob,
  marks,
  toRow,
  toListedJob,
  toStoredJob,
} from './jobRows.js'

export { StoredJob }

export const insertJob = ( userId: string, job: StoredJob ): void => {
  const db = getDatabase()

  if( db.prepare( 'SELECT 1 FROM jobs WHERE id = ?' ).get( job.id ) !== undefined ) {
    throw new Error( `Job ${ job.id } already exists` )
  }

  db.prepare( `INSERT INTO jobs (
      id, user_id, url, status, error, title, source_document, note_markdown, target_folder,
      summary_model, prompt_profile_id, link_state, link_error, source_type, feed_id,
      gmail_source_id, saved_path, expires_at, created_at, updated_at, duration_seconds
    ) VALUES (
      @id, @user_id, @url, @status, @error, @title, @source_document, @note_markdown,
      @target_folder, @summary_model, @prompt_profile_id, @link_state, @link_error,
      @source_type, @feed_id, @gmail_source_id, @saved_path, @expires_at, @created_at, @updated_at,
      @duration_seconds
    )` ).run( { ...toRow( job ), user_id: userId } )
}

export const findJobById = ( userId: string, id: string ): StoredJob | undefined => {
  const row = getDatabase()
    .prepare( `${ SELECT_JOB } WHERE jobs.id = ? AND jobs.user_id = ?` )
    .get( id, userId )

  return row === undefined ? undefined : toStoredJob( row )
}

export const updateJob = (
  userId: string,
  id: string,
  changes: Partial< Omit< StoredJob, 'id' > >,
): StoredJob | undefined => {
  const job = findJobById( userId, id )

  if( job === undefined ) {
    return undefined
  }

  const updated: StoredJob = { ...job, ...changes }

  getDatabase().prepare( `UPDATE jobs SET
      url = @url, status = @status, error = @error, title = @title,
      source_document = @source_document, note_markdown = @note_markdown,
      target_folder = @target_folder, summary_model = @summary_model,
      prompt_profile_id = @prompt_profile_id, link_state = @link_state,
      link_error = @link_error, source_type = @source_type,
      feed_id = @feed_id, gmail_source_id = @gmail_source_id, saved_path = @saved_path,
      expires_at = @expires_at, created_at = @created_at, updated_at = @updated_at,
      duration_seconds = COALESCE( @duration_seconds, duration_seconds )
    WHERE id = @id AND user_id = @user_id` ).run( { ...toRow( updated ), user_id: userId } )

  return updated
}

export const clearJobs = ( userId: string ): void => {
  getDatabase().prepare( 'DELETE FROM jobs WHERE user_id = ?' ).run( userId )
}

export const listActiveJobs = ( userId: string ): StoredJob[] => {
  const statuses = statusesWhere( 'active' )

  return getDatabase()
    .prepare( `${ SELECT_JOB_LIST }
      WHERE jobs.user_id = ? AND jobs.status IN ( ${ marks( statuses ) } )
      ORDER BY jobs.created_at DESC, jobs.rowid DESC` )
    .all( userId, ...statuses )
    .map( toListedJob )
}

export const deleteJob = ( userId: string, id: string ): boolean => {
  const db = getDatabase()

  return db.transaction( () => {
    db.prepare( 'DELETE FROM link_suggestions WHERE job_id = ? AND user_id = ?' ).run( id, userId )
    db.prepare( 'DELETE FROM link_runs WHERE job_id = ? AND user_id = ?' ).run( id, userId )

    return db.prepare( 'DELETE FROM jobs WHERE id = ? AND user_id = ?' ).run( id, userId )
      .changes > 0
  } )()
}
