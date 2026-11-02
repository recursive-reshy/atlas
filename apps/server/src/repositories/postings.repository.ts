// Packages
import { z } from 'zod'
// Shared
import { ListPostingsQuery, PostingDetails } from '@atlas/shared'
// Repositories
import { getDatabase } from './database.js'
import { ALERT_EMAIL_SELECT, StoredAlertEmail } from './gmailMessages.repository.js'

export const PostingRow = z.object( {
  id: z.string(),
  platform: z.string(),
  platform_job_id: z.string().nullable(),
  dedupe_key: z.string(),
  title: z.string(),
  url: z.string(),
  posted_at: z.string().nullable(),
  details: PostingDetails,
} )
export type PostingRow = z.infer< typeof PostingRow >

export const StoredPosting = PostingRow.extend( {
  first_seen_at: z.string(),
  last_seen_at: z.string(),
  sightings: z.number().int(),
} )
export type StoredPosting = z.infer< typeof StoredPosting >

export type PostingsFilter = Omit< ListPostingsQuery, 'limit' | 'offset' >
export type PostingsPage = Pick< ListPostingsQuery, 'limit' | 'offset' >

const toStoredPosting = ( raw: unknown ): StoredPosting => {
  const row = z.object( { details: z.string() } ).loose().parse( raw )

  return StoredPosting.parse( { ...row, details: JSON.parse( row.details ) as unknown } )
}

const escapeLike = ( text: string ): string => text.replace( /[\\%_]/g, '\\$&' )

export const upsertPosting = (
  userId: string,
  posting: PostingRow,
  messageRowId: string,
  seenAt: string,
): string => {
  const db = getDatabase()

  const { id } = z.object( { id: z.string() } ).parse(
    db.prepare( `INSERT INTO job_postings (
        id, user_id, platform, platform_job_id, dedupe_key, title, url, posted_at,
        first_seen_at, last_seen_at, details
      ) VALUES (
        @id, @user_id, @platform, @platform_job_id, @dedupe_key, @title, @url, @posted_at,
        @seen_at, @seen_at, @details
      ) ON CONFLICT ( user_id, dedupe_key ) DO UPDATE SET
        title = excluded.title,
        url = excluded.url,
        posted_at = excluded.posted_at,
        details = excluded.details,
        last_seen_at = max( last_seen_at, excluded.last_seen_at )
      RETURNING id` ).get( {
      ...posting,
      details: JSON.stringify( posting.details ),
      seen_at: seenAt,
      user_id: userId,
    } ),
  )

  db.prepare( `INSERT INTO posting_sightings ( user_id, posting_id, gmail_message_row, seen_at )
    VALUES ( ?, ?, ?, ? ) ON CONFLICT DO NOTHING` ).run( userId, id, messageRowId, seenAt )

  return id
}

export const listPostings = (
  userId: string,
  { q, platform, limit, offset }: PostingsFilter & PostingsPage,
): { rows: StoredPosting[], total: number, filtered: number } => {
  const db = getDatabase()
  const pattern = q === undefined || q === '' ? null : `%${ escapeLike( q ) }%`
  const where = `WHERE user_id = @user_id AND ( @platform IS NULL OR platform = @platform )
    AND ( @pattern IS NULL
      OR title LIKE @pattern ESCAPE '\\'
      OR json_extract( details, '$.description' ) LIKE @pattern ESCAPE '\\'
      OR EXISTS ( SELECT 1 FROM json_each( details, '$.skills' )
        WHERE value LIKE @pattern ESCAPE '\\' ) )`
  const filter = { platform: platform ?? null, pattern, user_id: userId }
  const count = z.object( { count: z.number() } )

  const { count: total } = count.parse(
    db.prepare( 'SELECT COUNT(*) AS count FROM job_postings WHERE user_id = ?' ).get( userId ),
  )
  const { count: filtered } = count.parse(
    db.prepare( `SELECT COUNT(*) AS count FROM job_postings ${ where }` ).get( filter ),
  )

  const rows = db.prepare( `SELECT job_postings.*,
      ( SELECT COUNT(*) FROM posting_sightings
        WHERE posting_sightings.posting_id = job_postings.id ) AS sightings
    FROM job_postings ${ where }
    ORDER BY first_seen_at DESC, rowid DESC
    LIMIT @limit OFFSET @offset` ).all( { ...filter, limit, offset } ).map( toStoredPosting )

  return { rows, total, filtered }
}

export const listPlatforms = ( userId: string ): string[] => {
  return z.array( z.string() ).parse(
    getDatabase()
      .prepare( `SELECT DISTINCT platform FROM job_postings WHERE user_id = ?
        ORDER BY platform` )
      .pluck()
      .all( userId ),
  )
}

export const listSightings = ( userId: string, postingId: string ): StoredAlertEmail[] => {
  return z.array( StoredAlertEmail ).parse(
    getDatabase().prepare( `${ ALERT_EMAIL_SELECT }
      WHERE gmail_messages.user_id = ? AND gmail_messages.id IN (
        SELECT gmail_message_row FROM posting_sightings
        WHERE user_id = ? AND posting_id = ? )
      ORDER BY gmail_messages.received_at DESC, gmail_messages.rowid DESC` )
      .all( userId, userId, postingId ),
  )
}

export const countPostingsForSource = ( userId: string, sourceId: string ): number => {
  const { count } = z.object( { count: z.number() } ).parse(
    getDatabase().prepare( `SELECT COUNT(DISTINCT posting_sightings.posting_id) AS count
      FROM posting_sightings
        JOIN gmail_messages ON gmail_messages.id = posting_sightings.gmail_message_row
      WHERE posting_sightings.user_id = ? AND gmail_messages.source_id = ?` )
      .get( userId, sourceId ),
  )

  return count
}
