// Testing Library
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { useSignIn } from '../useSignIn'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { SignIn } from './SignIn'

vi.mock( '../useSignIn' )

const signIn = vi.fn()

beforeEach( () => {
  signIn.mockReset()
  vi.mocked( useSignIn ).mockReturnValue( signIn )
} )

describe( 'SignIn', () => {
  it( 'offers Sign in with Google, which starts the sign-in', async () => {
    renderWithClient( <SignIn /> )

    await userEvent.click( screen.getByRole( 'button', { name: 'Sign in with Google' } ) )

    expect( signIn ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'shows no error when there is none', () => {
    renderWithClient( <SignIn /> )

    expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument()
  } )

  it.each( [
    [ 'not_allowed', 'This Google account is not allowed' ],
    [ 'expired', 'took too long' ],
    [ 'failed', 'Sign-in failed' ],
    [ 'something_else', 'Sign-in failed' ],
  ] )( 'explains ?error=%s', ( code, text ) => {
    renderWithClient( <SignIn />, { route: `/signin?error=${ code }` } )

    expect( screen.getByRole( 'alert' ).textContent ).toContain( text )
  } )
} )
