// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Shared
import { ThemisAreaResponse, ThemisGoalResponse } from '@atlas/shared'
// App
import { app } from '../app.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
// Test support
import { createTestUser, signedInRequest } from '../test-support/auth.js'

type Agent = ReturnType< typeof signedInRequest >

let owner: Agent
let other: Agent
let area = ''
let goal = ''

beforeEach( async () => {
  owner = signedInRequest( app, createTestUser( { modules: [ 'themis' ] } ) )
  other = signedInRequest( app, createTestUser( { modules: [ 'themis' ] } ) )
  area = ThemisAreaResponse.parse(
    ( await owner.post( '/api/themis/areas' ).send( { name: 'Career' } ) ).body,
  ).area.id
  goal = ThemisGoalResponse.parse( ( await owner.post( '/api/themis/goals' )
    .send( { area_id: area, name: 'Mine', outcome: 'learning' } ) ).body ).goal.id
} )

describe( 'Themis isolation between users', () => {
  it( 'answers 404 to another user for every area and goal route', async () => {
    const attempts = [
      await other.patch( `/api/themis/areas/${ area }` ).send( { name: 'Hacked' } ),
      await other.delete( `/api/themis/areas/${ area }` ),
      await other.patch( `/api/themis/goals/${ goal }` ).send( { name: 'Hacked' } ),
      await other.delete( `/api/themis/goals/${ goal }` ),
    ]

    expect( attempts.map( ( { status } ) => status ) ).toEqual( [ 404, 404, 404, 404 ] )
    expect( getDatabase().prepare( 'SELECT name FROM themis_areas' ).all() )
      .toEqual( [ { name: 'Career' } ] )
    expect( getDatabase().prepare( 'SELECT name FROM themis_goals' ).all() )
      .toEqual( [ { name: 'Mine' } ] )
  } )

  it( 'refuses a goal in someone else\'s area, and a move into it', async () => {
    const theirs = ThemisAreaResponse.parse(
      ( await other.post( '/api/themis/areas' ).send( { name: 'Theirs' } ) ).body,
    ).area.id

    expect( ( await other.post( '/api/themis/goals' )
      .send( { area_id: area, name: 'Sneaky', outcome: 'learning' } ) ).status ).toBe( 404 )
    expect( ( await owner.patch( `/api/themis/goals/${ goal }` ).send( { area_id: theirs } ) )
      .status ).toBe( 404 )
  } )

  it( 'lets two users have an area with the same name', async () => {
    expect( ( await other.post( '/api/themis/areas' ).send( { name: 'Career' } ) ).status )
      .toBe( 201 )
  } )
} )
