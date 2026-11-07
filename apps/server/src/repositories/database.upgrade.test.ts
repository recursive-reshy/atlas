// Node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import Database from 'better-sqlite3'
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { z } from 'zod'
// Shared
import { AppSettingKey } from '@atlas/shared'
// Logging
import { logger } from '../logger.js'
// Test support
import { loadSeed, seededVersions } from '../test-support/schemaAt.js'
// Repositories
import {
  SCHEMA_BASE,
  closeDatabase,
  getDatabase,
  migrations,
  openDatabase,
  runMigrations,
} from './database.js'
import { getAppSetting } from './appSettings.repository.js'
import { ExtractionRunRecord } from './extractionRuns.repository.js'
import { findAccount } from './gmailAccount.repository.js'
import { findMessagesByIds } from './gmailMessages.repository.js'
import { listSources } from './gmailSources.repository.js'
import { findItemsByIds } from './feedItems.repository.js'
import { listFeeds } from './feeds.repository.js'
import { listErrors, listHealth } from './health.repository.js'
import { findJobById } from './jobStore.repository.js'
import { listLinkRuns } from './linkRuns.repository.js'
import { listSuggestions } from './linkSuggestions.repository.js'
import { listNotesBySubject } from './meleteNotes.repository.js'
import { listForNote } from './meleteQuestions.repository.js'
import { NewReview } from './meleteReviews.repository.js'
import { findRun } from './meleteRuns.repository.js'
import { listSubjects } from './meleteSubjects.repository.js'
import { listPostings, listSightings } from './postings.repository.js'
import { findProfileById, listVersions } from './promptProfiles.repository.js'
import { findSession } from './sessions.repository.js'
import { getSetting } from './settings.repository.js'
import { listRunsForJob } from './summaryRuns.repository.js'
import { listTranscriptionRuns } from './transcriptionRuns.repository.js'
import { listModules } from './userModules.repository.js'
import { listUsers } from './users.repository.js'

type Row = Record< string, string | number | null >

const rows = ( sql: string ): Row[] => getDatabase().prepare( sql ).all() as Row[]

const text = ( value: string | number | null | undefined ): string => String( value )

// Row counts that a migration documents as changing, keyed by the stored version that changes
// them: { [ version ]: { [ table ]: delta } }. Empty until a migration adds or removes rows.
const ALLOWED_COUNT_CHANGES: Record< number, Record< string, number > > = {}

// Each reader returns how many of a table's rows it read back through the repositories (so a
// Zod error or a missing column fails the test). Tables with no repository read are parsed
// from a plain SELECT with the repository's own schema.
const READERS: Record< string, () => number > = {
  users: () => listUsers().length,
  user_modules: () => listUsers().flatMap( ( { id } ) => listModules( id ) ).length,
  prompt_profiles: () => rows( 'SELECT id, user_id FROM prompt_profiles' )
    .filter( ( row ) => findProfileById( text( row.user_id ), text( row.id ) ) !== undefined )
    .length,
  prompt_versions: () => rows( 'SELECT DISTINCT user_id, profile_id FROM prompt_versions' )
    .flatMap( ( row ) => listVersions( text( row.user_id ), text( row.profile_id ) ) ).length,
  feeds: () => listUsers().flatMap( ( { id } ) => listFeeds( id ) ).length,
  feed_items: () => listUsers().flatMap( ( { id } ) => findItemsByIds(
    id,
    rows( `SELECT id FROM feed_items WHERE user_id = '${ id }'` ).map( ( row ) => text( row.id ) ),
  ) ).length,
  jobs: () => rows( 'SELECT id, user_id FROM jobs' )
    .filter( ( row ) => findJobById( text( row.user_id ), text( row.id ) ) !== undefined ).length,
  summary_runs: () => rows( 'SELECT DISTINCT user_id, job_id FROM summary_runs' )
    .flatMap( ( row ) => listRunsForJob( text( row.user_id ), text( row.job_id ) ) ).length,
  transcription_runs: () => rows( 'SELECT DISTINCT user_id, job_id FROM transcription_runs' )
    .flatMap( ( row ) => listTranscriptionRuns( text( row.user_id ), text( row.job_id ) ) ).length,
  link_runs: () => rows( 'SELECT DISTINCT user_id, job_id FROM link_runs' )
    .flatMap( ( row ) => listLinkRuns( text( row.user_id ), text( row.job_id ) ) ).length,
  link_suggestions: () => rows( 'SELECT DISTINCT user_id, job_id FROM link_suggestions' )
    .flatMap( ( row ) => listSuggestions( text( row.user_id ), text( row.job_id ) ) ).length,
  gmail_account: () => listUsers().filter( ( { id } ) => findAccount( id ) !== undefined ).length,
  gmail_sources: () => listUsers().flatMap( ( { id } ) => listSources( id ) ).length,
  gmail_messages: () => listUsers().flatMap( ( { id } ) => findMessagesByIds(
    id,
    rows( `SELECT id FROM gmail_messages WHERE user_id = '${ id }'` )
      .map( ( row ) => text( row.id ) ),
  ) ).length,
  extraction_runs: () => z.array( ExtractionRunRecord )
    .parse( rows( 'SELECT * FROM extraction_runs' ) ).length,
  job_postings: () => listUsers().flatMap( ( { id } ) => listPostings(
    id,
    { limit: 1000, offset: 0 },
  ).rows ).length,
  posting_sightings: () => rows( 'SELECT user_id, posting_id FROM posting_sightings' )
    .flatMap( ( row ) => listSightings( text( row.user_id ), text( row.posting_id ) ) ).length,
  melete_subjects: () => listUsers().flatMap( ( { id } ) => listSubjects( id ) ).length,
  melete_notes: () => rows( 'SELECT DISTINCT user_id, subject_id FROM melete_notes' )
    .flatMap( ( row ) => listNotesBySubject( text( row.user_id ), text( row.subject_id ) ) ).length,
  melete_questions: () => rows( 'SELECT DISTINCT user_id, note_id FROM melete_questions' )
    .flatMap( ( row ) => listForNote( text( row.user_id ), text( row.note_id ) ) ).length,
  melete_reviews: () => z.array( NewReview.extend( { was_new: z.number().transform( Boolean ) } ) )
    .parse( rows( 'SELECT * FROM melete_reviews' ) ).length,
  melete_runs: () => rows( 'SELECT id, user_id FROM melete_runs' )
    .filter( ( row ) => findRun( text( row.user_id ), Number( row.id ) ) !== undefined ).length,
  sessions: () => rows( 'SELECT token_hash FROM sessions' )
    .filter( ( row ) => findSession( text( row.token_hash ) ) !== undefined ).length,
  settings: () => rows( 'SELECT user_id, key FROM settings' )
    .filter( ( row ) => getSetting( text( row.user_id ), text( row.key ) ) !== undefined ).length,
  app_settings: () => rows( 'SELECT key FROM app_settings' )
    .filter( ( row ) => getAppSetting( AppSettingKey.parse( row.key ) ) !== undefined ).length,
  health_status: () => {
    const [ admin, ...others ] = listUsers().sort( ( a, b ) => a.role.localeCompare( b.role ) )

    return listHealth( admin.id, true ).length
      + others.flatMap( ( { id } ) => listHealth( id, false ) ).length
  },
  health_errors: () => rows( 'SELECT user_id, kind, subject_id FROM health_errors' )
    .reduce( ( total, row ) => total + listErrors(
      row.user_id === null ? null : text( row.user_id ),
      z.enum( [ 'feed', 'agent', 'transcription', 'replication' ] ).parse( row.kind ),
      text( row.subject_id ),
    ).length, 0 ),
}

const tableCounts = (): Record< string, number > => Object.fromEntries(
  rows( `SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name` )
    .map( ( { name } ) => [
      text( name ),
      Number( ( getDatabase().prepare( `SELECT COUNT(*) AS count FROM "${ text( name ) }"` )
        .get() as { count: number } ).count ),
    ] ),
)

// Opens schema N through the real open path, loads its seed, then migrates to the latest.
const openSeeded = ( version: number ): void => {
  openDatabase( ':memory:', { migrations: migrations.slice( 0, version - SCHEMA_BASE ) } )
  loadSeed( getDatabase(), version )
}

describe( 'upgrading a seeded database (ADR 0085)', () => {
  afterEach( () => {
    closeDatabase()
  } )

  it( 'has a reader for every table, so no new table escapes the read-back check', () => {
    openSeeded( 13 )

    expect( Object.keys( tableCounts() ).sort() ).toEqual( Object.keys( READERS ).sort() )
  } )

  describe.each( seededVersions() )( 'from schema %i', ( version ) => {
    it( 'keeps every row, except the counts a migration documents', () => {
      openSeeded( version )

      const before = tableCounts()
      const allowed: Record< string, number > = {}

      for( let v = version + 1; v <= SCHEMA_BASE + migrations.length; v++ ) {
        for( const [ table, delta ] of Object.entries( ALLOWED_COUNT_CHANGES[ v ] ?? {} ) ) {
          allowed[ table ] = ( allowed[ table ] ?? 0 ) + delta
        }
      }

      runMigrations( getDatabase(), migrations )

      const after = tableCounts()

      for( const [ table, count ] of Object.entries( before ) ) {
        expect( after[ table ], `Rows in ${ table }` ).toBe( count + ( allowed[ table ] ?? 0 ) )
      }
    } )

    it( 'reads every migrated row back through the repositories', () => {
      openSeeded( version )
      runMigrations( getDatabase(), migrations )

      const counts = tableCounts()

      for( const [ table, read ] of Object.entries( READERS ) ) {
        expect( read(), `Rows read back from ${ table }` ).toBe( counts[ table ] )
      }
    } )

    it( 'passes the integrity and foreign key checks', () => {
      openSeeded( version )
      runMigrations( getDatabase(), migrations )

      expect( getDatabase().pragma( 'integrity_check', { simple: true } ) ).toBe( 'ok' )
      expect( getDatabase().pragma( 'foreign_key_check' ) ).toEqual( [] )
      expect( getDatabase().pragma( 'user_version', { simple: true } ) )
        .toBe( SCHEMA_BASE + migrations.length )
    } )
  } )
} )

describe( 'a migration that fails (TRD §2.6)', () => {
  it( 'leaves the file at its schema, logs which migration failed, and refuses to open', () => {
    const directory = mkdtempSync( join( tmpdir(), 'atlas-failed-migration-' ) )
    const path = join( directory, 'atlas.db' )
    const error = vi.spyOn( logger, 'error' )

    try {
      openDatabase( path, { migrations: migrations.slice( 0, 4 ) } )
      closeDatabase()

      expect( () => openDatabase( path, {
        migrations: [
          ...migrations.slice( 0, 4 ),
          'CREATE TABLE half_done ( id INTEGER )',
          () => {
            throw new Error( 'backfill failed' )
          },
        ],
      } ) ).toThrow( 'backfill failed' )

      expect( error ).toHaveBeenCalledWith(
        expect.objectContaining( { version: 15, err: expect.any( Error ) as Error } ),
        'migration failed',
      )

      const raw = new Database( path )

      expect( raw.pragma( 'user_version', { simple: true } ) ).toBe( 13 )
      expect( raw.prepare( 'SELECT name FROM sqlite_master WHERE name = ?' ).get( 'half_done' ) )
        .toBeUndefined()
      raw.close()
    } finally {
      error.mockRestore()
      closeDatabase()
      rmSync( directory, { recursive: true, force: true } )
    }
  } )
} )
