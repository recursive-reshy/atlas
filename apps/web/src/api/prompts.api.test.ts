// Vitest
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import {
  CODING_ID,
  profileFixture,
  profilesFixture,
  versionFixture,
} from '../features/jobs/fixtures/summarizer.fixture'
import {
  createProfile,
  deleteProfile,
  listProfiles,
  listVersions,
  renameProfile,
  resetProfile,
  restoreVersion,
  saveVersion,
} from './prompts.api'

const fetchMock = vi.fn()
const EMPTY_JSON = { headers: { 'Content-Type': 'application/json' }, body: '{}' }

const json = ( body: unknown, status = 200 ): Response => {
  return new Response( JSON.stringify( body ), { status } )
}

const jsonInit = ( method: string, body?: unknown ): RequestInit => {
  return body === undefined
    ? { method }
    : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( body ) }
}

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'listProfiles', () => {
  it( 'gets the profiles', async () => {
    fetchMock.mockResolvedValue( json( { profiles: profilesFixture() } ) )

    await expect( listProfiles() ).resolves.toEqual( profilesFixture() )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/prompt-profiles', undefined )
  } )

  it( 'asks for another purpose when given one', async () => {
    fetchMock.mockResolvedValue( json( { profiles: profilesFixture() } ) )

    await listProfiles( 'all' )

    expect( fetchMock ).toHaveBeenCalledWith( '/api/prompt-profiles?purpose=all', undefined )
  } )

  it( 'rejects a response that does not match the schema', async () => {
    fetchMock.mockResolvedValue( json( { profiles: [ { id: 'x' } ] } ) )

    await expect( listProfiles() ).rejects.toThrow( 'Unexpected response from the server' )
  } )
} )

describe( 'createProfile', () => {
  it( 'posts the name and guidance and returns the profile', async () => {
    const profile = profileFixture( { id: CODING_ID, name: 'Research' } )
    fetchMock.mockResolvedValue( json( { profile }, 201 ) )

    const body = { name: 'Research', guidance: 'Find sources.' }

    await expect( createProfile( body ) ).resolves.toEqual( profile )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/prompt-profiles', jsonInit( 'POST', body ) )
  } )

  it( 'reports the server message for a duplicate name', async () => {
    fetchMock.mockResolvedValue(
      json( { error: 'A profile with that name already exists' }, 409 ),
    )

    await expect( createProfile( { name: 'Coding', guidance: 'x' } ) )
      .rejects.toThrow( 'A profile with that name already exists' )
  } )
} )

describe( 'renameProfile', () => {
  it( 'patches the name', async () => {
    const profile = profileFixture( { name: 'Biz' } )
    fetchMock.mockResolvedValue( json( { profile } ) )

    await expect( renameProfile( profile.id, 'Biz' ) ).resolves.toEqual( profile )
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/prompt-profiles/${ profile.id }`,
      jsonInit( 'PATCH', { name: 'Biz' } ),
    )
  } )
} )

describe( 'deleteProfile', () => {
  it( 'deletes the profile and resolves with nothing on 204', async () => {
    fetchMock.mockResolvedValue( new Response( null, { status: 204 } ) )

    await expect( deleteProfile( CODING_ID ) ).resolves.toBeUndefined()
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/prompt-profiles/${ CODING_ID }`,
      { method: 'DELETE', ...EMPTY_JSON },
    )
  } )

  it( 'reports the server message for the default profile', async () => {
    fetchMock.mockResolvedValue( json( { error: 'The default profile cannot be deleted' }, 409 ) )

    await expect( deleteProfile( CODING_ID ) )
      .rejects.toThrow( 'The default profile cannot be deleted' )
  } )
} )

describe( 'listVersions', () => {
  it( 'gets the versions of a profile, with the id encoded', async () => {
    fetchMock.mockResolvedValue( json( { versions: [ versionFixture() ] } ) )

    await expect( listVersions( 'a/b' ) ).resolves.toEqual( [ versionFixture() ] )
    expect( fetchMock.mock.calls[ 0 ]?.[ 0 ] ).toBe( '/api/prompt-profiles/a%2Fb/versions' )
  } )
} )

describe( 'saveVersion', () => {
  it( 'posts the guidance and returns the profile', async () => {
    const profile = profileFixture()
    fetchMock.mockResolvedValue( json( { profile } ) )

    await expect( saveVersion( profile.id, 'New text' ) ).resolves.toEqual( profile )
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/prompt-profiles/${ profile.id }/versions`,
      jsonInit( 'POST', { guidance: 'New text' } ),
    )
  } )
} )

describe( 'restoreVersion', () => {
  it( 'posts to the restore path of the version', async () => {
    const profile = profileFixture()
    fetchMock.mockResolvedValue( json( { profile } ) )

    await expect( restoreVersion( profile.id, 7 ) ).resolves.toEqual( profile )
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/prompt-profiles/${ profile.id }/versions/7/restore`,
      { method: 'POST', ...EMPTY_JSON },
    )
  } )
} )

describe( 'resetProfile', () => {
  it( 'posts to the reset path', async () => {
    const profile = profileFixture()
    fetchMock.mockResolvedValue( json( { profile } ) )

    await expect( resetProfile( profile.id ) ).resolves.toEqual( profile )
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/prompt-profiles/${ profile.id }/reset`,
      { method: 'POST', ...EMPTY_JSON },
    )
  } )
} )
