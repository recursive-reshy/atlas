// Testing Library
import { renderHook } from '@testing-library/react'
// Vitest
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Packages
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'
// App
import { useSignIn } from './useSignIn'

const assign = vi.fn()

afterEach( () => {
  vi.unstubAllGlobals()
  assign.mockReset()
} )

const hookAt = ( entry: string ): ( () => void ) => {
  vi.stubGlobal( 'location', { assign } )
  const wrapper = ( { children }: { children: ReactNode } ) => (
    <MemoryRouter initialEntries={ [ entry ] }>{ children }</MemoryRouter>
  )

  return renderHook( () => useSignIn(), { wrapper } ).result.current
}

describe( 'useSignIn', () => {
  it( 'goes to Google sign-in and returns to the current page', () => {
    hookAt( '/jobs/abc?tab=note' )()

    expect( assign ).toHaveBeenCalledWith(
      '/api/auth/google?returnTo=%2Fjobs%2Fabc%3Ftab%3Dnote',
    )
  } )

  it( 'returns to the home page from the sign-in page itself', () => {
    hookAt( '/signin?error=failed' )()

    expect( assign ).toHaveBeenCalledWith( '/api/auth/google?returnTo=%2F' )
  } )
} )
