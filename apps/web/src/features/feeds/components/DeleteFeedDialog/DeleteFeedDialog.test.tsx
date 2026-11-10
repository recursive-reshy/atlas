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
import { feedFixture } from '#src/features/feeds/fixtures/feed.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { DeleteFeedDialog } from './DeleteFeedDialog'

const setup = ( overrides: Partial< Parameters< typeof DeleteFeedDialog >[ 0 ] > = {} ) => {
  const user = userEvent.setup()
  const handlers = { onConfirm: vi.fn(), onCancel: vi.fn() }

  renderWithClient(
    <DeleteFeedDialog
      feed={ feedFixture() }
      isDeleting={ false }
      error={ null }
      { ...handlers }
      { ...overrides }
    />,
  )

  return { user, ...handlers }
}

describe( 'DeleteFeedDialog', () => {
  it( 'names the feed and says its jobs and notes stay', () => {
    setup()

    expect( screen.getByRole( 'dialog', { name: 'Delete feed' } ) ).toBeInTheDocument()
    expect( screen.getByText( /Example Blog/ ) ).toBeInTheDocument()
    expect( screen.getByText( /jobs and notes stay/ ) ).toBeInTheDocument()
  } )

  it( 'leaves out the checkbox when the inbox has none of its items', () => {
    setup()

    expect( screen.queryByRole( 'checkbox' ) ).not.toBeInTheDocument()
  } )

  it( 'deletes and keeps the inbox items by default', async () => {
    const { user, onConfirm } = setup( { feed: feedFixture( { inbox_count: 3 } ) } )

    await user.click( screen.getByRole( 'button', { name: 'Delete' } ) )

    expect( onConfirm ).toHaveBeenCalledWith( false )
  } )

  it( 'offers to remove the inbox items too', async () => {
    const { user, onConfirm } = setup( { feed: feedFixture( { inbox_count: 3 } ) } )

    await user.click( screen.getByRole( 'checkbox', {
      name: 'Also remove its 3 items from the inbox',
    } ) )
    await user.click( screen.getByRole( 'button', { name: 'Delete' } ) )

    expect( onConfirm ).toHaveBeenCalledWith( true )
  } )

  it( 'says "1 item" for a single inbox item', () => {
    setup( { feed: feedFixture( { inbox_count: 1 } ) } )

    expect( screen.getByRole( 'checkbox', { name: 'Also remove its 1 item from the inbox' } ) )
      .toBeInTheDocument()
  } )

  it( 'does nothing on Cancel', async () => {
    const { user, onConfirm, onCancel } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( onCancel ).toHaveBeenCalledTimes( 1 )
    expect( onConfirm ).not.toHaveBeenCalled()
  } )

  it( 'shows the error and Deleting… while deleting', () => {
    setup( { error: 'Feed not found', isDeleting: true } )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Feed not found' )
    expect( screen.getByRole( 'button', { name: 'Deleting…' } ) ).toBeDisabled()
  } )
} )
