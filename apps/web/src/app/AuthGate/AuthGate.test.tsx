// React
import type { ReactElement } from 'react'
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
import { AuthGate } from './AuthGate'

vi.mock( '../useMe' )
vi.mock( '../SignIn', () => ( { SignIn: () => <p>sign in screen</p> } ) )
vi.mock( '#src/features/vault/components/ChooseVault', () => ( {
  ChooseVault: ( { missingVault = null }: { missingVault?: string | null } ) => (
    <p>choose vault screen{ missingVault === null ? '' : ` (missing: ${ missingVault })` }</p>
  ),
} ) )
vi.mock( '../NoModules', () => ( { NoModules: () => <p>no modules screen</p> } ) )

const renderGate = (): void => {
  const router = createMemoryRouter( [ {
    path: '/',
    element: <AuthGate />,
    children: [ { index: true, element: <p>the app</p> } ],
  } ] )
  const ui: ReactElement = (
    <ThemeProvider theme={ theme } defaultMode="system" noSsr>
      <QueryClientProvider client={ createQueryClient() }>
        <RouterProvider router={ router } />
      </QueryClientProvider>
    </ThemeProvider>
  )

  render( ui )
}

const state = (
  me: ReturnType<typeof useMe>[ 'me' ],
  overrides: Partial< ReturnType<typeof useMe> > = {},
): void => {
  vi.mocked( useMe ).mockReturnValue( { me, isLoading: false, error: null, ...overrides } )
}

beforeEach( () => {
  vi.mocked( useMe ).mockReset()
} )

describe( 'AuthGate', () => {
  it( 'announces loading and shows nothing else', () => {
    state( null, { isLoading: true } )
    renderGate()

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading…' )
    expect( screen.queryByText( 'the app' ) ).not.toBeInTheDocument()
  } )

  it( 'shows the error when it cannot find out who is signed in', () => {
    state( null, { error: 'Could not reach the server' } )
    renderGate()

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
  } )

  it( 'shows sign-in to a signed-out visitor', () => {
    state( null )
    renderGate()

    expect( screen.getByText( 'sign in screen' ) ).toBeInTheDocument()
    expect( screen.queryByText( 'the app' ) ).not.toBeInTheDocument()
  } )

  it( 'asks for a vault before anything else', () => {
    state( memberFixture( { vault_dir: null } ) )
    renderGate()

    expect( screen.getByText( 'choose vault screen' ) ).toBeInTheDocument()
    expect( screen.queryByText( 'the app' ) ).not.toBeInTheDocument()
  } )

  it( 'asks for a vault again when the folder is missing, naming it', () => {
    state( memberFixture( { vault_dir: 'gone', vault_missing: true } ) )
    renderGate()

    expect( screen.getByText( 'choose vault screen (missing: gone)' ) ).toBeInTheDocument()
    expect( screen.queryByText( 'the app' ) ).not.toBeInTheDocument()
  } )

  it( 'asks the admin for a vault again too', () => {
    state( meFixture( { vault_dir: 'gone', vault_missing: true } ) )
    renderGate()

    expect( screen.getByText( /choose vault screen/ ) ).toBeInTheDocument()
  } )

  it( 'lets a user with a vault that is there into the app', () => {
    state( memberFixture( { vault_dir: 'brother', vault_missing: false } ) )
    renderGate()

    expect( screen.getByText( 'the app' ) ).toBeInTheDocument()
  } )

  it( 'asks for the vault before telling a member they have no modules', () => {
    state( memberFixture( { vault_dir: null, modules: [] } ) )
    renderGate()

    expect( screen.getByText( 'choose vault screen' ) ).toBeInTheDocument()
  } )

  it( 'tells a member with no modules', () => {
    state( memberFixture( { modules: [] } ) )
    renderGate()

    expect( screen.getByText( 'no modules screen' ) ).toBeInTheDocument()
    expect( screen.queryByText( 'the app' ) ).not.toBeInTheDocument()
  } )

  it( 'shows the app to a member with a module', () => {
    state( memberFixture() )
    renderGate()

    expect( screen.getByText( 'the app' ) ).toBeInTheDocument()
  } )

  it( 'shows the app to the admin', () => {
    state( meFixture() )
    renderGate()

    expect( screen.getByText( 'the app' ) ).toBeInTheDocument()
  } )
} )
