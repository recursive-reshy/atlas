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
import { usePromptProfiles } from '#src/hooks/usePromptProfiles'
import { useGmailSources } from '#src/features/gmail/hooks/useGmailSources'
import { profilesState } from '#src/test-support/hookStates'
import { SOURCE_ID, gmailSourceFixture } from '#src/features/gmail/fixtures/gmail.fixture'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { GmailSources } from './GmailSources'

vi.mock( '#src/features/gmail/hooks/useGmailSources' )
vi.mock( '#src/hooks/usePromptProfiles' )
vi.mock( './GmailDialogs', () => ( {
  GmailDialogs: ( { dialog }: { dialog: { kind: string } | null } ) => (
    <p>{ `Dialog: ${ dialog?.kind ?? 'none' }` }</p>
  ),
} ) )

const mockedSources = vi.mocked( useGmailSources )

type State = ReturnType< typeof useGmailSources >

const state = ( overrides: Partial< State > = {} ): State => ( {
  sources: [ gmailSourceFixture() ],
  isLoading: false,
  error: null,
  updatedAt: Date.parse( '2026-10-20T10:00:00.000Z' ),
  createSource: mutationStub(),
  updateSource: mutationStub(),
  deleteSource: mutationStub(),
  checkSource: mutationStub(),
  checkAllSources: mutationStub(),
  ...overrides,
} )

beforeEach( () => {
  mockedSources.mockReturnValue( state() )
  vi.mocked( usePromptProfiles ).mockReturnValue( profilesState() )
} )

describe( 'GmailSources', () => {
  it( 'has a Sources heading and lists the sources', () => {
    renderWithClient( <GmailSources connected /> )

    expect( screen.getByRole( 'heading', { level: 4, name: 'Sources' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'list', { name: 'Gmail sources' } ) ).toBeInTheDocument()
    expect( screen.getByText( 'Checked 1h ago' ) ).toBeInTheDocument()
  } )

  it( 'announces loading, and shows no list while loading', () => {
    mockedSources.mockReturnValue( state( { sources: [], isLoading: true } ) )
    renderWithClient( <GmailSources connected /> )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading sources…' )
    expect( screen.queryByText( 'No sources yet.' ) ).not.toBeInTheDocument()
  } )

  it( 'shows a load error', () => {
    mockedSources.mockReturnValue( state( { sources: [], error: 'Could not reach the server' } ) )
    renderWithClient( <GmailSources connected /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
  } )

  it( 'says there are no sources yet', () => {
    mockedSources.mockReturnValue( state( { sources: [] } ) )
    renderWithClient( <GmailSources connected /> )

    expect( screen.getByText( 'No sources yet.' ) ).toBeInTheDocument()
  } )

  it( 'turns a source off through the hook', async () => {
    const mutate = vi.fn()
    mockedSources.mockReturnValue( state( { updateSource: mutationStub( { mutate } ) } ) )
    renderWithClient( <GmailSources connected /> )

    await userEvent.click( screen.getByRole( 'switch', { name: 'On' } ) )

    expect( mutate ).toHaveBeenCalledWith( { id: SOURCE_ID, body: { enabled: false } } )
  } )

  it( 'checks one source from its menu', async () => {
    const mutate = vi.fn()
    mockedSources.mockReturnValue( state( { checkSource: mutationStub( { mutate } ) } ) )
    renderWithClient( <GmailSources connected /> )

    await userEvent.click( screen.getByRole( 'button', { name: 'Newsletters actions' } ) )
    await userEvent.click( screen.getByRole( 'menuitem', { name: 'Check now' } ) )

    expect( mutate ).toHaveBeenCalledWith( SOURCE_ID )
  } )

  it( 'shows Checking… on the source being checked', () => {
    mockedSources.mockReturnValue( state( {
      checkSource: mutationStub( { isPending: true, variables: SOURCE_ID } as never ),
    } ) )
    renderWithClient( <GmailSources connected /> )

    expect( screen.getByText( 'Checking…' ) ).toBeInTheDocument()
  } )

  it( 'checks every source from Check all now', async () => {
    const mutate = vi.fn()
    mockedSources.mockReturnValue( state( { checkAllSources: mutationStub( { mutate } ) } ) )
    renderWithClient( <GmailSources connected /> )

    await userEvent.click( screen.getByRole( 'button', { name: 'Check all now' } ) )

    expect( mutate ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'disables Check all now and says Checking… while it runs', () => {
    mockedSources.mockReturnValue( state( {
      checkAllSources: mutationStub( { isPending: true } ),
    } ) )
    renderWithClient( <GmailSources connected /> )

    expect( screen.getByRole( 'button', { name: 'Checking…' } ) ).toBeDisabled()
  } )

  it( 'shows the error of a failed change', () => {
    mockedSources.mockReturnValue( state( {
      updateSource: mutationStub( { isError: true, error: new Error( 'Gmail source not found' ) } ),
    } ) )
    renderWithClient( <GmailSources connected /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Gmail source not found' )
  } )

  it( 'shows the error of a failed check', () => {
    mockedSources.mockReturnValue( state( {
      checkAllSources: mutationStub( {
        isError: true,
        error: new Error( 'Google no longer accepts access' ),
      } ),
    } ) )
    renderWithClient( <GmailSources connected /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Google no longer accepts access' )
  } )

  describe( 'dialogs', () => {
    it( 'opens none to start with', () => {
      renderWithClient( <GmailSources connected /> )

      expect( screen.getByText( 'Dialog: none' ) ).toBeInTheDocument()
    } )

    it( 'opens the add dialog from Add source', async () => {
      renderWithClient( <GmailSources connected /> )

      await userEvent.click( screen.getByRole( 'button', { name: 'Add source' } ) )

      expect( screen.getByText( 'Dialog: add' ) ).toBeInTheDocument()
    } )

    it( 'opens the edit and delete dialogs from a source\'s menu', async () => {
      renderWithClient( <GmailSources connected /> )

      await userEvent.click( screen.getByRole( 'button', { name: 'Newsletters actions' } ) )
      await userEvent.click( screen.getByRole( 'menuitem', { name: 'Edit' } ) )

      expect( screen.getByText( 'Dialog: edit' ) ).toBeInTheDocument()

      await userEvent.click( screen.getByRole( 'button', { name: 'Newsletters actions' } ) )
      await userEvent.click( screen.getByRole( 'menuitem', { name: 'Delete' } ) )

      expect( screen.getByText( 'Dialog: delete' ) ).toBeInTheDocument()
    } )
  } )

  describe( 'while Gmail is not connected', () => {
    it( 'says sources need a connection and holds back the actions', () => {
      renderWithClient( <GmailSources connected={ false } /> )

      expect( screen.getByText( /Connect Gmail to add or change sources/ ) ).toBeInTheDocument()
      expect( screen.getByRole( 'button', { name: 'Check all now' } ) ).toBeDisabled()
      expect( screen.getByRole( 'button', { name: 'Add source' } ) ).toBeDisabled()
      expect( screen.getByRole( 'switch', { name: 'On' } ) ).toBeDisabled()
    } )

    it( 'still lists the sources that were kept', () => {
      renderWithClient( <GmailSources connected={ false } /> )

      expect( screen.getByRole( 'list', { name: 'Gmail sources' } ) ).toBeInTheDocument()
    } )
  } )

  it( 'does not show the connection hint when connected', () => {
    renderWithClient( <GmailSources connected /> )

    expect( screen.queryByText( /Connect Gmail to add/ ) ).not.toBeInTheDocument()
  } )
} )
