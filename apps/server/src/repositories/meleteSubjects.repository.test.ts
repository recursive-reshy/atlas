// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
// Repositories
import {
  findSubject,
  listSubjects,
  updateSubject,
  upsertSubject,
} from './meleteSubjects.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

describe( 'upsertSubject', () => {
  it( 'creates a subject with the defaults', () => {
    const subject = upsertSubject( userId, 'Learning/TypeScript' )

    expect( subject ).toEqual( {
      id: expect.stringMatching( /^[0-9a-f-]{36}$/ ) as string,
      folder: 'Learning/TypeScript',
      auto_enroll: false,
      new_per_day: 10,
      target_level: null,
      intent: null,
      syllabus_status: 'none',
      syllabus_error: null,
      created_at: expect.stringMatching( /^\d{4}-\d{2}-\d{2}T/ ) as string,
    } )
  } )

  it( 'returns the same subject for the same folder and keeps its settings', () => {
    const first = upsertSubject( userId, 'Learning/TypeScript' )

    updateSubject( userId, first.id, { auto_enroll: true, new_per_day: 3 } )

    const again = upsertSubject( userId, 'Learning/TypeScript' )

    expect( again.id ).toBe( first.id )
    expect( again ).toMatchObject( { auto_enroll: true, new_per_day: 3 } )
    expect( listSubjects( userId ) ).toHaveLength( 1 )
  } )

  it( 'gives different folders different subjects', () => {
    expect( upsertSubject( userId, 'Learning/A' ).id )
      .not.toBe( upsertSubject( userId, 'Learning/B' ).id )
  } )
} )

describe( 'listSubjects and findSubject', () => {
  it( 'lists nothing at first', () => {
    expect( listSubjects( userId ) ).toEqual( [] )
  } )

  it( 'lists subjects by folder, ignoring case', () => {
    upsertSubject( userId, 'Learning/beta' )
    upsertSubject( userId, 'Learning/Alpha' )
    upsertSubject( userId, 'Learning/Gamma' )

    expect( listSubjects( userId ).map( ( { folder } ) => folder ) )
      .toEqual( [ 'Learning/Alpha', 'Learning/beta', 'Learning/Gamma' ] )
  } )

  it( 'finds a subject by id and returns undefined for an unknown one', () => {
    const subject = upsertSubject( userId, 'Learning/A' )

    expect( findSubject( userId, subject.id ) ).toEqual( subject )
    expect( findSubject( userId, crypto.randomUUID() ) ).toBeUndefined()
  } )
} )

describe( 'updateSubject', () => {
  it( 'changes only the given fields and returns the subject', () => {
    const { id } = upsertSubject( userId, 'Learning/A' )

    expect( updateSubject( userId, id, { auto_enroll: true } ) )
      .toMatchObject( { auto_enroll: true, new_per_day: 10 } )
    expect( updateSubject( userId, id, { new_per_day: 0 } ) )
      .toMatchObject( { auto_enroll: true, new_per_day: 0 } )
    expect( updateSubject( userId, id, { auto_enroll: false } ) )
      .toMatchObject( { auto_enroll: false, new_per_day: 0 } )
  } )

  it( 'returns undefined for an unknown subject', () => {
    expect( updateSubject( userId, crypto.randomUUID(), { new_per_day: 5 } ) ).toBeUndefined()
  } )
} )

describe( 'ownership', () => {
  it( 'lets two users have a subject for the same folder', () => {
    const other = createTestUser().id

    const mine = upsertSubject( userId, 'Learning/TypeScript' )
    const theirs = upsertSubject( other, 'Learning/TypeScript' )

    expect( theirs.id ).not.toBe( mine.id )
    expect( upsertSubject( userId, 'Learning/TypeScript' ).id ).toBe( mine.id )
  } )

  it( 'does not show or change another user\'s subject', () => {
    const other = createTestUser().id
    const mine = upsertSubject( userId, 'Learning/TypeScript' )

    expect( findSubject( other, mine.id ) ).toBeUndefined()
    expect( listSubjects( other ) ).toEqual( [] )
    expect( updateSubject( other, mine.id, { new_per_day: 1, auto_enroll: true } ) ).toBeUndefined()
    expect( findSubject( userId, mine.id ) )
      .toMatchObject( { new_per_day: 10, auto_enroll: false } )
  } )
} )

describe( 'updateSubject, the syllabus fields', () => {
  it( 'sets and clears the target level and intent', () => {
    const { id } = upsertSubject( userId, 'Learning/Data' )

    expect( updateSubject( userId, id, { target_level: 'proficient', intent: 'Pass the exam' } ) )
      .toMatchObject( { target_level: 'proficient', intent: 'Pass the exam' } )
    expect( updateSubject( userId, id, { intent: null } ) )
      .toMatchObject( { target_level: 'proficient', intent: null } )
  } )

  it( 'sets the syllabus status with its error, and clears the error', () => {
    const { id } = upsertSubject( userId, 'Learning/Data' )

    expect( updateSubject( userId, id, { syllabus_status: 'failed', syllabus_error: 'Too long' } ) )
      .toMatchObject( { syllabus_status: 'failed', syllabus_error: 'Too long' } )
    expect( updateSubject( userId, id, { syllabus_status: 'drafting', syllabus_error: null } ) )
      .toMatchObject( { syllabus_status: 'drafting', syllabus_error: null } )
  } )

  it( 'leaves the syllabus fields alone when only enrolment changes', () => {
    const { id } = upsertSubject( userId, 'Learning/Data' )

    updateSubject( userId, id, { target_level: 'expert', syllabus_status: 'approved' } )

    expect( updateSubject( userId, id, { new_per_day: 2 } ) )
      .toMatchObject( { target_level: 'expert', syllabus_status: 'approved', new_per_day: 2 } )
  } )

  it( 'does not change another user\'s subject', () => {
    const { id } = upsertSubject( userId, 'Learning/Data' )
    const other = createTestUser( { role: 'member', modules: [ 'melete' ] } ).id

    expect( updateSubject( other, id, { target_level: 'expert' } ) ).toBeUndefined()
    expect( findSubject( userId, id )?.target_level ).toBeNull()
  } )
} )
