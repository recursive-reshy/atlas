// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Repositories
import {
  deleteArea,
  findArea,
  findAreaByName,
  insertArea,
  listAreas,
  renameArea,
  setAreaOrder,
} from './themisAreas.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

describe( 'insertArea and listAreas', () => {
  it( 'appends each area at the next position and lists them in order', () => {
    const first = insertArea( userId, 'Career' )
    const second = insertArea( userId, 'Financial' )

    expect( first ).toEqual( {
      id: expect.stringMatching( /^[0-9a-f-]{36}$/ ) as string,
      name: 'Career',
      position: 0,
      created_at: expect.stringMatching( /^\d{4}-\d{2}-\d{2}T/ ) as string,
    } )
    expect( second.position ).toBe( 1 )
    expect( listAreas( userId ).map( ( { name } ) => name ) ).toEqual( [ 'Career', 'Financial' ] )
  } )

  it( 'lists only the user\'s own areas', () => {
    insertArea( userId, 'Mine' )

    expect( listAreas( createTestUser().id ) ).toEqual( [] )
  } )

  it( 'refuses a name the user already has, whatever its case', () => {
    insertArea( userId, 'Career' )

    expect( () => insertArea( userId, 'career' ) ).toThrow( /UNIQUE/ )
    expect( insertArea( createTestUser().id, 'Career' ).name ).toBe( 'Career' )
  } )
} )

describe( 'findArea and findAreaByName', () => {
  it( 'finds an area by id or by name, ignoring case, for its owner only', () => {
    const area = insertArea( userId, 'Career' )
    const other = createTestUser().id

    expect( findArea( userId, area.id ) ).toEqual( area )
    expect( findAreaByName( userId, 'CAREER' ) ).toEqual( area )
    expect( findArea( other, area.id ) ).toBeUndefined()
    expect( findAreaByName( other, 'Career' ) ).toBeUndefined()
  } )
} )

describe( 'renameArea', () => {
  it( 'renames the area and returns it', () => {
    const area = insertArea( userId, 'Career' )

    expect( renameArea( userId, area.id, 'Work' ) ).toMatchObject( { id: area.id, name: 'Work' } )
  } )

  it( 'leaves another user\'s area alone', () => {
    const area = insertArea( userId, 'Career' )

    expect( renameArea( createTestUser().id, area.id, 'Hacked' ) ).toBeUndefined()
    expect( findArea( userId, area.id )?.name ).toBe( 'Career' )
  } )
} )

describe( 'setAreaOrder', () => {
  it( 'renumbers the areas in the order given', () => {
    const a = insertArea( userId, 'A' )
    const b = insertArea( userId, 'B' )
    const c = insertArea( userId, 'C' )

    setAreaOrder( userId, [ c.id, a.id, b.id ] )

    expect( listAreas( userId ).map( ( { name, position } ) => [ name, position ] ) )
      .toEqual( [ [ 'C', 0 ], [ 'A', 1 ], [ 'B', 2 ] ] )
  } )

  it( 'ignores ids that are not the user\'s', () => {
    const mine = insertArea( userId, 'Mine' )
    const other = createTestUser().id
    const theirs = insertArea( other, 'Theirs' )

    setAreaOrder( userId, [ theirs.id, mine.id ] )

    expect( findArea( other, theirs.id )?.position ).toBe( 0 )
  } )
} )

describe( 'deleteArea', () => {
  it( 'deletes the user\'s area and reports whether it did', () => {
    const area = insertArea( userId, 'Career' )

    expect( deleteArea( createTestUser().id, area.id ) ).toBe( false )
    expect( deleteArea( userId, area.id ) ).toBe( true )
    expect( findArea( userId, area.id ) ).toBeUndefined()
  } )
} )
