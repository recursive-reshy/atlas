// Packages
import { describe, it, expect } from 'vitest'
// Repositories
import { listModules, setModules } from './userModules.repository.js'
import { insertUser } from './users.repository.js'
import { getDatabase } from './database.js'

const addUser = ( id: string ): string => {
  insertUser( {
    id,
    email: `${ id }@x.test`,
    name: id,
    role: 'member',
    status: 'active',
    created_at: '2026-10-24T10:00:00.000Z',
  } )

  return id
}

describe( 'listModules', () => {
  it( 'is empty for a user with none, and for an unknown user', () => {
    expect( listModules( addUser( 'a' ) ) ).toEqual( [] )
    expect( listModules( 'nope' ) ).toEqual( [] )
  } )
} )

describe( 'setModules', () => {
  it( 'replaces the set', () => {
    const user = addUser( 'a' )

    setModules( user, [ 'transcriber', 'melete' ] )

    expect( listModules( user ) ).toEqual( [ 'transcriber', 'melete' ] )

    setModules( user, [ 'melete' ] )

    expect( listModules( user ) ).toEqual( [ 'melete' ] )
  } )

  it( 'clears the set with an empty list and accepts repeats', () => {
    const user = addUser( 'a' )

    setModules( user, [ 'melete', 'melete' ] )

    expect( listModules( user ) ).toEqual( [ 'melete' ] )

    setModules( user, [] )

    expect( listModules( user ) ).toEqual( [] )
  } )

  it( 'leaves other users untouched', () => {
    const a = addUser( 'a' )
    const b = addUser( 'b' )

    setModules( a, [ 'transcriber' ] )
    setModules( b, [ 'melete' ] )
    setModules( a, [] )

    expect( listModules( b ) ).toEqual( [ 'melete' ] )
  } )

  it( 'writes nothing when one write fails', () => {
    const user = addUser( 'a' )

    setModules( user, [ 'transcriber' ] )

    expect( () => setModules( user, [ 'melete', 'bogus' as 'melete' ] ) ).toThrow()
    expect( listModules( user ) ).toEqual( [ 'transcriber' ] )
  } )

  it( 'leaves out a stored module the application does not know', () => {
    const user = addUser( 'a' )

    setModules( user, [ 'melete' ] )
    getDatabase().prepare(
      'INSERT INTO user_modules ( user_id, module ) VALUES ( ?, \'retired\' )',
    ).run( user )

    expect( listModules( user ) ).toEqual( [ 'melete' ] )
  } )
} )
