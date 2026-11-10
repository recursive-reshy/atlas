// Testing Library
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { feedFixture } from '#src/test-support/feed.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { CODING_ID, profilesFixture } from '#src/features/jobs/fixtures/summarizer.fixture'
import { EditFeedDialog } from './EditFeedDialog'

const setup = ( overrides: Partial< Parameters< typeof EditFeedDialog >[ 0 ] > = {} ) => {
  const user = userEvent.setup()
  const handlers = { onSubmit: vi.fn(), onCancel: vi.fn() }

  renderWithClient(
    <EditFeedDialog
      feed={ feedFixture() }
      profiles={ profilesFixture() }
      isSubmitting={ false }
      error={ null }
      { ...handlers }
      { ...overrides }
    />,
  )

  return { user, ...handlers }
}

describe( 'EditFeedDialog', () => {
  it( 'shows the feed\'s current settings', () => {
    setup( { feed: feedFixture( { profile_id: CODING_ID, auto_summarize: true } ) } )

    expect( screen.getByRole( 'dialog', { name: 'Edit feed' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'textbox', { name: 'Name' } ) ).toHaveValue( 'Example Blog' )
    expect( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
      .toHaveTextContent( 'Coding' )
    expect( screen.getByRole( 'checkbox', { name: 'Summarize automatically' } ) ).toBeChecked()
  } )

  it( 'shows the default profile for a feed with none, or whose profile is gone', () => {
    setup( { feed: feedFixture( { profile_id: '2c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f' } ) } )

    expect( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
      .toHaveTextContent( 'Default profile' )
  } )

  it( 'cannot save until something changes', () => {
    setup()

    expect( screen.getByRole( 'button', { name: 'Save' } ) ).toBeDisabled()
  } )

  it( 'saves only what changed', async () => {
    const { user, onSubmit } = setup()

    await user.clear( screen.getByRole( 'textbox', { name: 'Name' } ) )
    await user.type( screen.getByRole( 'textbox', { name: 'Name' } ), 'Renamed' )
    await user.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( onSubmit ).toHaveBeenCalledWith( { name: 'Renamed' } )
  } )

  it( 'saves a new profile and the automatic choice', async () => {
    const { user, onSubmit } = setup()

    await user.click( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
    await user.click( screen.getByRole( 'option', { name: 'Coding' } ) )
    await user.click( screen.getByRole( 'checkbox', { name: 'Summarize automatically' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( onSubmit ).toHaveBeenCalledWith( { profile_id: CODING_ID, auto_summarize: true } )
  } )

  it( 'clears the profile back to the default with null', async () => {
    const { user, onSubmit } = setup( { feed: feedFixture( { profile_id: CODING_ID } ) } )

    await user.click( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
    await user.click( screen.getByRole( 'option', { name: 'Default profile' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( onSubmit ).toHaveBeenCalledWith( { profile_id: null } )
  } )

  it( 'will not save an empty name', async () => {
    const { user } = setup()

    await user.clear( screen.getByRole( 'textbox', { name: 'Name' } ) )

    expect( screen.getByRole( 'button', { name: 'Save' } ) ).toBeDisabled()
  } )

  it( 'shows the error and Saving… while saving', async () => {
    const { user } = setup( { error: 'Feed not found', isSubmitting: true } )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Feed not found' )
    await user.type( screen.getByRole( 'textbox', { name: 'Name' } ), 'x' )
    expect( screen.getByRole( 'button', { name: 'Saving…' } ) ).toBeDisabled()
  } )

  it( 'cancels', async () => {
    const { user, onCancel } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( onCancel ).toHaveBeenCalledTimes( 1 )
  } )
} )
