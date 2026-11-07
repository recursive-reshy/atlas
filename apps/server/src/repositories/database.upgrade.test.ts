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
} from 'vitest'
import { z } from 'zod'
// Shared
import { AppSettingKey } from '@atlas/shared'
// Test support
import { loadSeed, seededVersions } from '../test-support/schemaAt.js'
// Repositories
import {
  SCHEMA_BASE,
  closeDatabase,
  getDatabase,
  MigrationError,
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
  it( 'leaves the file at its schema and refuses to open, naming the migration', () => {
    const directory = mkdtempSync( join( tmpdir(), 'atlas-failed-migration-' ) )
    const path = join( directory, 'atlas.db' )

    try {
      openDatabase( path, { migrations: migrations.slice( 0, 4 ) } )
      closeDatabase()

      let thrown: unknown

      try {
        openDatabase( path, {
          migrations: [
            ...migrations.slice( 0, 4 ),
            'CREATE TABLE half_done ( id INTEGER )',
            () => {
              throw new Error( 'backfill failed' )
            },
          ],
        } )
      } catch( error ) {
        thrown = error
      }

      expect( thrown ).toBeInstanceOf( MigrationError )
      expect( ( thrown as MigrationError ).version ).toBe( 15 )
      expect( ( thrown as MigrationError ).message ).toContain( 'backfill failed' )

      const raw = new Database( path )

      expect( raw.pragma( 'user_version', { simple: true } ) ).toBe( 13 )
      expect( raw.prepare( 'SELECT name FROM sqlite_master WHERE name = ?' ).get( 'half_done' ) )
        .toBeUndefined()
      raw.close()
    } finally {
      closeDatabase()
      rmSync( directory, { recursive: true, force: true } )
    }
  } )
} )

describe( 'migration 14 (stored schema 14, ADR 0085)', () => {
  afterEach( () => {
    closeDatabase()
  } )

  it( 'drops pieces and renames audio_seconds to duration_seconds, keeping the values', () => {
    openSeeded( 13 )
    runMigrations( getDatabase(), migrations )

    const columns = rows( 'SELECT name FROM pragma_table_info( \'transcription_runs\' )' )
      .map( ( { name } ) => name )

    expect( columns ).toContain( 'duration_seconds' )
    expect( columns ).not.toContain( 'audio_seconds' )
    expect( columns ).not.toContain( 'pieces' )
    expect( rows(
      'SELECT id, duration_seconds, input_tokens FROM transcription_runs ORDER BY id',
    ) )
      .toEqual( [
        { id: 1, duration_seconds: 900, input_tokens: 24000 },
        { id: 2, duration_seconds: 0, input_tokens: null },
      ] )
  } )

  it( 'keeps the transcription branch of usage_events working', () => {
    openSeeded( 13 )
    runMigrations( getDatabase(), migrations )

    expect( rows( `SELECT user_id, cost_usd FROM usage_events
      WHERE category = 'transcription' ORDER BY cost_usd` ) )
      .toEqual( [
        { user_id: '00000000-0000-4000-8000-000000000002', cost_usd: null },
        { user_id: '00000000-0000-4000-8000-000000000001', cost_usd: 0.021 },
      ] )
  } )
} )

describe( 'migration 15 (stored schema 15, Melete concept layer, ADR 0089)', () => {
  const USER = '00000000-0000-4000-8000-000000000002'
  const SUBJECT = '50000000-0000-4000-8000-000000000001'
  const NOTE = '51000000-0000-4000-8000-000000000001'
  const QUESTION = '52000000-0000-4000-8000-000000000001'

  const migrated = (): void => {
    openSeeded( 14 )
    runMigrations( getDatabase(), migrations.slice( 0, 6 ) )
  }

  const addConcept = ( id: string ): void => {
    getDatabase().prepare( `INSERT INTO melete_sections
      ( id, user_id, subject_id, position, name, created_at )
      VALUES ( ?, ?, ?, 0, 'Basics', '2026-11-07T00:00:00.000Z' )` )
      .run( `s-${ id }`, USER, SUBJECT )
    getDatabase().prepare( `INSERT INTO melete_concepts
      ( id, user_id, subject_id, section_id, position, name, created_at )
      VALUES ( ?, ?, ?, ?, 0, 'Cells', '2026-11-07T00:00:00.000Z' )` )
      .run( id, USER, SUBJECT, `s-${ id }` )
  }

  afterEach( () => {
    closeDatabase()
  } )

  it( 'reads existing subjects back with no level, no intent and syllabus_status none', () => {
    migrated()

    expect( rows( `SELECT target_level, intent, syllabus_status, syllabus_error
      FROM melete_subjects` ) )
      .toEqual( [ {
        target_level: null,
        intent: null,
        syllabus_status: 'none',
        syllabus_error: null,
      } ] )
  } )

  it( 'reads existing notes back as idle, unpinned and not off-syllabus', () => {
    migrated()

    expect( rows( `SELECT mapping, mapping_error, mapping_pinned, off_syllabus,
      off_syllabus_suggestion FROM melete_notes ORDER BY id` ) )
      .toEqual( [ 1, 2 ].map( () => ( {
        mapping: 'idle',
        mapping_error: null,
        mapping_pinned: 0,
        off_syllabus: null,
        off_syllabus_suggestion: null,
      } ) ) )
  } )

  it( 'leaves questions unlabelled and runs without a subject', () => {
    migrated()

    expect( rows( 'SELECT DISTINCT concept_id FROM melete_questions' ) )
      .toEqual( [ { concept_id: null } ] )
    expect( rows( 'SELECT DISTINCT subject_id FROM melete_runs' ) )
      .toEqual( [ { subject_id: null } ] )
  } )

  it( 'creates the three new tables empty', () => {
    migrated()

    for( const table of [ 'melete_sections', 'melete_concepts', 'melete_note_concepts' ] ) {
      expect( tableCounts()[ table ], table ).toBe( 0 )
    }
  } )

  it( 'refuses values outside the new CHECK lists', () => {
    migrated()

    const db = getDatabase()

    expect( () => db.prepare( 'UPDATE melete_subjects SET target_level = ?' ).run( 'guru' ) )
      .toThrow( /CHECK/ )
    expect( () => db.prepare( 'UPDATE melete_subjects SET syllabus_status = ?' ).run( 'ready' ) )
      .toThrow( /CHECK/ )
    expect( () => db.prepare( 'UPDATE melete_notes SET mapping = ?' ).run( 'done' ) )
      .toThrow( /CHECK/ )
    expect( () => db.prepare( 'UPDATE melete_notes SET off_syllabus = ?' ).run( 'hidden' ) )
      .toThrow( /CHECK/ )

    addConcept( 'c1' )
    expect( () => db.prepare( `INSERT INTO melete_note_concepts
      ( user_id, note_id, concept_id, source ) VALUES ( ?, ?, 'c1', 'guess' )` )
      .run( USER, NOTE ) ).toThrow( /CHECK/ )
    db.prepare( 'UPDATE melete_subjects SET target_level = ?, syllabus_status = ?' )
      .run( 'working', 'drafting' )
  } )

  it( 'nulls a question label and drops mappings when a concept is deleted', () => {
    migrated()
    addConcept( 'c1' )

    const db = getDatabase()

    db.prepare( `INSERT INTO melete_note_concepts ( user_id, note_id, concept_id, source )
      VALUES ( ?, ?, 'c1', 'claude' )` ).run( USER, NOTE )
    db.prepare( 'UPDATE melete_questions SET concept_id = ? WHERE id = ?' ).run( 'c1', QUESTION )
    db.prepare( 'DELETE FROM melete_concepts WHERE id = ?' ).run( 'c1' )

    expect( rows( `SELECT concept_id FROM melete_questions WHERE id = '${ QUESTION }'` ) )
      .toEqual( [ { concept_id: null } ] )
    expect( tableCounts().melete_note_concepts ).toBe( 0 )
    expect( db.pragma( 'foreign_key_check' ) ).toEqual( [] )
  } )

  it( 'removes sections and concepts with their subject', () => {
    migrated()
    addConcept( 'c1' )

    const db = getDatabase()

    db.prepare( 'DELETE FROM melete_reviews' ).run()
    db.prepare( 'DELETE FROM melete_questions' ).run()
    db.prepare( 'DELETE FROM melete_notes' ).run()
    db.prepare( 'DELETE FROM melete_subjects' ).run()

    expect( tableCounts().melete_sections ).toBe( 0 )
    expect( tableCounts().melete_concepts ).toBe( 0 )
  } )
} )
