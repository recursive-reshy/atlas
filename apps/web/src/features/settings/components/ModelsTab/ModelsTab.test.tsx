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
import { useMe } from '#src/app/useMe'
import { meFixture, memberFixture } from '#src/test-support/me.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { ModelsTab } from './ModelsTab'

vi.mock( '#src/app/useMe' )
vi.mock( '../SummarizerDefaults', () => ( { SummarizerDefaults: () => <p>defaults</p> } ) )
vi.mock( '../LinkingSettings', () => ( { LinkingSettings: () => <p>linking</p> } ) )
vi.mock( '#src/components/MeleteSettings', () => (
  { MeleteSettings: () => <p>melete models</p> }
) )

const signedInAs = ( me = meFixture() ): void => {
  vi.mocked( useMe ).mockReturnValue( { me, isLoading: false, error: null } )
}

beforeEach( () => {
  signedInAs()
} )

describe( 'ModelsTab', () => {
  it( 'has the Summarizer, Linking and Melete sections', () => {
    renderWithClient( <ModelsTab /> )

    expect( screen.getByRole( 'heading', { level: 3, name: 'Summarizer' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'heading', { level: 3, name: 'Linking' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'heading', { level: 3, name: 'Melete' } ) ).toBeInTheDocument()
    expect( screen.getByText( 'defaults' ) ).toBeInTheDocument()
    expect( screen.getByText( 'linking' ) ).toBeInTheDocument()
    expect( screen.getByText( 'melete models' ) ).toBeInTheDocument()
  } )

  it( 'has no prompt editors or locked instructions', () => {
    renderWithClient( <ModelsTab /> )

    expect( screen.queryByText( /instructions/i ) ).not.toBeInTheDocument()
    expect( screen.queryByText( /prompt/i ) ).not.toBeInTheDocument()
  } )

  it( 'leaves out Melete for a Transcriber-only member', () => {
    signedInAs( memberFixture( { modules: [ 'transcriber' ] } ) )
    renderWithClient( <ModelsTab /> )

    expect( screen.getByRole( 'heading', { name: 'Summarizer' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'heading', { name: 'Linking' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'heading', { name: 'Melete' } ) ).not.toBeInTheDocument()
    expect( screen.queryByText( 'melete models' ) ).not.toBeInTheDocument()
  } )

  it( 'leaves out Summarizer and Linking for a Melete-only member', () => {
    signedInAs( memberFixture( { modules: [ 'melete' ] } ) )
    renderWithClient( <ModelsTab /> )

    expect( screen.getByRole( 'heading', { name: 'Melete' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'heading', { name: 'Summarizer' } ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'heading', { name: 'Linking' } ) ).not.toBeInTheDocument()
    expect( screen.queryByText( 'defaults' ) ).not.toBeInTheDocument()
  } )
} )
