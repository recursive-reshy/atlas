// Testing Library
import { screen } from '@testing-library/react'
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
import { meFixture } from '#src/test-support/me.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { SignInPage } from './SignInPage'

vi.mock( '../useMe' )
vi.mock( '../SignIn', () => ( { SignIn: () => <p>sign in screen</p> } ) )

beforeEach( () => {
  vi.mocked( useMe ).mockReset()
} )

describe( 'SignInPage', () => {
  it( 'shows the sign-in screen when nobody is signed in', () => {
    vi.mocked( useMe ).mockReturnValue( { me: null, isLoading: false, error: null } )
    renderWithClient( <SignInPage />, { route: '/signin' } )

    expect( screen.getByText( 'sign in screen' ) ).toBeInTheDocument()
  } )

  it( 'waits while it finds out who is signed in', () => {
    vi.mocked( useMe ).mockReturnValue( { me: null, isLoading: true, error: null } )
    renderWithClient( <SignInPage />, { route: '/signin' } )

    expect( screen.getByRole( 'status' ) ).toBeInTheDocument()
    expect( screen.queryByText( 'sign in screen' ) ).not.toBeInTheDocument()
  } )

  it( 'sends a signed-in user to the home page', () => {
    vi.mocked( useMe ).mockReturnValue( { me: meFixture(), isLoading: false, error: null } )
    const { location } = renderWithClient( <SignInPage />, { route: '/signin' } )

    expect( location().pathname ).toBe( '/' )
  } )
} )
