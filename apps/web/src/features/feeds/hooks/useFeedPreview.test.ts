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
import { previewFeed } from '../api/feeds.api'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { useFeedPreview } from './useFeedPreview'

vi.mock( '../api/feeds.api' )

const mockedPreview = vi.mocked( previewFeed )
const preview = {
  feed_url: 'https://blog.example.com/feed.xml',
  title: 'Example Blog',
  latest_item: null,
}

beforeEach( () => {
  mockedPreview.mockReset()
} )

describe( 'useFeedPreview', () => {
  it( 'looks the address up and returns the preview', async () => {
    mockedPreview.mockResolvedValue( preview )
    const { result } = renderHookWithClient( () => useFeedPreview() )

    act( () => result.current.mutate( 'https://blog.example.com' ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( mockedPreview ).toHaveBeenCalledWith( 'https://blog.example.com' )
    expect( result.current.data ).toEqual( preview )
  } )

  it( 'reports the server\'s message', async () => {
    mockedPreview.mockRejectedValue( new ApiError( 'No feed found at this address', 400 ) )
    const { result } = renderHookWithClient( () => useFeedPreview() )

    act( () => result.current.mutate( 'https://x.example.com' ) )

    await vi.waitFor( () => expect( result.current.isError ).toBe( true ) )
    expect( result.current.error?.message ).toBe( 'No feed found at this address' )
  } )
} )
