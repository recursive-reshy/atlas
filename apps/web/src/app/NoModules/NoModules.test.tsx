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
import { useSignOut } from '../useSignOut'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { NoModules } from './NoModules'

vi.mock( '../useSignOut' )

const mutate = vi.fn()

beforeEach( () => {
  mutate.mockReset()
  vi.mocked( useSignOut ).mockReturnValue( { mutate } as unknown as ReturnType<typeof useSignOut> )
} )

describe( 'NoModules', () => {
  it( 'says nothing is switched on yet', () => {
    renderWithClient( <NoModules /> )

    expect( screen.getByRole( 'heading', { name: 'No modules yet' } ) ).toBeInTheDocument()
    expect( screen.getByText( /hasn't switched on/ ) ).toBeInTheDocument()
  } )

  it( 'lets the user sign out', async () => {
    renderWithClient( <NoModules /> )

    await userEvent.click( screen.getByRole( 'button', { name: 'Sign out' } ) )

    expect( mutate ).toHaveBeenCalledTimes( 1 )
  } )
} )
