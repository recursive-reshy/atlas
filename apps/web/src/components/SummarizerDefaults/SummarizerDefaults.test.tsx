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
import { useModels } from '#src/hooks/useModels'
import { usePromptProfiles } from '#src/hooks/usePromptProfiles'
import { useSettings } from '#src/hooks/useSettings'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { mutationStub } from '#src/test-support/mutationStub'
import {
  CODING_ID,
  modelsFixture,
  profilesFixture,
  settingsFixture,
} from '#src/features/jobs/fixtures/summarizer.fixture'
import { SummarizerDefaults } from './SummarizerDefaults'

vi.mock( '#src/hooks/useSettings' )
vi.mock( '#src/hooks/useModels' )
vi.mock( '#src/hooks/usePromptProfiles' )

const mockedSettings = vi.mocked( useSettings )
const mockedModels = vi.mocked( useModels )
const mockedProfiles = vi.mocked( usePromptProfiles )

type SettingsState = ReturnType< typeof useSettings >
type ModelsState = ReturnType< typeof useModels >
type ProfilesState = ReturnType< typeof usePromptProfiles >

const settingsState = ( overrides: Partial< SettingsState > = {} ): SettingsState => ( {
  settings: settingsFixture().settings,
  lockedInstructions: settingsFixture().locked_instructions,
  linkerLockedInstructions: settingsFixture().linker_locked_instructions,
  agentStatus: settingsFixture().agent_status,
  isLoading: false,
  error: null,
  updateSettings: mutationStub(),
  ...overrides,
} )

const modelsState = ( overrides: Partial< ModelsState > = {} ): ModelsState => ( {
  models: modelsFixture().models,
  source: 'api',
  isLoading: false,
  error: null,
  ...overrides,
} )

const profilesState = ( overrides: Partial< ProfilesState > = {} ): ProfilesState => ( {
  profiles: profilesFixture(),
  isLoading: false,
  error: null,
  createProfile: mutationStub(),
  renameProfile: mutationStub(),
  deleteProfile: mutationStub(),
  saveVersion: mutationStub(),
  restoreVersion: mutationStub(),
  resetProfile: mutationStub(),
  ...overrides,
} )

beforeEach( () => {
  mockedSettings.mockReturnValue( settingsState() )
  mockedModels.mockReturnValue( modelsState() )
  mockedProfiles.mockReturnValue( profilesState() )
} )

describe( 'SummarizerDefaults', () => {
  it( 'shows the default model by its display name and the default profile by name', () => {
    renderWithClient( <SummarizerDefaults /> )

    expect( screen.getByRole( 'combobox', { name: 'Default model' } ) )
      .toHaveTextContent( 'Claude Sonnet 5.5' )
    expect( screen.getByRole( 'combobox', { name: 'Default prompt profile' } ) )
      .toHaveTextContent( 'Business ideas' )
  } )

  it( 'lists the models and the profiles as options', async () => {
    const user = userEvent.setup()
    renderWithClient( <SummarizerDefaults /> )

    await user.click( screen.getByRole( 'combobox', { name: 'Default model' } ) )
    const models = within( screen.getByRole( 'listbox' ) ).getAllByRole( 'option' )

    expect( models.map( ( option ) => option.textContent ) )
      .toEqual( [ 'Claude Sonnet 5.5', 'Claude Opus 5.5' ] )
  } )

  it( 'saves a new default model at once, sending only the model', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    mockedSettings.mockReturnValue(
      settingsState( { updateSettings: mutationStub( { mutate } ) } ),
    )
    renderWithClient( <SummarizerDefaults /> )

    await user.click( screen.getByRole( 'combobox', { name: 'Default model' } ) )
    await user.click( screen.getByRole( 'option', { name: 'Claude Opus 5.5' } ) )

    expect( mutate ).toHaveBeenCalledExactlyOnceWith( { default_model: 'claude-opus-5-5' } )
  } )

  it( 'saves a new default profile at once, sending only the profile', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    mockedSettings.mockReturnValue(
      settingsState( { updateSettings: mutationStub( { mutate } ) } ),
    )
    renderWithClient( <SummarizerDefaults /> )

    await user.click( screen.getByRole( 'combobox', { name: 'Default prompt profile' } ) )
    await user.click( screen.getByRole( 'option', { name: 'Coding' } ) )

    expect( mutate ).toHaveBeenCalledExactlyOnceWith( { default_profile_id: CODING_ID } )
  } )

  it( 'says Saved after a successful save', () => {
    mockedSettings.mockReturnValue(
      settingsState( { updateSettings: mutationStub( { isSuccess: true } ) } ),
    )
    renderWithClient( <SummarizerDefaults /> )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Saved' )
  } )

  it( 'says nothing before anything was saved', () => {
    renderWithClient( <SummarizerDefaults /> )

    expect( screen.getByRole( 'status' ) ).toBeEmptyDOMElement()
  } )

  it( 'shows the error of a failed save and not Saved', () => {
    mockedSettings.mockReturnValue( settingsState( {
      updateSettings: mutationStub( { isError: true, error: new Error( 'Unknown model: x' ) } ),
    } ) )
    renderWithClient( <SummarizerDefaults /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Unknown model: x' )
    expect( screen.queryByText( 'Saved' ) ).not.toBeInTheDocument()
  } )

  it( 'says the model list is offline when it fell back', () => {
    mockedModels.mockReturnValue( modelsState( { source: 'fallback' } ) )
    renderWithClient( <SummarizerDefaults /> )

    expect( screen.getByText( /model list is offline/i ) ).toBeInTheDocument()
  } )

  it( 'does not mention offline when the list came from Anthropic', () => {
    renderWithClient( <SummarizerDefaults /> )

    expect( screen.queryByText( /offline/i ) ).not.toBeInTheDocument()
  } )

  it( 'disables both selects while loading', () => {
    mockedSettings.mockReturnValue( settingsState( { settings: null, isLoading: true } ) )
    mockedModels.mockReturnValue( modelsState( { models: [], source: null, isLoading: true } ) )
    renderWithClient( <SummarizerDefaults /> )

    expect( screen.getByRole( 'combobox', { name: 'Default model' } ) )
      .toHaveAttribute( 'aria-disabled', 'true' )
    expect( screen.getByRole( 'combobox', { name: 'Default prompt profile' } ) )
      .toHaveAttribute( 'aria-disabled', 'true' )
  } )

  it( 'still shows a saved default model that is no longer in the list', () => {
    mockedSettings.mockReturnValue(
      settingsState( {
        settings: settingsFixture( { default_model: 'claude-retired-1' } ).settings,
      } ),
    )
    renderWithClient( <SummarizerDefaults /> )

    expect( screen.getByRole( 'combobox', { name: 'Default model' } ) )
      .toHaveTextContent( 'claude-retired-1' )
  } )
} )
