// Packages
import { describe, it, expect } from 'vitest'
// Shared
import { UsageResponse } from '@atlas/shared'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { insertTranscriptionRun } from '../repositories/transcriptionRuns.repository.js'
// Services
import { getUsage } from './admin.service.js'
// Test support
import { createTestUser } from '../test-support/auth.js'

const versionOf = ( userId: string ): number => {
  return ( getDatabase().prepare( 'SELECT id FROM prompt_versions WHERE user_id = ? LIMIT 1' )
    .get( userId ) as { id: number } ).id
}

type Run = {
  table: 'summary_runs' | 'link_runs' | 'melete_runs' | 'extraction_runs'
  at: string
  input?: number | null
  output?: number | null
  cost?: number | null
}

const addRun = ( userId: string, { table, at, input = 10, output = 5, cost = 0.5 }: Run ): void => {
  const db = getDatabase()
  const version = versionOf( userId )

  if( table === 'summary_runs' || table === 'link_runs' ) {
    db.prepare( `INSERT INTO ${ table }
      ( user_id, job_id, model, prompt_version_id, input_tokens, output_tokens, cost_usd, outcome,
        created_at ) VALUES ( ?, 'job', 'm', ?, ?, ?, ?, 'ok', ? )` )
      .run( userId, version, input, output, cost, at )
  } else if( table === 'melete_runs' ) {
    db.prepare( `INSERT INTO melete_runs
      ( user_id, kind, model, prompt_version_id, input_tokens, output_tokens, cost_usd, outcome,
        created_at ) VALUES ( ?, 'questions', 'm', ?, ?, ?, ?, 'ok', ? )` )
      .run( userId, version, input, output, cost, at )
  } else {
    db.prepare( `INSERT INTO extraction_runs
      ( user_id, gmail_message_row, model, input_tokens, output_tokens, cost_usd, outcome,
        created_at ) VALUES ( ?, 'row', 'm', ?, ?, ?, 'ok', ? )` )
      .run( userId, input, output, cost, at )
  }
}

const addVideoJob = ( userId: string, seconds: number | null, createdAt: string ): void => {
  getDatabase().prepare( `INSERT INTO jobs
    ( id, user_id, url, status, source_type, duration_seconds, created_at, updated_at )
    VALUES ( ?, ?, 'https://example.com', 'saved', ?, ?, ?, ? )` )
    .run(
      crypto.randomUUID(),
      userId,
      seconds === null ? 'article' : 'video',
      seconds,
      createdAt,
      createdAt,
    )
}

const NOW = new Date( '2026-10-27T05:00:00.000Z' )
const ZERO = { input_tokens: 0, output_tokens: 0, cost_usd: null, runs: 0 }

describe( 'getUsage for transcription', () => {
  it( 'counts transcription runs with their cost and no tokens, in the month and all time', () => {
    const user = createTestUser()
    const run = ( at: string, cost: number | null ): void => {
      insertTranscriptionRun( user.id, {
        job_id: 'job',
        model: 'gpt-transcribe',
        duration_seconds: 3600,
        input_tokens: null,
        output_tokens: null,
        cost_usd: cost,
        outcome: 'ok',
        error: null,
        created_at: at,
      } )
    }

    run( '2026-10-05T01:00:00.000Z', 0.27 )
    run( '2026-10-06T01:00:00.000Z', 0.5 )
    run( '2026-08-06T01:00:00.000Z', 0.1 )

    const mine = getUsage( undefined, NOW, 'Asia/Singapore' ).users
      .find( ( row ) => row.user_id === user.id )

    expect( mine?.month.transcription ).toEqual( {
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0.77,
      runs: 2,
    } )
    expect( mine?.all_time.transcription ).toMatchObject( { runs: 3, cost_usd: 0.87 } )
    expect( mine?.month.summary ).toEqual( ZERO )
  } )
} )

describe( 'getUsage', () => {
  it( 'totals each category for the month and for all time', () => {
    const user = createTestUser()
    const other = createTestUser()

    addRun( user.id, { table: 'summary_runs', at: '2026-10-05T01:00:00.000Z' } )
    addRun( user.id, { table: 'summary_runs', at: '2026-10-06T01:00:00.000Z', cost: 0.25 } )
    addRun( user.id, { table: 'summary_runs', at: '2026-08-06T01:00:00.000Z' } )
    addRun( user.id, { table: 'link_runs', at: '2026-10-07T01:00:00.000Z' } )
    addRun( user.id, { table: 'melete_runs', at: '2026-10-08T01:00:00.000Z' } )
    addRun( user.id, { table: 'extraction_runs', at: '2026-10-09T01:00:00.000Z' } )
    addRun( other.id, { table: 'summary_runs', at: '2026-10-05T01:00:00.000Z', input: 99 } )

    const usage = UsageResponse.parse( getUsage( undefined, NOW, 'Asia/Singapore' ) )
    const mine = usage.users.find( ( row ) => row.user_id === user.id )

    expect( usage.month ).toBe( '2026-10' )
    expect( usage.time_zone ).toBe( 'Asia/Singapore' )
    expect( mine?.month.summary ).toEqual( {
      input_tokens: 20,
      output_tokens: 10,
      cost_usd: 0.75,
      runs: 2,
    } )
    expect( mine?.all_time.summary ).toMatchObject( { runs: 3, input_tokens: 30, cost_usd: 1.25 } )
    expect( mine?.month.linking.runs ).toBe( 1 )
    expect( mine?.month.melete.runs ).toBe( 1 )
    expect( mine?.month.extraction.runs ).toBe( 1 )
    expect( usage.users.find( ( row ) => row.user_id === other.id )?.month.summary.input_tokens )
      .toBe( 99 )
  } )

  it( 'lists a user with no activity with zero totals', () => {
    const idle = createTestUser()
    const mine = getUsage( undefined, NOW, 'Asia/Singapore' ).users
      .find( ( row ) => row.user_id === idle.id )

    expect( mine?.month ).toEqual( {
      summary: ZERO,
      linking: ZERO,
      melete: ZERO,
      extraction: ZERO,
      transcription: ZERO,
    } )
    expect( mine?.transcription ).toEqual( { month_seconds: 0, all_time_seconds: 0 } )
  } )

  it( 'keeps cost null while no run in the bucket has a cost, and counts null tokens as 0', () => {
    const user = createTestUser()

    addRun( user.id, {
      table: 'summary_runs',
      at: '2026-10-05T01:00:00.000Z',
      input: null,
      output: null,
      cost: null,
    } )

    const mine = getUsage( undefined, NOW, 'Asia/Singapore' ).users
      .find( ( row ) => row.user_id === user.id )

    expect( mine?.month.summary ).toEqual( {
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: null,
      runs: 1,
    } )

    addRun( user.id, { table: 'summary_runs', at: '2026-10-06T01:00:00.000Z', cost: 0.5 } )

    const priced = getUsage( undefined, NOW, 'Asia/Singapore' ).users
      .find( ( row ) => row.user_id === user.id )

    expect( priced?.month.summary.cost_usd ).toBe( 0.5 )
  } )

  it( 'splits months at midnight Singapore time, not UTC', () => {
    const user = createTestUser()

    addRun( user.id, { table: 'summary_runs', at: '2026-09-30T15:59:59.999Z', input: 1 } )
    addRun( user.id, { table: 'summary_runs', at: '2026-09-30T16:00:00.000Z', input: 100 } )
    addRun( user.id, { table: 'summary_runs', at: '2026-10-31T15:59:59.999Z', input: 1000 } )
    addRun( user.id, { table: 'summary_runs', at: '2026-10-31T16:00:00.000Z', input: 10000 } )

    const inMonth = ( month: string ): number | undefined => {
      return getUsage( month, NOW, 'Asia/Singapore' ).users
        .find( ( row ) => row.user_id === user.id )?.month.summary.input_tokens
    }

    expect( inMonth( '2026-09' ) ).toBe( 1 )
    expect( inMonth( '2026-10' ) ).toBe( 1100 )
    expect( inMonth( '2026-11' ) ).toBe( 10000 )
  } )

  it( 'uses the time zone it is given for the bounds and the default month', () => {
    const user = createTestUser()

    addRun( user.id, { table: 'summary_runs', at: '2026-09-30T10:00:00.000Z', input: 7 } )

    const find = ( month: string | undefined, zone: string ) => {
      return getUsage( month, new Date( '2026-09-30T20:30:00.000Z' ), zone ).users
        .find( ( row ) => row.user_id === user.id )
    }

    expect( find( undefined, 'Asia/Singapore' )?.month.summary.input_tokens ).toBe( 0 )
    expect( getUsage( undefined, new Date( '2026-09-30T20:30:00.000Z' ), 'Asia/Singapore' ).month )
      .toBe( '2026-10' )
    expect( find( undefined, 'UTC' )?.month.summary.input_tokens ).toBe( 7 )
    expect( getUsage( undefined, new Date( '2026-09-30T20:30:00.000Z' ), 'UTC' ).month )
      .toBe( '2026-09' )
  } )

  it( 'sums the seconds of video jobs only, including saved ones', () => {
    const user = createTestUser()

    addVideoJob( user.id, 600, '2026-10-05T01:00:00.000Z' )
    addVideoJob( user.id, 60, '2026-10-06T01:00:00.000Z' )
    addVideoJob( user.id, 3000, '2026-08-06T01:00:00.000Z' )
    addVideoJob( user.id, null, '2026-10-07T01:00:00.000Z' )

    const mine = getUsage( undefined, NOW, 'Asia/Singapore' ).users
      .find( ( row ) => row.user_id === user.id )

    expect( mine?.transcription ).toEqual( { month_seconds: 660, all_time_seconds: 3660 } )
  } )
} )
