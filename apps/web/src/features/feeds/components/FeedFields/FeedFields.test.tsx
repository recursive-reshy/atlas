// Testing Library
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import { CODING_ID, profilesFixture } from '#src/features/jobs/fixtures/summarizer.fixture'
import { FeedFields } from './FeedFields'

const setup = ( overrides: Partial< Parameters< typeof FeedFields >[ 0 ] > = {} ) => {
  const handlers = {
    onNameChange: vi.fn(),
    onProfileChange: vi.fn(),
    onAutoSummarizeChange: vi.fn(),
  }

  renderWithClient(
    <FeedFields
      name="Example Blog"
      profileId=""
      autoSummarize={ false }
      profiles={ profilesFixture() }
      { ...handlers }
      { ...overrides }
    />,
  )

  return handlers
}

describe( 'FeedFields', () => {
  it( 'shows the name, the default profile and the unticked automatic option', () => {
    setup()

    expect( screen.getByRole( 'textbox', { name: 'Name' } ) ).toHaveValue( 'Example Blog' )
    expect( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
      .toHaveTextContent( 'Default profile' )
    expect( screen.getByRole( 'checkbox', { name: 'Summarize automatically' } ) )
      .not.toBeChecked()
  } )

  it( 'shows a chosen profile by name', () => {
    setup( { profileId: CODING_ID } )

    expect( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
      .toHaveTextContent( 'Coding' )
  } )

  it( 'lists Default profile first, then the profiles', async () => {
    const user = userEvent.setup()
    setup()

    await user.click( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
    const options = within( screen.getByRole( 'listbox' ) ).getAllByRole( 'option' )

    expect( options.map( ( option ) => option.textContent ) ).toEqual( [
      'Default profile',
      'Business ideas',
      'Coding',
      'General',
    ] )
  } )

  it( 'reports a new name, profile and automatic choice', async () => {
    const user = userEvent.setup()
    const handlers = setup( { name: '' } )

    await user.type( screen.getByRole( 'textbox', { name: 'Name' } ), 'N' )
    expect( handlers.onNameChange ).toHaveBeenCalledWith( 'N' )

    await user.click( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
    await user.click( screen.getByRole( 'option', { name: 'Coding' } ) )
    expect( handlers.onProfileChange ).toHaveBeenCalledWith( CODING_ID )

    await user.click( screen.getByRole( 'checkbox', { name: 'Summarize automatically' } ) )
    expect( handlers.onAutoSummarizeChange ).toHaveBeenCalledWith( true )
  } )

  it( 'reports the default profile as an empty id', async () => {
    const user = userEvent.setup()
    const handlers = setup( { profileId: CODING_ID } )

    await user.click( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
    await user.click( screen.getByRole( 'option', { name: 'Default profile' } ) )

    expect( handlers.onProfileChange ).toHaveBeenCalledWith( '' )
  } )
} )
