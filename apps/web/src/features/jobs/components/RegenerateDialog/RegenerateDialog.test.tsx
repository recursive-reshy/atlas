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
import { useModels } from '#src/features/settings/hooks/useModels'
import { usePromptProfiles } from '#src/features/settings/hooks/usePromptProfiles'
import { useSettings } from '#src/features/settings/hooks/useSettings'
import { modelsState, profilesState, settingsState } from '#src/test-support/hookStates'
import { jobFixture } from '#src/features/jobs/fixtures/job.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { CODING_ID, settingsFixture } from '#src/features/jobs/fixtures/summarizer.fixture'
import { RegenerateDialog } from './RegenerateDialog'

vi.mock( '#src/features/settings/hooks/useSettings' )
vi.mock( '#src/features/settings/hooks/useModels' )
vi.mock( '#src/features/settings/hooks/usePromptProfiles' )

const reviewJob = jobFixture( { status: 'ready_for_review' } )

const base = {
  job: reviewJob,
  isSubmitting: false,
  error: null,
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
}

const profileSelect = (): HTMLElement => screen.getByRole( 'combobox', { name: 'Prompt profile' } )
const modelSelect = (): HTMLElement => screen.getByRole( 'combobox', { name: 'Model' } )

beforeEach( () => {
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
  vi.mocked( useModels ).mockReturnValue( modelsState() )
  vi.mocked( usePromptProfiles ).mockReturnValue( profilesState() )
} )

describe( 'RegenerateDialog, content', () => {
  it( 'is a dialog that warns the note and its edits will be replaced', () => {
    renderWithClient( <RegenerateDialog { ...base } /> )

    expect( screen.getByRole( 'dialog', { name: 'Regenerate summary' } ) ).toBeInTheDocument()
    expect( screen.getByText( /replaces the current note, including any edits/i ) )
      .toBeInTheDocument()
  } )

  it( 'starts on the defaults for a job that has no choices of its own', () => {
    renderWithClient( <RegenerateDialog { ...base } /> )

    expect( profileSelect() ).toHaveTextContent( 'Business ideas' )
    expect( modelSelect() ).toHaveTextContent( 'Claude Sonnet 5.5' )
  } )

  it( 'starts on the profile and model the job used', () => {
    const job = { ...reviewJob, prompt_profile_id: CODING_ID, summary_model: 'claude-opus-5-5' }
    renderWithClient( <RegenerateDialog { ...base } job={ job } /> )

    expect( profileSelect() ).toHaveTextContent( 'Coding' )
    expect( modelSelect() ).toHaveTextContent( 'Claude Opus 5.5' )
  } )

  it( 'starts on the default profile when the job\'s profile has been deleted', () => {
    const job = { ...reviewJob, prompt_profile_id: crypto.randomUUID() }
    renderWithClient( <RegenerateDialog { ...base } job={ job } /> )

    expect( profileSelect() ).toHaveTextContent( 'Business ideas' )
  } )

  it( 'starts on the saved defaults', () => {
    vi.mocked( useSettings ).mockReturnValue( settingsState( {
      settings: settingsFixture( {
        default_model: 'claude-opus-5-5',
        default_profile_id: CODING_ID,
      } ).settings,
    } ) )
    renderWithClient( <RegenerateDialog { ...base } /> )

    expect( profileSelect() ).toHaveTextContent( 'Coding' )
    expect( modelSelect() ).toHaveTextContent( 'Claude Opus 5.5' )
  } )
} )

describe( 'RegenerateDialog, submitting', () => {
  it( 'sends nothing when nothing was changed, so the job keeps its choices', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderWithClient( <RegenerateDialog { ...base } onSubmit={ onSubmit } /> )

    await user.click( screen.getByRole( 'button', { name: 'Regenerate' } ) )

    expect( onSubmit ).toHaveBeenCalledExactlyOnceWith( {} )
  } )

  it( 'sends only the model when only the model was changed', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderWithClient( <RegenerateDialog { ...base } onSubmit={ onSubmit } /> )

    await user.click( modelSelect() )
    await user.click( screen.getByRole( 'option', { name: 'Claude Opus 5.5' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Regenerate' } ) )

    expect( onSubmit ).toHaveBeenCalledExactlyOnceWith( { model: 'claude-opus-5-5' } )
  } )

  it( 'sends both when both were changed', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderWithClient( <RegenerateDialog { ...base } onSubmit={ onSubmit } /> )

    await user.click( profileSelect() )
    await user.click( screen.getByRole( 'option', { name: 'Coding' } ) )
    await user.click( modelSelect() )
    await user.click( screen.getByRole( 'option', { name: 'Claude Opus 5.5' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Regenerate' } ) )

    expect( onSubmit ).toHaveBeenCalledExactlyOnceWith( {
      model: 'claude-opus-5-5',
      profile_id: CODING_ID,
    } )
  } )

  it( 'sends nothing for a choice changed back to where it started', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderWithClient( <RegenerateDialog { ...base } onSubmit={ onSubmit } /> )

    await user.click( modelSelect() )
    await user.click( screen.getByRole( 'option', { name: 'Claude Opus 5.5' } ) )
    await user.click( modelSelect() )
    await user.click( screen.getByRole( 'option', { name: 'Claude Sonnet 5.5' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Regenerate' } ) )

    expect( onSubmit ).toHaveBeenCalledExactlyOnceWith( {} )
  } )

  it( 'cancels without submitting', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    renderWithClient(
      <RegenerateDialog { ...base } onSubmit={ onSubmit } onCancel={ onCancel } />,
    )

    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( onCancel ).toHaveBeenCalledTimes( 1 )
    expect( onSubmit ).not.toHaveBeenCalled()
  } )

  it( 'shows the server message and stays open', () => {
    renderWithClient( <RegenerateDialog { ...base } error="Unknown model: x" /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Unknown model: x' )
    expect( screen.getByRole( 'dialog' ) ).toBeInTheDocument()
  } )

  it( 'disables the button while submitting', () => {
    renderWithClient( <RegenerateDialog { ...base } isSubmitting /> )

    expect( screen.getByRole( 'button', { name: 'Regenerating…' } ) ).toBeDisabled()
  } )
} )
