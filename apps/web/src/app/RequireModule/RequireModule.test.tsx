// Packages
import { ThemeProvider } from '@mui/material/styles'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
// Testing Library
import { render, screen } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { useMe } from '../useMe'
import { createQueryClient } from '#src/queryClient'
import { meFixture, memberFixture } from '#src/test-support/me.fixture'
import { theme } from '#src/theme'
import { RequireModule } from './RequireModule'

vi.mock( '../useMe' )

const renderAt = ( path: string ): { pathname: () => string } => {
  const router = createMemoryRouter( [
    {
      element: <RequireModule module="transcriber" />,
      children: [
        { path: '/transcriber', element: <p>transcriber home</p> },
        { path: '/transcriber/jobs/:id', element: <p>a job</p> },
      ],
    },
    {
      element: <RequireModule module="melete" />,
      children: [ { path: '/melete', element: <p>melete home</p> } ],
    },
  ], { initialEntries: [ path ] } )

  render(
    <ThemeProvider theme={ theme } defaultMode="system" noSsr>
      <QueryClientProvider client={ createQueryClient() }>
        <RouterProvider router={ router } />
      </QueryClientProvider>
    </ThemeProvider>,
  )

  return { pathname: () => router.state.location.pathname }
}

const signedInAs = ( me: ReturnType< typeof meFixture > ): void => {
  vi.mocked( useMe ).mockReturnValue( { me, isLoading: false, error: null } )
}

beforeEach( () => {
  vi.mocked( useMe ).mockReset()
} )

describe( 'RequireModule', () => {
  it( 'shows the page to a user with the module', () => {
    signedInAs( memberFixture( { modules: [ 'transcriber' ] } ) )
    renderAt( '/transcriber/jobs/abc' )

    expect( screen.getByText( 'a job' ) ).toBeInTheDocument()
  } )

  it( 'shows every module to the admin', () => {
    signedInAs( meFixture() )
    renderAt( '/melete' )

    expect( screen.getByText( 'melete home' ) ).toBeInTheDocument()
  } )

  it( 'sends a Melete-only member from a Transcriber page to Melete', () => {
    signedInAs( memberFixture( { modules: [ 'melete' ] } ) )
    const { pathname } = renderAt( '/transcriber/jobs/abc' )

    expect( pathname() ).toBe( '/melete' )
    expect( screen.getByText( 'melete home' ) ).toBeInTheDocument()
  } )

  it( 'sends a Transcriber-only member from Melete to the home page', () => {
    signedInAs( memberFixture( { modules: [ 'transcriber' ] } ) )
    const { pathname } = renderAt( '/melete' )

    expect( pathname() ).toBe( '/transcriber' )
    expect( screen.getByText( 'transcriber home' ) ).toBeInTheDocument()
  } )
} )
