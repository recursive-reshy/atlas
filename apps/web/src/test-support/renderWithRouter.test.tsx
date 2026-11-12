// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { renderWithRouter } from './renderWithRouter'

vi.mock( '../features/gmail/api/gmail.api' )
vi.mock( '../features/settings/components/SettingsLayout', () => ( {
  SettingsLayout: () => <h2>Settings</h2>,
} ) )

describe( 'renderWithRouter', () => {
  it( 'renders the app routes at the path and reports the location', () => {
    const { location } = renderWithRouter( '/settings?x=1' )

    expect( screen.getByRole( 'heading', { level: 2, name: 'Settings' } ) ).toBeInTheDocument()
    expect( location().pathname ).toBe( '/settings' )
    expect( location().search ).toBe( '?x=1' )
  } )

  it( 'follows redirects', () => {
    const { location } = renderWithRouter( '/nowhere' )

    expect( location().pathname ).toBe( '/transcriber' )
  } )
} )
