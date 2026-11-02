// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
// Repositories
import { getDatabase } from './database.js'
import {
  deleteHealth,
  getHealth,
  listErrors,
  listHealth,
  recordFailure,
  recordSuccess,
} from './health.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const at = ( minute: number ): string => {
  return `2026-10-22T10:${ String( minute ).padStart( 2, '0' ) }:00.000Z`
}

describe( 'recordSuccess', () => {
  it( 'creates the row with the check and success times', () => {
    recordSuccess( userId, 'feed', 'f1', at( 1 ) )

    expect( getHealth( userId, 'feed', 'f1' ) ).toEqual( {
      kind: 'feed',
      subject_id: 'f1',
      last_checked_at: at( 1 ),
      last_success_at: at( 1 ),
      last_error: null,
      failing_since: null,
      detail: null,
    } )
  } )

  it( 'stores the detail', () => {
    recordSuccess( null, 'replication', 'default', at( 1 ), '{"file":"a.db"}' )

    expect( getHealth( null, 'replication', 'default' )?.detail ).toBe( '{"file":"a.db"}' )
  } )

  it( 'clears last_error and failing_since after a failure', () => {
    recordFailure( userId, 'feed', 'f1', at( 1 ), 'HTTP 500' )
    recordSuccess( userId, 'feed', 'f1', at( 2 ) )

    expect( getHealth( userId, 'feed', 'f1' ) ).toMatchObject( {
      last_checked_at: at( 2 ),
      last_success_at: at( 2 ),
      last_error: null,
      failing_since: null,
    } )
  } )

  it( 'keeps the error history', () => {
    recordFailure( userId, 'feed', 'f1', at( 1 ), 'HTTP 500' )
    recordSuccess( userId, 'feed', 'f1', at( 2 ) )

    expect( listErrors( userId, 'feed', 'f1' ) ).toEqual( [ { at: at( 1 ), message: 'HTTP 500' } ] )
  } )
} )

describe( 'recordFailure', () => {
  it( 'sets the check time, the error and failing_since, and keeps no success time', () => {
    recordFailure( null, 'agent', 'default', at( 1 ), 'down' )

    expect( getHealth( null, 'agent', 'default' ) ).toEqual( {
      kind: 'agent',
      subject_id: 'default',
      last_checked_at: at( 1 ),
      last_success_at: null,
      last_error: 'down',
      failing_since: at( 1 ),
      detail: null,
    } )
  } )

  it( 'keeps the last success time and the detail', () => {
    recordSuccess( null, 'replication', 'default', at( 1 ), 'a.db' )
    recordFailure( null, 'replication', 'default', at( 2 ), 'disk full' )

    expect( getHealth( null, 'replication', 'default' ) ).toMatchObject( {
      last_checked_at: at( 2 ),
      last_success_at: at( 1 ),
      last_error: 'disk full',
      detail: 'a.db',
    } )
  } )

  it( 'keeps failing_since on repeated failures and updates the latest error', () => {
    recordFailure( userId, 'feed', 'f1', at( 1 ), 'first' )
    recordFailure( userId, 'feed', 'f1', at( 2 ), 'second' )

    expect( getHealth( userId, 'feed', 'f1' ) ).toMatchObject( {
      last_checked_at: at( 2 ),
      last_error: 'second',
      failing_since: at( 1 ),
    } )
  } )

  it( 'starts failing_since again after a success', () => {
    recordFailure( userId, 'feed', 'f1', at( 1 ), 'first' )
    recordSuccess( userId, 'feed', 'f1', at( 2 ) )
    recordFailure( userId, 'feed', 'f1', at( 3 ), 'again' )

    expect( getHealth( userId, 'feed', 'f1' )?.failing_since ).toBe( at( 3 ) )
  } )

  it( 'keeps only the newest 5 errors, newest first', () => {
    for( let minute = 1; minute <= 7; minute += 1 ) {
      recordFailure( userId, 'feed', 'f1', at( minute ), `error ${ minute }` )
    }

    expect( listErrors( userId, 'feed', 'f1' ).map( ( { message } ) => message ) )
      .toEqual( [ 'error 7', 'error 6', 'error 5', 'error 4', 'error 3' ] )
  } )

  it( 'trims each subject on its own', () => {
    for( let minute = 1; minute <= 6; minute += 1 ) {
      recordFailure( userId, 'feed', 'f1', at( minute ), 'x' )
    }

    recordFailure( userId, 'feed', 'f2', at( 1 ), 'y' )
    recordFailure( userId, 'gmail_source', 'f1', at( 1 ), 'z' )

    expect( listErrors( userId, 'feed', 'f1' ) ).toHaveLength( 5 )
    expect( listErrors( userId, 'feed', 'f2' ) ).toHaveLength( 1 )
    expect( listErrors( userId, 'gmail_source', 'f1' ) ).toHaveLength( 1 )
  } )
} )

describe( 'getHealth, listHealth and listErrors', () => {
  it( 'returns undefined and an empty list for an unknown subject', () => {
    expect( getHealth( userId, 'feed', 'nope' ) ).toBeUndefined()
    expect( listErrors( userId, 'feed', 'nope' ) ).toEqual( [] )
  } )

  it( 'lists every row', () => {
    recordSuccess( userId, 'feed', 'f1', at( 1 ) )
    recordFailure( null, 'agent', 'default', at( 2 ), 'down' )

    expect( listHealth( userId, true ).map( ( { kind } ) => kind ).sort() )
      .toEqual( [ 'agent', 'feed' ] )
  } )
} )

describe( 'deleteHealth', () => {
  it( 'removes the row and its errors and leaves other subjects', () => {
    recordFailure( userId, 'feed', 'f1', at( 1 ), 'x' )
    recordFailure( userId, 'feed', 'f2', at( 1 ), 'y' )

    deleteHealth( userId, 'feed', 'f1' )

    expect( getHealth( userId, 'feed', 'f1' ) ).toBeUndefined()
    expect( listErrors( userId, 'feed', 'f1' ) ).toEqual( [] )
    expect( getHealth( userId, 'feed', 'f2' ) ).toBeDefined()
    expect( listErrors( userId, 'feed', 'f2' ) ).toHaveLength( 1 )
  } )

  it( 'does nothing for an unknown subject', () => {
    expect( () => deleteHealth( userId, 'feed', 'nope' ) ).not.toThrow()
  } )
} )

describe( 'ownership', () => {
  it( 'keeps a user\'s rows to that user', () => {
    const other = createTestUser().id

    recordSuccess( userId, 'feed', 'f1', at( 1 ) )
    recordFailure( other, 'feed', 'f2', at( 1 ), 'down' )

    expect( getHealth( other, 'feed', 'f1' ) ).toBeUndefined()
    expect( getHealth( userId, 'feed', 'f2' ) ).toBeUndefined()
    expect( listHealth( userId, false ).map( ( { subject_id } ) => subject_id ) )
      .toEqual( [ 'f1' ] )
    expect( listHealth( other, false ).map( ( { subject_id } ) => subject_id ) ).toEqual( [ 'f2' ] )
    expect( listErrors( userId, 'feed', 'f2' ) ).toEqual( [] )
    expect( listErrors( other, 'feed', 'f2' ) ).toHaveLength( 1 )
  } )

  it( 'does not let one user delete another\'s row', () => {
    const other = createTestUser().id

    recordFailure( userId, 'feed', 'f1', at( 1 ), 'x' )

    deleteHealth( other, 'feed', 'f1' )

    expect( getHealth( userId, 'feed', 'f1' ) ).toBeDefined()
    expect( listErrors( userId, 'feed', 'f1' ) ).toHaveLength( 1 )
  } )

  it( 'shows the app rows only when asked for them', () => {
    recordSuccess( null, 'agent', 'default', at( 1 ) )
    recordSuccess( userId, 'feed', 'f1', at( 1 ) )

    expect( listHealth( userId, false ).map( ( { kind } ) => kind ) ).toEqual( [ 'feed' ] )
    expect( listHealth( userId, true ).map( ( { kind } ) => kind ).sort() )
      .toEqual( [ 'agent', 'feed' ] )
  } )

  it( 'keeps the app rows without an owner, whoever asks', () => {
    const other = createTestUser().id

    recordFailure( null, 'agent', 'default', at( 1 ), 'down' )

    expect( getHealth( null, 'agent', 'default' )?.last_error ).toBe( 'down' )
    expect( listErrors( null, 'agent', 'default' ) ).toHaveLength( 1 )
    expect( getHealth( other, 'agent', 'default' ) ).toBeUndefined()
    expect( listHealth( other, true ).map( ( { kind } ) => kind ) ).toEqual( [ 'agent' ] )
  } )
} )

describe( 'the kind check', () => {
  it( 'refuses an app kind with an owner and a user kind without one', () => {
    expect( () => recordSuccess( userId, 'agent', 'default', at( 1 ) ) ).toThrow( /CHECK/ )
    expect( () => recordFailure( userId, 'transcription', 'default', at( 1 ), 'x' ) )
      .toThrow( /CHECK/ )
    expect( () => recordSuccess( null, 'feed', 'f1', at( 1 ) ) ).toThrow( /CHECK/ )
    expect( () => recordFailure( null, 'gmail_source', 's1', at( 1 ), 'x' ) ).toThrow( /CHECK/ )
  } )

  it( 'stamps the owner on the status and error rows', () => {
    recordFailure( userId, 'feed', 'f1', at( 1 ), 'x' )
    recordFailure( null, 'agent', 'default', at( 1 ), 'y' )

    expect( getDatabase().prepare( 'SELECT kind, user_id FROM health_status ORDER BY kind' ).all() )
      .toEqual( [ { kind: 'agent', user_id: null }, { kind: 'feed', user_id: userId } ] )
    expect( getDatabase().prepare( 'SELECT kind, user_id FROM health_errors ORDER BY kind' ).all() )
      .toEqual( [ { kind: 'agent', user_id: null }, { kind: 'feed', user_id: userId } ] )
  } )

  it( 'removes a user\'s rows with the user', () => {
    recordFailure( userId, 'feed', 'f1', at( 1 ), 'x' )
    recordFailure( null, 'agent', 'default', at( 1 ), 'y' )

    getDatabase().prepare( 'DELETE FROM users WHERE id = ?' ).run( userId )

    expect( getDatabase().prepare( 'SELECT kind FROM health_status' ).all() )
      .toEqual( [ { kind: 'agent' } ] )
    expect( getDatabase().prepare( 'SELECT kind FROM health_errors' ).all() )
      .toEqual( [ { kind: 'agent' } ] )
  } )
} )
