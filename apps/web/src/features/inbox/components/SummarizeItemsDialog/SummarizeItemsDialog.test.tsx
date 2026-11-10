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
import { modelsState, profilesState, settingsState } from '#src/test-support/hookStates'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { CODING_ID } from '#src/features/jobs/fixtures/summarizer.fixture'
import { SummarizeItemsDialog } from './SummarizeItemsDialog'

vi.mock( '#src/hooks/useSettings' )
vi.mock( '#src/hooks/useModels' )
vi.mock( '#src/hooks/usePromptProfiles' )

const setup = ( overrides: Partial< Parameters< typeof SummarizeItemsDialog >[ 0 ] > = {} ) => {
  const user = userEvent.setup()
  const handlers = { onSubmit: vi.fn(), onCancel: vi.fn() }

  renderWithClient(
    <SummarizeItemsDialog
      count={ 3 }
      isSubmitting={ false }
      error={ null }
      { ...handlers }
      { ...overrides }
    />,
  )

  return { user, ...handlers }
}

beforeEach( () => {
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
  vi.mocked( useModels ).mockReturnValue( modelsState() )
  vi.mocked( usePromptProfiles ).mockReturnValue( profilesState() )
} )

describe( 'SummarizeItemsDialog', () => {
  it( 'says how many items will become jobs', () => {
    setup()

    expect( screen.getByRole( 'dialog', { name: 'Summarize items' } ) ).toBeInTheDocument()
    expect( screen.getByText( '3 items will become jobs.' ) ).toBeInTheDocument()
  } )

  it( 'says "1 item" for one', () => {
    setup( { count: 1 } )

    expect( screen.getByText( '1 item will become a job.' ) ).toBeInTheDocument()
  } )

  it( 'starts on each feed\'s profile and the default model', () => {
    setup()

    expect( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
      .toHaveTextContent( 'Each feed\'s profile' )
    expect( screen.getByRole( 'combobox', { name: 'Model' } ) )
      .toHaveTextContent( 'Claude Sonnet 5.5' )
  } )

  it( 'lists Each feed\'s profile first, then the profiles', async () => {
    const { user } = setup()

    await user.click( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
    const options = within( screen.getByRole( 'listbox' ) ).getAllByRole( 'option' )

    expect( options.map( ( option ) => option.textContent ) ).toEqual( [
      'Each feed\'s profile',
      'Business ideas',
      'Coding',
      'General',
    ] )
  } )

  it( 'sends no choices when nothing was changed', async () => {
    const { user, onSubmit } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

    expect( onSubmit ).toHaveBeenCalledWith( {} )
  } )

  it( 'sends a chosen profile and a different model', async () => {
    const { user, onSubmit } = setup()

    await user.click( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
    await user.click( screen.getByRole( 'option', { name: 'Coding' } ) )
    await user.click( screen.getByRole( 'combobox', { name: 'Model' } ) )
    await user.click( screen.getByRole( 'option', { name: 'Claude Opus 5.5' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

    expect( onSubmit ).toHaveBeenCalledWith( { profile_id: CODING_ID, model: 'claude-opus-5-5' } )
  } )

  it( 'sends no profile after going back to each feed\'s profile', async () => {
    const { user, onSubmit } = setup()

    await user.click( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
    await user.click( screen.getByRole( 'option', { name: 'Coding' } ) )
    await user.click( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
    await user.click( screen.getByRole( 'option', { name: 'Each feed\'s profile' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

    expect( onSubmit ).toHaveBeenCalledWith( {} )
  } )

  it( 'keeps the error visible and shows Summarizing… while working', () => {
    setup( { error: 'Not in the inbox: abc', isSubmitting: true } )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Not in the inbox: abc' )
    expect( screen.getByRole( 'button', { name: 'Summarizing…' } ) ).toBeDisabled()
  } )

  it( 'cancels', async () => {
    const { user, onCancel } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( onCancel ).toHaveBeenCalledTimes( 1 )
  } )
} )
