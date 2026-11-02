// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
// Shared
import type { LinkSuggestion } from '@atlas/shared'
// Repositories
import { insertLinkRun } from './linkRuns.repository.js'
import { findLatestVersion, findProfileBySeedKey } from './promptProfiles.repository.js'
import {
  deleteForJob,
  findSuggestions,
  insertSuggestions,
  listSuggestions,
  setStatus,
  supersedePending,
} from './linkSuggestions.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const JOB_1 = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'
const JOB_2 = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5c'

const newRun = ( jobId: string ): number => {
  const profile = findProfileBySeedKey( userId, 'linker' )
  const version = findLatestVersion( userId, profile?.id ?? '' )

  return insertLinkRun( userId, {
    job_id: jobId,
    model: 'claude-haiku-5-5',
    prompt_version_id: version?.id ?? 0,
    input_tokens: null,
    output_tokens: null,
    cache_read_input_tokens: null,
    cache_creation_input_tokens: null,
    tool_calls: null,
    cost_usd: null,
    outcome: 'succeeded',
    error: null,
    created_at: '2026-10-21T10:00:00.000Z',
  } )
}

const suggestion = (
  target: string,
  overrides: Partial< LinkSuggestion > = {},
): LinkSuggestion => {
  return {
    target,
    kind: 'new_concept',
    anchor: null,
    reason: `Because of ${ target }.`,
    ...overrides,
  }
}

const seed = ( jobId = JOB_1 ): string[] => {
  return insertSuggestions( userId, newRun( jobId ), jobId, [
    suggestion( 'Alpha', { kind: 'existing_note', anchor: 'alpha' } ),
    suggestion( 'Beta' ),
    suggestion( 'Gamma', { kind: 'existing_concept' } ),
  ] ).map( ( { id } ) => id )
}

describe( 'insertSuggestions and listSuggestions', () => {
  it( 'lists nothing for a job without suggestions', () => {
    expect( listSuggestions( userId, JOB_1 ) ).toEqual( [] )
  } )

  it( 'stores each as pending, with uuid ids and positions in submitted order', () => {
    const stored = insertSuggestions( userId, newRun( JOB_1 ), JOB_1, [
      suggestion( 'Alpha', { kind: 'existing_note', anchor: 'alpha' } ),
      suggestion( 'Beta' ),
    ] )

    expect( stored ).toEqual( [
      {
        id: expect.stringMatching( /^[0-9a-f-]{36}$/ ) as string,
        job_id: JOB_1,
        position: 0,
        target: 'Alpha',
        kind: 'existing_note',
        anchor: 'alpha',
        reason: 'Because of Alpha.',
        status: 'pending',
        decided_at: null,
      },
      expect.objectContaining( { target: 'Beta', position: 1, anchor: null } ) as unknown,
    ] )
    expect( listSuggestions( userId, JOB_1 ) ).toEqual( stored )
  } )

  it( 'does nothing for an empty list', () => {
    expect( insertSuggestions( userId, newRun( JOB_1 ), JOB_1, [] ) ).toEqual( [] )
  } )

  it( 'keeps positions rising across runs of the same job', () => {
    seed()
    const second = insertSuggestions( userId, newRun( JOB_1 ), JOB_1, [ suggestion( 'Delta' ) ] )

    expect( second[ 0 ]?.position ).toBe( 3 )
    expect( listSuggestions( userId, JOB_1 ).map( ( { target } ) => target ) )
      .toEqual( [ 'Alpha', 'Beta', 'Gamma', 'Delta' ] )
  } )

  it( 'lists only that job\'s suggestions', () => {
    seed( JOB_1 )
    seed( JOB_2 )

    expect( listSuggestions( userId, JOB_1 ) ).toHaveLength( 3 )
    expect( listSuggestions( userId, JOB_2 ).every( ( { job_id } ) => job_id === JOB_2 ) )
      .toBe( true )
  } )

  it( 'refuses a suggestion for an unknown run', () => {
    expect( () => insertSuggestions( userId, 999_999, JOB_1, [ suggestion( 'Alpha' ) ] ) ).toThrow()
  } )
} )

describe( 'findSuggestions', () => {
  it( 'returns the requested suggestions of the job, in any status', () => {
    const [ first, second ] = seed()
    setStatus( userId, [ second ?? '' ], 'rejected', '2026-10-21T11:00:00.000Z' )

    expect( findSuggestions( userId, JOB_1, [ first ?? '', second ?? '' ] )
      .map( ( { target, status } ) => ( { target, status } ) ) )
      .toEqual( [
        { target: 'Alpha', status: 'pending' },
        { target: 'Beta', status: 'rejected' },
      ] )
  } )

  it( 'ignores unknown ids and ids that belong to another job', () => {
    const [ mine ] = seed( JOB_1 )
    const [ theirs ] = seed( JOB_2 )

    expect( findSuggestions( userId, JOB_1, [ mine ?? '', theirs ?? '', crypto.randomUUID() ] )
      .map( ( { id } ) => id ) ).toEqual( [ mine ] )
  } )

  it( 'returns nothing for no ids', () => {
    seed()

    expect( findSuggestions( userId, JOB_1, [] ) ).toEqual( [] )
  } )
} )

describe( 'setStatus', () => {
  it( 'sets the status and decision time of the given suggestions only', () => {
    const [ first, second ] = seed()

    setStatus( userId, [ first ?? '' ], 'accepted', '2026-10-21T11:00:00.000Z' )

    const listed = listSuggestions( userId, JOB_1 )

    expect( listed[ 0 ] ).toMatchObject( {
      id: first,
      status: 'accepted',
      decided_at: '2026-10-21T11:00:00.000Z',
    } )
    expect( listed.find( ( { id } ) => id === second ) )
      .toMatchObject( { status: 'pending', decided_at: null } )
  } )

  it( 'can decide several at once', () => {
    const ids = seed()

    setStatus( userId, ids, 'rejected', '2026-10-21T11:00:00.000Z' )

    expect( listSuggestions( userId, JOB_1 ).map( ( { status } ) => status ) )
      .toEqual( [ 'rejected', 'rejected', 'rejected' ] )
  } )

  it( 'does nothing for no ids', () => {
    seed()

    setStatus( userId, [], 'rejected', '2026-10-21T11:00:00.000Z' )

    expect( listSuggestions( userId, JOB_1 ).every( ( { status } ) => status === 'pending' ) )
      .toBe( true )
  } )
} )

describe( 'supersedePending', () => {
  it( 'supersedes pending suggestions and hides them, keeping decided ones', () => {
    const [ accepted, rejected ] = seed()
    setStatus( userId, [ accepted ?? '' ], 'accepted', '2026-10-21T11:00:00.000Z' )
    setStatus( userId, [ rejected ?? '' ], 'rejected', '2026-10-21T11:00:00.000Z' )

    supersedePending( userId, JOB_1 )

    expect( listSuggestions(
      userId,
      JOB_1,
    ).map( ( { target, status } ) => ( { target, status } ) ) )
      .toEqual( [
        { target: 'Alpha', status: 'accepted' },
        { target: 'Beta', status: 'rejected' },
      ] )
  } )

  it( 'keeps superseded rows with the job', () => {
    const [ first ] = seed()

    supersedePending( userId, JOB_1 )

    expect( findSuggestions( userId, JOB_1, [ first ?? '' ] ) )
      .toMatchObject( [ { status: 'superseded' } ] )
  } )

  it( 'leaves other jobs alone', () => {
    seed( JOB_1 )
    seed( JOB_2 )

    supersedePending( userId, JOB_1 )

    expect( listSuggestions( userId, JOB_2 ) ).toHaveLength( 3 )
  } )
} )

describe( 'deleteForJob', () => {
  it( 'deletes every suggestion of the job, whatever its status, and only those', () => {
    const [ first ] = seed( JOB_1 )
    seed( JOB_2 )
    setStatus( userId, [ first ?? '' ], 'accepted', '2026-10-21T11:00:00.000Z' )
    supersedePending( userId, JOB_1 )

    deleteForJob( userId, JOB_1 )

    expect( findSuggestions( userId, JOB_1, [ first ?? '' ] ) ).toEqual( [] )
    expect( listSuggestions( userId, JOB_1 ) ).toEqual( [] )
    expect( listSuggestions( userId, JOB_2 ) ).toHaveLength( 3 )
  } )
} )

describe( 'ownership', () => {
  it( 'does not list, find, decide, supersede or delete another user\'s suggestions', () => {
    const other = createTestUser().id
    const [ stored ] = insertSuggestions( userId, newRun( JOB_1 ), JOB_1, [ suggestion( 'A' ) ] )
    const id = stored?.id ?? ''

    expect( listSuggestions( other, JOB_1 ) ).toEqual( [] )
    expect( findSuggestions( other, JOB_1, [ id ] ) ).toEqual( [] )

    setStatus( other, [ id ], 'accepted', '2026-10-21T11:00:00.000Z' )
    supersedePending( other, JOB_1 )
    deleteForJob( other, JOB_1 )

    expect( listSuggestions( userId, JOB_1 ) ).toMatchObject( [ { id, status: 'pending' } ] )
  } )
} )
