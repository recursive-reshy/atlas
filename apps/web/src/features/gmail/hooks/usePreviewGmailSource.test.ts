// Testing Library
import { act } from '@testing-library/react'
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
import { previewGmailSource } from '../api/gmailSources.api'
import { gmailPreviewFixture } from '../fixtures/gmail.fixture'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { usePreviewGmailSource } from './usePreviewGmailSource'

vi.mock( '../api/gmailSources.api' )

const mockedPreview = vi.mocked( previewGmailSource )
const match = { kind: 'query', query: 'from:news@example.com' } as const

beforeEach( () => {
  mockedPreview.mockReset()
} )

describe( 'usePreviewGmailSource', () => {
  it( 'runs the match and returns the preview', async () => {
    mockedPreview.mockResolvedValue( gmailPreviewFixture() )
    const { result } = renderHookWithClient( () => usePreviewGmailSource() )

    act( () => result.current.mutate( match ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( mockedPreview ).toHaveBeenCalledWith( match )
    expect( result.current.data ).toEqual( gmailPreviewFixture() )
  } )

  it( 'reports the server\'s message', async () => {
    mockedPreview.mockRejectedValue( new ApiError( 'Gmail isn\'t connected', 409 ) )
    const { result } = renderHookWithClient( () => usePreviewGmailSource() )

    act( () => result.current.mutate( match ) )

    await vi.waitFor( () => expect( result.current.isError ).toBe( true ) )
    expect( result.current.error?.message ).toBe( 'Gmail isn\'t connected' )
  } )

  it( 'forgets the preview when reset', async () => {
    mockedPreview.mockResolvedValue( gmailPreviewFixture() )
    const { result } = renderHookWithClient( () => usePreviewGmailSource() )

    act( () => result.current.mutate( match ) )
    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )

    act( () => result.current.reset() )

    await vi.waitFor( () => expect( result.current.data ).toBeUndefined() )
  } )
} )
