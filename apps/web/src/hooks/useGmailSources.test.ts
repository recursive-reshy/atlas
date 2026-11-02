// Testing Library
import { act } from '@testing-library/react'
// Shared
import type { CreateGmailSourceBody } from '@atlas/shared'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { ApiError } from '../api/apiError'
import {
  checkAllGmailSources,
  checkGmailSource,
  createGmailSource,
  deleteGmailSource,
  listGmailSources,
  updateGmailSource,
} from '../api/gmailSources.api'
import { SOURCE_ID, gmailSourceFixture } from '../test-support/gmail.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { gmailKeys, inboxKeys, jobKeys } from './queryKeys'
import { useGmailSources } from './useGmailSources'

vi.mock( '../api/gmailSources.api' )

const mocks = {
  list: vi.mocked( listGmailSources ),
  create: vi.mocked( createGmailSource ),
  update: vi.mocked( updateGmailSource ),
  remove: vi.mocked( deleteGmailSource ),
  check: vi.mocked( checkGmailSource ),
  checkAll: vi.mocked( checkAllGmailSources ),
}

const setup = async () => {
  const rendered = renderHookWithClient( () => useGmailSources() )
  await vi.waitFor( () => expect( rendered.result.current.isLoading ).toBe( false ) )
  const invalidate = vi.spyOn( rendered.queryClient, 'invalidateQueries' )

  return { ...rendered, invalidate }
}

// A change to a source can add or remove inbox items and collected jobs.
const expectRefreshed = ( invalidate: ReturnType< typeof vi.spyOn > ): void => {
  expect( invalidate ).toHaveBeenCalledWith( { queryKey: gmailKeys.sources } )
  expect( invalidate ).toHaveBeenCalledWith( { queryKey: inboxKeys.all } )
  expect( invalidate ).toHaveBeenCalledWith( { queryKey: jobKeys.all } )
}

beforeEach( () => {
  Object.values( mocks ).forEach( ( mock ) => mock.mockReset() )
  mocks.list.mockResolvedValue( [ gmailSourceFixture() ] )
} )

describe( 'useGmailSources', () => {
  it( 'starts loading, then returns the sources', async () => {
    const { result } = renderHookWithClient( () => useGmailSources() )

    expect( result.current.isLoading ).toBe( true )
    expect( result.current.sources ).toEqual( [] )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.sources ).toEqual( [ gmailSourceFixture() ] )
    expect( result.current.error ).toBeNull()
    expect( result.current.updatedAt ).toBeGreaterThan( 0 )
  } )

  it( 'reports a load error', async () => {
    mocks.list.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { result } = renderHookWithClient( () => useGmailSources() )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Could not reach the server' ) )
  } )

  it( 'creates a source and refreshes', async () => {
    mocks.create.mockResolvedValue( gmailSourceFixture() )
    const { result, invalidate } = await setup()
    const body: CreateGmailSourceBody = {
      name: 'News',
      match: { kind: 'query', query: 'from:a@b.c' },
      destination: 'newsletter',
    }

    act( () => result.current.createSource.mutate( body ) )

    await vi.waitFor( () => expect( result.current.createSource.isSuccess ).toBe( true ) )
    expect( mocks.create ).toHaveBeenCalledWith( body )
    expectRefreshed( invalidate )
  } )

  it( 'updates a source and refreshes', async () => {
    mocks.update.mockResolvedValue( gmailSourceFixture( { enabled: false } ) )
    const { result, invalidate } = await setup()

    act( () => result.current.updateSource.mutate( { id: SOURCE_ID, body: { enabled: false } } ) )

    await vi.waitFor( () => expect( result.current.updateSource.isSuccess ).toBe( true ) )
    expect( mocks.update ).toHaveBeenCalledWith( SOURCE_ID, { enabled: false } )
    expectRefreshed( invalidate )
  } )

  it( 'deletes a source with the remove-inbox-items choice and refreshes', async () => {
    mocks.remove.mockResolvedValue( undefined )
    const { result, invalidate } = await setup()

    act( () => result.current.deleteSource.mutate( { id: SOURCE_ID, removeInboxItems: true } ) )

    await vi.waitFor( () => expect( result.current.deleteSource.isSuccess ).toBe( true ) )
    expect( mocks.remove ).toHaveBeenCalledWith( SOURCE_ID, true )
    expectRefreshed( invalidate )
  } )

  it( 'checks one source and refreshes, since a check can add inbox items', async () => {
    mocks.check.mockResolvedValue( gmailSourceFixture( { inbox_count: 2 } ) )
    const { result, invalidate } = await setup()

    act( () => result.current.checkSource.mutate( SOURCE_ID ) )

    await vi.waitFor( () => expect( result.current.checkSource.isSuccess ).toBe( true ) )
    expect( mocks.check ).toHaveBeenCalledWith( SOURCE_ID )
    expectRefreshed( invalidate )
  } )

  it( 'checks every source and refreshes', async () => {
    mocks.checkAll.mockResolvedValue( [ gmailSourceFixture() ] )
    const { result, invalidate } = await setup()

    act( () => result.current.checkAllSources.mutate() )

    await vi.waitFor( () => expect( result.current.checkAllSources.isSuccess ).toBe( true ) )
    expectRefreshed( invalidate )
  } )

  it( 'keeps the sources and exposes the error when a change fails', async () => {
    mocks.update.mockRejectedValue( new ApiError( 'Gmail source not found', 404 ) )
    const { result } = await setup()

    act( () => result.current.updateSource.mutate( { id: SOURCE_ID, body: { enabled: false } } ) )

    await vi.waitFor( () => expect( result.current.updateSource.isError ).toBe( true ) )
    expect( result.current.updateSource.error?.message ).toBe( 'Gmail source not found' )
    expect( result.current.sources ).toEqual( [ gmailSourceFixture() ] )
  } )
} )
