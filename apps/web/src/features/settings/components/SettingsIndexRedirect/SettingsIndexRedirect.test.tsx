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
import { useSettings } from '#src/features/settings/hooks/useSettings'
import { settingsState } from '#src/test-support/hookStates'
import { memberFixture } from '#src/test-support/me.fixture'
import { renderWithRouter } from '#src/test-support/renderWithRouter'

vi.mock( '#src/features/gmail/api/gmail.api' )
vi.mock( '#src/features/settings/hooks/useSettings' )
vi.mock( '../PromptsTab', () => ( { PromptsTab: () => <p>prompts content</p> } ) )
vi.mock( '../SourcesTab', () => ( { SourcesTab: () => <p>sources content</p> } ) )

beforeEach( () => {
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
} )

describe( 'SettingsIndexRedirect', () => {
  it( 'sends the admin to Prompts', () => {
    const { location } = renderWithRouter( '/settings' )

    expect( location().pathname ).toBe( '/settings/prompts' )
  } )

  it( 'sends the Gmail return to Sources for a user with Transcriber', () => {
    const me = memberFixture( { modules: [ 'transcriber' ] } )
    const { location } = renderWithRouter( '/settings?gmail=connected', { me } )

    expect( location().pathname ).toBe( '/settings/sources' )
    expect( location().search ).toBe( '?gmail=connected' )
    expect( screen.getByText( 'sources content' ) ).toBeInTheDocument()
  } )

  it( 'keeps the Gmail return off Sources for a Melete-only member', () => {
    const me = memberFixture( { modules: [ 'melete' ] } )
    const { location } = renderWithRouter( '/settings?gmail=connected', { me } )

    expect( location().pathname ).toBe( '/settings/prompts' )
    expect( screen.queryByText( 'sources content' ) ).not.toBeInTheDocument()
  } )
} )
