// Packages
import Database from 'better-sqlite3'
import { describe, it, expect } from 'vitest'
// Repositories
import { migrations, runMigrations } from './database.js'

const [ baseline, ...later ] = migrations

const open = (): Database.Database => {
  const db = new Database( ':memory:' )

  db.pragma( 'foreign_keys = ON' )

  return db
}

const addUser = ( db: Database.Database, id: string ): void => {
  db.prepare( `INSERT INTO users ( id, email, name, role, status, created_at )
    VALUES ( ?, ?, 'U', 'member', 'active', 'now' )` ).run( id, `${ id }@x.test` )
}

const insertHealth = (
  db: Database.Database,
  userId: string | null,
  kind: string,
  subject = 'default',
): void => {
  db.prepare( 'INSERT INTO health_status ( user_id, kind, subject_id ) VALUES ( ?, ?, ? )' )
    .run( userId, kind, subject )
}

const kinds = ( db: Database.Database, table: string ): string[] => {
  return db.prepare( `SELECT kind FROM ${ table } ORDER BY kind` ).all()
    .map( ( row ) => ( row as { kind: string } ).kind )
}

describe( 'the migration after the 0.9 baseline', () => {
  it( 'exists', () => {
    expect( later.length ).toBeGreaterThan( 0 )
  } )

  describe( 'from a 0.9 database', () => {
    const migrate = (): Database.Database => {
      const db = open()

      runMigrations( db, [ baseline ] )
      addUser( db, 'u1' )
      insertHealth( db, null, 'agent' )
      insertHealth( db, null, 'whisper' )
      insertHealth( db, null, 'backup' )
      insertHealth( db, 'u1', 'feed', 'feed-1' )
      db.prepare( `INSERT INTO health_errors ( user_id, kind, subject_id, at, message )
        VALUES
          ( NULL, 'agent', 'default', 'now', 'down' ),
          ( 'u1', 'feed', 'feed-1', 'now', 'bad' )` ).run()
      runMigrations( db, migrations )

      return db
    }

    it( 'keeps the health rows and errors it can still check', () => {
      const db = migrate()

      expect( kinds( db, 'health_status' ) ).toEqual( [ 'agent', 'backup', 'feed', 'whisper' ] )
      expect( kinds( db, 'health_errors' ) ).toEqual( [ 'agent', 'feed' ] )
    } )

    it( 'accepts the new app kinds without a user and vault_sync with one', () => {
      const db = migrate()

      expect( () => insertHealth( db, null, 'transcription' ) ).not.toThrow()
      expect( () => insertHealth( db, null, 'replication' ) ).not.toThrow()
      expect( () => insertHealth( db, 'u1', 'vault_sync', 'naresh' ) ).not.toThrow()
    } )

    it( 'still keeps app kinds and user kinds apart', () => {
      const db = migrate()

      expect( () => insertHealth( db, 'u1', 'transcription' ) ).toThrow()
      expect( () => insertHealth( db, null, 'vault_sync', 'naresh' ) ).toThrow()
    } )

    it( 'keeps the health error index', () => {
      const db = migrate()

      expect( db.prepare( "SELECT name FROM sqlite_master WHERE name = 'health_errors_subject'" )
        .get() ).toBeDefined()
    } )

    it( 'adds transcription_runs and the usage_events branch', () => {
      const db = migrate()

      db.prepare( `INSERT INTO transcription_runs (
          user_id, job_id, model, audio_seconds, pieces, cost_usd, outcome, error, created_at
        ) VALUES (
          'u1', 'j', 'gpt-transcribe', 60, 1, 0.0045, 'ok', NULL, '2026-11-02T00:00:00Z'
        )` ).run()

      const events = db.prepare(
        "SELECT user_id, cost_usd FROM usage_events WHERE category = 'transcription'",
      )

      expect( events.all() ).toEqual( [ { user_id: 'u1', cost_usd: 0.0045 } ] )
    } )

    it( 'deletes a user\'s runs with the user', () => {
      const db = migrate()

      db.prepare( `INSERT INTO transcription_runs (
          user_id, job_id, model, audio_seconds, pieces, outcome, created_at
        ) VALUES ( 'u1', 'j', 'm', 1, 1, 'ok', 'now' )` ).run()
      db.prepare( "DELETE FROM users WHERE id = 'u1'" ).run()

      expect( db.prepare( 'SELECT COUNT(*) AS n FROM transcription_runs' ).get() )
        .toEqual( { n: 0 } )
    } )

    it( 'refuses an outcome outside ok and error', () => {
      const db = migrate()

      expect( () => db.prepare( `INSERT INTO transcription_runs (
          user_id, job_id, model, audio_seconds, pieces, outcome, created_at
        ) VALUES ( 'u1', 'j', 'm', 1, 1, 'maybe', 'now' )` ).run() ).toThrow()
    } )
  } )

  it( 'also builds the same tables from an empty database', () => {
    const db = open()

    runMigrations( db, migrations )

    expect( () => insertHealth( db, null, 'transcription' ) ).not.toThrow()
    expect( db.prepare( 'SELECT COUNT(*) AS n FROM transcription_runs' ).get() ).toEqual( { n: 0 } )
  } )
} )
