// Packages
import { describe, it, expect } from 'vitest'
// Shared
import {
  ListPromptProfilesResponse,
  ListPromptVersionsResponse,
  PromptProfile,
  PromptProfileResponse,
} from '@atlas/shared'
// App
import { app } from '../app.js'
// Test support
import { createTestUser, signedInRequest as request } from '../test-support/auth.js'
// Summarizer
import { DEFAULT_LINKER_GUIDANCE, SEEDED_PROFILES } from '../summarizer/prompts.js'
// Melete
import { DEFAULT_MELETE_QUESTIONS_GUIDANCE } from '../melete/prompts.js'

const list = async (): Promise< PromptProfile[] > => {
  const response = await request( app ).get( '/api/prompt-profiles' )

  return ListPromptProfilesResponse.parse( response.body ).profiles
}

const idOf = async ( name: string ): Promise< string > => {
  return ( await list() ).find( ( profile ) => profile.name === name )?.id ?? ''
}

const create = async ( name: string, guidance = 'Focus.' ): Promise< PromptProfile > => {
  const response = await request( app ).post( '/api/prompt-profiles' ).send( { name, guidance } )

  return PromptProfileResponse.parse( response.body ).profile
}

const url = ( id: string, suffix = '' ): string => `/api/prompt-profiles/${ id }${ suffix }`

const unknownId = (): string => crypto.randomUUID()

describe( 'GET /api/prompt-profiles', () => {
  it( 'lists the shipped profiles by name with their current version', async () => {
    const response = await request( app ).get( '/api/prompt-profiles' )
    const { profiles } = ListPromptProfilesResponse.parse( response.body )

    expect( response.status ).toBe( 200 )
    expect( profiles.map( ( { name, can_reset } ) => ( { name, can_reset } ) ) ).toEqual( [
      { name: 'Business ideas', can_reset: true },
      { name: 'Coding', can_reset: true },
      { name: 'General', can_reset: true },
      { name: 'Study', can_reset: true },
    ] )
    expect( profiles[ 0 ]?.current_version.guidance ).toBe( SEEDED_PROFILES[ 0 ]?.guidance )
  } )
} )

describe( 'POST /api/prompt-profiles', () => {
  it( 'creates a profile at version 1 and returns 201', async () => {
    const response = await request( app )
      .post( '/api/prompt-profiles' )
      .send( { name: ' Research ', guidance: ' Find sources. ' } )

    const { profile } = PromptProfileResponse.parse( response.body )

    expect( response.status ).toBe( 201 )
    expect( profile ).toMatchObject( { name: 'Research', can_reset: false } )
    expect( profile.current_version ).toMatchObject( { version: 1, guidance: 'Find sources.' } )
  } )

  it.each( [
    [ 'an empty name', { name: ' ', guidance: 'x' } ],
    [ 'a name over 60 characters', { name: 'a'.repeat( 61 ), guidance: 'x' } ],
    [ 'empty guidance', { name: 'N', guidance: '  ' } ],
    [ 'guidance over 20000 characters', { name: 'N', guidance: 'a'.repeat( 20_001 ) } ],
    [ 'a missing field', { name: 'N' } ],
  ] )( 'returns 400 for %s', async ( _name, body ) => {
    const response = await request( app ).post( '/api/prompt-profiles' ).send( body )

    expect( response.status ).toBe( 400 )
  } )

  it( 'returns 409 for a name that is taken, ignoring case', async () => {
    const response = await request( app )
      .post( '/api/prompt-profiles' )
      .send( { name: 'coding', guidance: 'x' } )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'A profile with that name already exists' } )
  } )
} )

describe( 'PATCH /api/prompt-profiles/:id', () => {
  it( 'renames a profile', async () => {
    const id = await idOf( 'Coding' )

    const response = await request( app ).patch( url( id ) ).send( { name: 'Code' } )

    expect( response.status ).toBe( 200 )
    expect( PromptProfileResponse.parse( response.body ).profile.name ).toBe( 'Code' )
  } )

  it( 'returns 400 for an empty name', async () => {
    const id = await idOf( 'Coding' )

    const response = await request( app ).patch( url( id ) ).send( { name: '' } )

    expect( response.status ).toBe( 400 )
  } )

  it( 'returns 404 for an unknown profile', async () => {
    const response = await request( app )
      .patch( url( unknownId() ) )
      .send( { name: 'X' } )

    expect( response.status ).toBe( 404 )
  } )

  it( 'returns 409 for a name that is taken', async () => {
    const id = await idOf( 'Coding' )

    const response = await request( app ).patch( url( id ) ).send( { name: 'General' } )

    expect( response.status ).toBe( 409 )
  } )
} )

describe( 'DELETE /api/prompt-profiles/:id', () => {
  it( 'deletes a profile with 204 and drops it from the list', async () => {
    const id = await idOf( 'Coding' )

    const response = await request( app ).delete( url( id ) )

    expect( response.status ).toBe( 204 )
    expect( ( await list() ).map( ( { name } ) => name ) ).not.toContain( 'Coding' )
  } )

  it( 'returns 404 for an unknown profile', async () => {
    const response = await request( app ).delete( url( unknownId() ) )

    expect( response.status ).toBe( 404 )
  } )

  it( 'returns 409 for the default profile', async () => {
    const id = await idOf( 'Business ideas' )

    const response = await request( app ).delete( url( id ) )

    expect( response.status ).toBe( 409 )
  } )

  it( 'returns 409 for the last remaining profile', async () => {
    const business = await idOf( 'Business ideas' )
    await request( app ).delete( url( await idOf( 'Coding' ) ) )
    await request( app ).delete( url( await idOf( 'General' ) ) )
    const other = await create( 'Other' )
    await request( app ).patch( '/api/settings' ).send( { default_profile_id: other.id } )
    await request( app ).delete( url( business ) )

    const response = await request( app ).delete( url( other.id ) )

    expect( response.status ).toBe( 409 )
  } )
} )

describe( 'versions', () => {
  it( 'GET lists versions newest first', async () => {
    const id = await idOf( 'Coding' )
    await request( app ).post( url( id, '/versions' ) ).send( { guidance: 'Two' } )

    const response = await request( app ).get( url( id, '/versions' ) )

    expect( response.status ).toBe( 200 )
    expect( ListPromptVersionsResponse.parse( response.body ).versions.map( ( v ) => v.version ) )
      .toEqual( [ 2, 1 ] )
  } )

  it( 'GET returns 404 for an unknown profile', async () => {
    const response = await request( app ).get( url( unknownId(), '/versions' ) )

    expect( response.status ).toBe( 404 )
  } )

  it( 'POST saves a new version', async () => {
    const id = await idOf( 'Coding' )

    const response = await request( app )
      .post( url( id, '/versions' ) )
      .send( { guidance: 'New text' } )

    expect( response.status ).toBe( 200 )
    expect( PromptProfileResponse.parse( response.body ).profile.current_version )
      .toMatchObject( { version: 2, source: 'edit', guidance: 'New text' } )
  } )

  it( 'POST with unchanged guidance returns the profile without a new version', async () => {
    const id = await idOf( 'Coding' )
    const same = SEEDED_PROFILES[ 1 ]?.guidance ?? ''

    const response = await request( app )
      .post( url( id, '/versions' ) )
      .send( { guidance: same } )

    expect( response.status ).toBe( 200 )
    expect( PromptProfileResponse.parse( response.body ).profile.current_version.version ).toBe( 1 )
  } )

  it.each( [ {}, { guidance: '' }, { guidance: 'a'.repeat( 20_001 ) } ] )(
    'POST returns 400 for the body %j',
    async ( body ) => {
      const id = await idOf( 'Coding' )

      const response = await request( app ).post( url( id, '/versions' ) ).send( body )

      expect( response.status ).toBe( 400 )
    },
  )

  it( 'POST returns 404 for an unknown profile', async () => {
    const response = await request( app )
      .post( url( unknownId(), '/versions' ) )
      .send( { guidance: 'x' } )

    expect( response.status ).toBe( 404 )
  } )
} )

describe( 'POST /api/prompt-profiles/:id/versions/:versionId/restore', () => {
  it( 'saves a copy of the old version as the newest', async () => {
    const id = await idOf( 'Coding' )
    const [ first ] = ListPromptVersionsResponse.parse(
      ( await request( app ).get( url( id, '/versions' ) ) ).body,
    ).versions
    await request( app ).post( url( id, '/versions' ) ).send( { guidance: 'Two' } )

    const response = await request( app )
      .post( url( id, `/versions/${ first?.id }/restore` ) )

    expect( response.status ).toBe( 200 )
    expect( PromptProfileResponse.parse( response.body ).profile.current_version )
      .toMatchObject( { version: 3, source: 'restore', guidance: first?.guidance } )
  } )

  it( 'returns 404 for an unknown profile', async () => {
    const response = await request( app )
      .post( url( unknownId(), '/versions/1/restore' ) )

    expect( response.status ).toBe( 404 )
  } )

  it( 'returns 404 for a version that belongs to another profile', async () => {
    const coding = await idOf( 'Coding' )
    const general = PromptProfileResponse.parse(
      ( await request( app ).post( url( await idOf( 'General' ), '/versions' ) )
        .send( { guidance: 'g' } ) ).body,
    ).profile

    const response = await request( app )
      .post( url( coding, `/versions/${ general.current_version.id }/restore` ) )

    expect( response.status ).toBe( 404 )
  } )

  it.each( [ 'abc', '0', '-1', '1.5' ] )(
    'returns 400 for the version id %s',
    async ( versionId ) => {
      const id = await idOf( 'Coding' )

      const response = await request( app )
        .post( url( id, `/versions/${ versionId }/restore` ) )

      expect( response.status ).toBe( 400 )
    },
  )
} )

describe( 'POST /api/prompt-profiles/:id/reset', () => {
  it( 'saves the shipped text as a reset version', async () => {
    const id = await idOf( 'Coding' )
    await request( app ).post( url( id, '/versions' ) ).send( { guidance: 'Changed' } )

    const response = await request( app ).post( url( id, '/reset' ) )

    expect( response.status ).toBe( 200 )
    expect( PromptProfileResponse.parse( response.body ).profile.current_version ).toMatchObject( {
      version: 3,
      source: 'reset',
      guidance: SEEDED_PROFILES[ 1 ]?.guidance,
    } )
  } )

  it( 'returns 404 for an unknown profile', async () => {
    const response = await request( app ).post( url( unknownId(), '/reset' ) )

    expect( response.status ).toBe( 404 )
  } )

  it( 'returns 409 for a profile the app does not ship', async () => {
    const { id } = await create( 'Mine' )

    const response = await request( app ).post( url( id, '/reset' ) )

    expect( response.status ).toBe( 409 )
  } )
} )

describe( 'the linker prompt', () => {
  const linkerId = async (): Promise< string > => {
    const settings = await request( app ).get( '/api/settings' )

    return String( ( settings.body as { settings: { linker_profile_id: string } } )
      .settings.linker_profile_id )
  }

  it( 'is not listed', async () => {
    expect( ( await list() ).map( ( { name } ) => name ) ).not.toContain( 'Linker' )
  } )

  it( 'lets a summary profile be created with the name Linker', async () => {
    const response = await request( app )
      .post( '/api/prompt-profiles' )
      .send( { name: 'Linker', guidance: 'Focus.' } )

    expect( response.status ).toBe( 201 )
  } )

  it( 'cannot be renamed or deleted', async () => {
    const id = await linkerId()

    const renamed = await request( app ).patch( url( id ) ).send( { name: 'Other' } )
    const deleted = await request( app ).delete( url( id ) )

    expect( renamed.status ).toBe( 409 )
    expect( renamed.body ).toEqual( { error: 'The linker prompt can\'t be renamed or deleted' } )
    expect( deleted.status ).toBe( 409 )
  } )

  it( 'has versions, saves new ones and resets to the default guidance', async () => {
    const id = await linkerId()

    const saved = await request( app )
      .post( url( id, '/versions' ) )
      .send( { guidance: 'Be brief.' } )
    const versions = await request( app ).get( url( id, '/versions' ) )
    const reset = await request( app ).post( url( id, '/reset' ) )

    expect( saved.status ).toBe( 200 )
    expect( ListPromptVersionsResponse.parse( versions.body ).versions ).toHaveLength( 2 )
    expect( reset.status ).toBe( 200 )
    expect( PromptProfileResponse.parse( reset.body ).profile.current_version )
      .toMatchObject( { source: 'reset', guidance: DEFAULT_LINKER_GUIDANCE } )
  } )

  it( 'cannot be chosen as a summary profile', async () => {
    const id = await linkerId()

    expect( ( await request( app ).patch( '/api/settings' ).send( { default_profile_id: id } ) )
      .status ).toBe( 400 )
    expect( ( await request( app ).post( '/api/jobs' )
      .send( { url: 'https://www.youtube.com/watch?v=abc', profile_id: id } ) ).status )
      .toBe( 400 )
    expect( ( await request( app ).post( '/api/feeds' )
      .send( { url: 'https://blog.example.com/feed.xml', profile_id: id } ) ).status )
      .toBe( 400 )
  } )
} )

describe( 'GET /api/prompt-profiles with a purpose', () => {
  const listBy = async ( purpose: string ) => {
    const response = await request( app ).get( `/api/prompt-profiles?purpose=${ purpose }` )

    return { status: response.status, body: response.body as unknown }
  }

  it( 'lists every purpose with all', async () => {
    const { status, body } = await listBy( 'all' )

    expect( status ).toBe( 200 )
    expect( ListPromptProfilesResponse.parse( body ).profiles.map( ( { purpose } ) => purpose ) )
      .toEqual( [
        'summary',
        'summary',
        'summary',
        'summary',
        'linker',
        'melete_questions',
        'melete_grading',
        'melete_syllabus',
        'melete_map',
        'melete_suggest',
      ] )
  } )

  it( 'lists one purpose', async () => {
    const { body } = await listBy( 'melete_questions' )

    expect( ListPromptProfilesResponse.parse( body ).profiles.map( ( { name } ) => name ) )
      .toEqual( [ 'Melete questions' ] )
  } )

  it( 'keeps the summary list as the default', async () => {
    expect( ( await list() ).map( ( { purpose } ) => purpose ) )
      .toEqual( [ 'summary', 'summary', 'summary', 'summary' ] )
    expect( ( await listBy( 'summary' ) ).body ).toEqual( { profiles: await list() } )
  } )

  it( 'returns 400 for an unknown purpose', async () => {
    expect( ( await listBy( 'nonsense' ) ).status ).toBe( 400 )
  } )
} )

describe( 'the Melete prompts', () => {
  const meleteId = async ( purpose: string ): Promise< string > => {
    const response = await request( app ).get( `/api/prompt-profiles?purpose=${ purpose }` )

    return ListPromptProfilesResponse.parse( response.body ).profiles[ 0 ]?.id ?? ''
  }

  it( 'cannot be renamed or deleted', async () => {
    const id = await meleteId( 'melete_grading' )

    const renamed = await request( app ).patch( url( id ) ).send( { name: 'Other' } )
    const deleted = await request( app ).delete( url( id ) )

    expect( renamed.status ).toBe( 409 )
    expect( renamed.body ).toEqual( { error: 'The Melete prompts can\'t be renamed or deleted' } )
    expect( deleted.status ).toBe( 409 )
  } )

  it( 'have versions, save new ones and reset to the default guidance', async () => {
    const id = await meleteId( 'melete_questions' )

    const saved = await request( app )
      .post( url( id, '/versions' ) )
      .send( { guidance: 'Be brief.' } )
    const versions = await request( app ).get( url( id, '/versions' ) )
    const reset = await request( app ).post( url( id, '/reset' ) )

    expect( saved.status ).toBe( 200 )
    expect( ListPromptVersionsResponse.parse( versions.body ).versions ).toHaveLength( 2 )
    expect( PromptProfileResponse.parse( reset.body ).profile.current_version )
      .toMatchObject( { source: 'reset', guidance: DEFAULT_MELETE_QUESTIONS_GUIDANCE } )
  } )

  it( 'cannot be chosen as a summary profile', async () => {
    const id = await meleteId( 'melete_grading' )

    expect( ( await request( app ).patch( '/api/settings' ).send( { default_profile_id: id } ) )
      .status ).toBe( 400 )
    expect( ( await request( app ).post( '/api/jobs' )
      .send( { url: 'https://www.youtube.com/watch?v=abc', profile_id: id } ) ).status )
      .toBe( 400 )
    expect( ( await request( app ).post( '/api/feeds' )
      .send( { url: 'https://blog.example.com/feed.xml', profile_id: id } ) ).status )
      .toBe( 400 )
  } )
} )

describe( 'prompt profiles are per user', () => {
  it( 'gives each user their own profiles', async () => {
    const other = createTestUser()
    const mine = await idOf( 'Coding' )
    const theirs = ListPromptProfilesResponse.parse(
      ( await request( app, other ).get( '/api/prompt-profiles' ) ).body,
    ).profiles

    expect( theirs.map( ( { name } ) => name ) )
      .toEqual( ( await list() ).map( ( { name } ) => name ) )
    expect( theirs.map( ( { id } ) => id ) ).not.toContain( mine )
  } )

  it( 'does not list a profile another user created', async () => {
    const other = createTestUser()

    await create( 'Private' )

    const response = await request( app, other ).get( '/api/prompt-profiles' )

    expect( ListPromptProfilesResponse.parse( response.body ).profiles.map( ( { name } ) => name ) )
      .not.toContain( 'Private' )
  } )

  it( 'answers 404 for every route on another user\'s profile', async () => {
    const other = createTestUser()
    const profile = await create( 'Private' )
    const version = profile.current_version.id
    const asOther = ( ) => request( app, other )

    for( const response of [
      await asOther().patch( url( profile.id ) ).send( { name: 'Stolen' } ),
      await asOther().delete( url( profile.id ) ),
      await asOther().get( url( profile.id, '/versions' ) ),
      await asOther().post( url( profile.id, '/versions' ) ).send( { guidance: 'Hijack.' } ),
      await asOther().post( url( profile.id, `/versions/${ version }/restore` ) ),
      await asOther().post( url( profile.id, '/reset' ) ),
    ] ) {
      expect( response.status ).toBe( 404 )
    }

    expect( ( await list() ).find( ( { id } ) => id === profile.id )?.name ).toBe( 'Private' )
  } )

  it( 'lets two users use the same profile name', async () => {
    const other = createTestUser()

    await create( 'Shared name' )

    const response = await request( app, other )
      .post( '/api/prompt-profiles' )
      .send( { name: 'Shared name', guidance: 'Mine.' } )

    expect( response.status ).toBe( 201 )
  } )
} )
