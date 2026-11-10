// Testing Library
import { screen, within } from '@testing-library/react'
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
import { usePromptVersions } from '#src/features/settings/hooks/usePromptVersions'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { BUSINESS_ID, versionFixture } from '#src/features/jobs/fixtures/summarizer.fixture'
import { PromptHistory } from './PromptHistory'

vi.mock( '#src/features/settings/hooks/usePromptVersions' )

const mockedVersions = vi.mocked( usePromptVersions )

const versions = [
  versionFixture( { id: 12, version: 3, source: 'restore', guidance: 'Line one.\nLine two.' } ),
  versionFixture( { id: 11, version: 2, source: 'edit', guidance: 'Second text.\nMore.' } ),
  versionFixture( { id: 10, version: 1, source: 'seed', guidance: 'First text.' } ),
]

const base = {
  profileId: BUSINESS_ID,
  currentVersionId: 12,
  isRestoring: false,
  error: null,
  onRestore: vi.fn(),
}

const row = ( name: RegExp ): HTMLElement => screen.getByRole( 'button', { name } )

beforeEach( () => {
  mockedVersions.mockReturnValue( { versions, isLoading: false, error: null } )
} )

describe( 'PromptHistory, listing', () => {
  it( 'asks for the versions of the profile', () => {
    renderWithClient( <PromptHistory { ...base } /> )

    expect( mockedVersions ).toHaveBeenCalledWith( BUSINESS_ID )
  } )

  it( 'lists versions newest first with number, source, date and first line', () => {
    renderWithClient( <PromptHistory { ...base } /> )

    const items = screen.getAllByRole( 'button', { name: /^v\d/ } )

    expect( items.map( ( item ) => item.textContent ) ).toEqual( [
      expect.stringMatching( /^v3.*Restore.*\d{1,2} \w{3} 2026.*Line one\.$/ ) as string,
      expect.stringMatching( /^v2.*Edit.*\d{1,2} \w{3} 2026.*Second text\.$/ ) as string,
      expect.stringMatching( /^v1.*Shipped default.*\d{1,2} \w{3} 2026.*First text\.$/ ) as string,
    ] )
  } )

  it( 'marks the current version in text', () => {
    renderWithClient( <PromptHistory { ...base } /> )

    expect( within( row( /^v3/ ) ).getByText( 'current' ) ).toBeInTheDocument()
    expect( within( row( /^v2/ ) ).queryByText( 'current' ) ).not.toBeInTheDocument()
  } )

  it( 'announces loading', () => {
    mockedVersions.mockReturnValue( { versions: [], isLoading: true, error: null } )
    renderWithClient( <PromptHistory { ...base } /> )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading history…' )
  } )

  it( 'shows a load error', () => {
    mockedVersions.mockReturnValue(
      { versions: [], isLoading: false, error: 'Prompt profile not found' },
    )
    renderWithClient( <PromptHistory { ...base } /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Prompt profile not found' )
  } )
} )

describe( 'PromptHistory, viewing and restoring', () => {
  it( 'shows nothing selected at first', () => {
    renderWithClient( <PromptHistory { ...base } /> )

    expect( screen.queryByRole( 'textbox' ) ).not.toBeInTheDocument()
  } )

  it( 'shows the whole text of a version read-only when chosen', async () => {
    const user = userEvent.setup()
    renderWithClient( <PromptHistory { ...base } /> )

    await user.click( row( /^v2/ ) )

    const field = screen.getByRole( 'textbox', { name: 'Version 2' } )
    expect( field ).toHaveValue( 'Second text.\nMore.' )
    expect( field ).toHaveAttribute( 'readonly' )
  } )

  it( 'offers to restore an older version and reports which one', async () => {
    const user = userEvent.setup()
    const onRestore = vi.fn()
    renderWithClient( <PromptHistory { ...base } onRestore={ onRestore } /> )

    await user.click( row( /^v2/ ) )
    await user.click( screen.getByRole( 'button', { name: 'Restore this version' } ) )

    expect( onRestore ).toHaveBeenCalledExactlyOnceWith( 11 )
  } )

  it( 'does not offer to restore the current version', async () => {
    const user = userEvent.setup()
    renderWithClient( <PromptHistory { ...base } /> )

    await user.click( row( /^v3/ ) )

    expect( screen.getByRole( 'textbox', { name: 'Version 3' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'button', { name: 'Restore this version' } ) )
      .not.toBeInTheDocument()
  } )

  it( 'disables Restore while restoring', async () => {
    const user = userEvent.setup()
    renderWithClient( <PromptHistory { ...base } isRestoring /> )

    await user.click( row( /^v1/ ) )

    expect( screen.getByRole( 'button', { name: 'Restore this version' } ) ).toBeDisabled()
  } )

  it( 'shows a restore error', async () => {
    const user = userEvent.setup()
    renderWithClient( <PromptHistory { ...base } error="Prompt version not found" /> )

    await user.click( row( /^v1/ ) )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Prompt version not found' )
  } )
} )
