// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { ApiError } from '#src/lib/apiError'
import { listGmailLabels } from '../api/gmail.api'
import { gmailLabelFixture } from '../fixtures/gmail.fixture'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { useGmailLabels } from './useGmailLabels'

vi.mock( '../api/gmail.api' )

const mockedList = vi.mocked( listGmailLabels )

beforeEach( () => {
  mockedList.mockReset()
  mockedList.mockResolvedValue( [ gmailLabelFixture() ] )
} )

describe( 'useGmailLabels', () => {
  it( 'does not load until it is enabled', () => {
    const { result } = renderHookWithClient( () => useGmailLabels( { enabled: false } ) )

    expect( result.current.labels ).toEqual( [] )
    expect( result.current.isLoading ).toBe( false )
    expect( mockedList ).not.toHaveBeenCalled()
  } )

  it( 'loads the labels when enabled', async () => {
    const { result } = renderHookWithClient( () => useGmailLabels( { enabled: true } ) )

    expect( result.current.isLoading ).toBe( true )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.labels ).toEqual( [ gmailLabelFixture() ] )
    expect( result.current.error ).toBeNull()
  } )

  it( 'returns the error message when loading fails', async () => {
    mockedList.mockRejectedValue( new ApiError( 'Gmail isn\'t connected', 409 ) )
    const { result } = renderHookWithClient( () => useGmailLabels( { enabled: true } ) )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.labels ).toEqual( [] )
    expect( result.current.error ).toBe( 'Gmail isn\'t connected' )
  } )
} )
