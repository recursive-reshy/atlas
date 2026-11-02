// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
// Repositories
import { getDatabase } from './database.js'
import { insertTranscriptionRun, listTranscriptionRuns } from './transcriptionRuns.repository.js'
import type { TranscriptionRunRecord } from './transcriptionRuns.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const buildRun = (
  overrides: Partial< TranscriptionRunRecord > = {},
): TranscriptionRunRecord => {
  return {
    job_id: 'job-1',
    model: 'gpt-transcribe',
    audio_seconds: 3600,
    pieces: 1,
    cost_usd: 0.27,
    outcome: 'ok',
    error: null,
    created_at: '2026-11-02T10:00:00.000Z',
    ...overrides,
  }
}

describe( 'insertTranscriptionRun', () => {
  it( 'returns the stored run with an id', () => {
    const run = buildRun()

    expect( insertTranscriptionRun( userId, run ) ).toEqual( { id: 1, ...run } )
  } )

  it( 'stores a failed run with its error and no cost', () => {
    const run = buildRun( {
      outcome: 'error',
      error: 'OpenAI transcription failed (401)',
      cost_usd: null,
    } )

    expect( insertTranscriptionRun( userId, run ) ).toMatchObject( run )
  } )

  it( 'refuses an outcome outside ok and error', () => {
    expect( () => insertTranscriptionRun( userId, buildRun( { outcome: 'weird' as 'ok' } ) ) )
      .toThrow()
  } )

  it( 'shows up in usage_events as a transcription with no tokens', () => {
    insertTranscriptionRun( userId, buildRun() )

    expect( getDatabase().prepare( 'SELECT * FROM usage_events WHERE category = ?' )
      .all( 'transcription' ) ).toEqual( [ {
      user_id: userId,
      category: 'transcription',
      input_tokens: null,
      output_tokens: null,
      cost_usd: 0.27,
      created_at: '2026-11-02T10:00:00.000Z',
    } ] )
  } )
} )

describe( 'listTranscriptionRuns', () => {
  it( 'lists a job\'s runs in order', () => {
    const first = insertTranscriptionRun( userId, buildRun( { outcome: 'error', error: 'x' } ) )
    const second = insertTranscriptionRun( userId, buildRun() )
    insertTranscriptionRun( userId, buildRun( { job_id: 'job-2' } ) )

    expect( listTranscriptionRuns( userId, 'job-1' ).map( ( { id } ) => id ) )
      .toEqual( [ first.id, second.id ] )
  } )

  it( 'does not list another user\'s runs', () => {
    const other = createTestUser().id
    insertTranscriptionRun( userId, buildRun() )

    expect( listTranscriptionRuns( other, 'job-1' ) ).toEqual( [] )
  } )
} )
