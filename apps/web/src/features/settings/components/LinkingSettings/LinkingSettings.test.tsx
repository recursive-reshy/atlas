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
import { useModels } from '#src/features/settings/hooks/useModels'
import { useSettings } from '#src/features/settings/hooks/useSettings'
import { modelsState, settingsState } from '#src/test-support/hookStates'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { settingsFixture } from '#src/features/jobs/fixtures/summarizer.fixture'
import { LinkingSettings } from './LinkingSettings'

vi.mock( '#src/features/settings/hooks/useSettings' )
vi.mock( '#src/features/settings/hooks/useModels' )

const modelPicker = (): HTMLElement => screen.getByRole( 'combobox', { name: 'Linking model' } )

beforeEach( () => {
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
  vi.mocked( useModels ).mockReturnValue( modelsState() )
} )

describe( 'LinkingSettings agent status', () => {
  it.each( [ 'ok', 'unavailable', 'not_configured' ] as const )(
    'says nothing about the agent service when it is %s (the Status panel does)',
    ( agentStatus ) => {
      vi.mocked( useSettings ).mockReturnValue( settingsState( { agentStatus } ) )
      renderWithClient( <LinkingSettings /> )

      expect( screen.queryByText( /agent service/i ) ).not.toBeInTheDocument()
      expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument()
    },
  )
} )

describe( 'LinkingSettings switch', () => {
  it( 'is on when linking is enabled', () => {
    renderWithClient( <LinkingSettings /> )

    expect( screen.getByRole( 'switch', { name: 'Link notes automatically' } ) ).toBeChecked()
  } )

  it( 'is off when linking is disabled', () => {
    vi.mocked( useSettings ).mockReturnValue( settingsState( {
      settings: settingsFixture( { linking_enabled: false } ).settings,
    } ) )
    renderWithClient( <LinkingSettings /> )

    expect( screen.getByRole( 'switch', { name: 'Link notes automatically' } ) ).not.toBeChecked()
  } )

  it( 'saves the change at once, sending only that key', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    vi.mocked( useSettings ).mockReturnValue(
      settingsState( { updateSettings: mutationStub( { mutate } ) } ),
    )
    renderWithClient( <LinkingSettings /> )

    await user.click( screen.getByRole( 'switch', { name: 'Link notes automatically' } ) )

    expect( mutate ).toHaveBeenCalledExactlyOnceWith( { linking_enabled: false } )
  } )
} )

describe( 'LinkingSettings model', () => {
  it( 'shows the linking model by its display name', () => {
    vi.mocked( useModels ).mockReturnValue( modelsState( {
      models: [
        { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' },
        { id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5' },
      ],
    } ) )
    renderWithClient( <LinkingSettings /> )

    expect( modelPicker() ).toHaveTextContent( 'Claude Haiku 5.5' )
  } )

  it( 'saves a new model at once, sending only the model', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    vi.mocked( useSettings ).mockReturnValue(
      settingsState( { updateSettings: mutationStub( { mutate } ) } ),
    )
    renderWithClient( <LinkingSettings /> )

    await user.click( modelPicker() )
    await user.click( within( screen.getByRole( 'listbox' ) )
      .getByRole( 'option', { name: 'Claude Opus 5.5' } ) )

    expect( mutate ).toHaveBeenCalledExactlyOnceWith( { linking_model: 'claude-opus-5-5' } )
  } )

  it( 'keeps a model that is not in the list visible', async () => {
    const user = userEvent.setup()
    renderWithClient( <LinkingSettings /> )

    await user.click( modelPicker() )

    const listbox = within( screen.getByRole( 'listbox' ) )

    expect( listbox.getByRole( 'option', { name: 'claude-haiku-5-5' } ) ).toBeInTheDocument()
  } )

  it( 'says the model list is offline', () => {
    vi.mocked( useModels ).mockReturnValue( modelsState( { source: 'fallback' } ) )
    renderWithClient( <LinkingSettings /> )

    expect( screen.getByText( /model list is offline/ ) ).toBeInTheDocument()
  } )

  it( 'says Saved after a successful save and shows the error of a failed one', () => {
    vi.mocked( useSettings ).mockReturnValue(
      settingsState( { updateSettings: mutationStub( { isSuccess: true } ) } ),
    )
    const { unmount } = renderWithClient( <LinkingSettings /> )

    expect( screen.getByText( 'Saved' ) ).toBeInTheDocument()

    unmount()
    vi.mocked( useSettings ).mockReturnValue( settingsState( {
      updateSettings: mutationStub( { isError: true, error: new Error( 'Unknown model: x' ) } ),
    } ) )
    renderWithClient( <LinkingSettings /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Unknown model: x' )
    expect( screen.queryByText( 'Saved' ) ).not.toBeInTheDocument()
  } )
} )
