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
import { memberFixture } from '#src/test-support/me.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { HomeRedirect } from './HomeRedirect'

vi.mock( '../useMe' )

beforeEach( () => {
  vi.mocked( useMe ).mockReset()
} )

describe( 'HomeRedirect', () => {
  it.each( [
    [ [ 'transcriber', 'melete' ] as const, '/' ],
    [ [ 'transcriber' ] as const, '/' ],
    [ [ 'melete' ] as const, '/melete' ],
  ] )( 'sends a user with %s to %s', ( modules, home ) => {
    vi.mocked( useMe ).mockReturnValue(
      { me: memberFixture( { modules: [ ...modules ] } ), isLoading: false, error: null },
    )
    const { location } = renderWithClient( <HomeRedirect />, { route: '/nowhere' } )

    expect( location().pathname ).toBe( home )
    expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument()
  } )
} )
