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
import { gmailSourceFixture } from '#src/features/gmail/fixtures/gmail.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { DeleteGmailSourceDialog } from './DeleteGmailSourceDialog'

const setup = (
  source = gmailSourceFixture( { inbox_count: 3 } ),
  overrides: Partial< Parameters< typeof DeleteGmailSourceDialog >[ 0 ] > = {},
) => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()

  renderWithClient(
    <DeleteGmailSourceDialog
      source={ source }
      isDeleting={ false }
      error={ null }
      onConfirm={ onConfirm }
      onCancel={ onCancel }
      { ...overrides }
    />,
  )

  return { onConfirm, onCancel }
}

describe( 'DeleteGmailSourceDialog', () => {
  it( 'names the source and says what stays', () => {
    setup()

    expect( screen.getByRole( 'dialog', { name: 'Delete Gmail source' } ) ).toBeInTheDocument()
    expect( screen.getByText( /Delete "Newsletters"\? It stops being checked/ ) )
      .toBeInTheDocument()
  } )

  it( 'keeps the inbox items unless asked', async () => {
    const { onConfirm } = setup()

    await userEvent.click( screen.getByRole( 'button', { name: 'Delete' } ) )

    expect( onConfirm ).toHaveBeenCalledWith( false )
  } )

  it( 'offers to remove the inbox items, with their count', async () => {
    const { onConfirm } = setup()

    await userEvent.click(
      screen.getByRole( 'checkbox', { name: 'Also remove its 3 items from the inbox' } ),
    )
    await userEvent.click( screen.getByRole( 'button', { name: 'Delete' } ) )

    expect( onConfirm ).toHaveBeenCalledWith( true )
  } )

  it( 'says "1 item" for one', () => {
    setup( gmailSourceFixture( { inbox_count: 1 } ) )

    expect( screen.getByRole( 'checkbox', { name: 'Also remove its 1 item from the inbox' } ) )
      .toBeInTheDocument()
  } )

  it( 'offers nothing to remove when the inbox has none of its items', () => {
    setup( gmailSourceFixture( { inbox_count: 0 } ) )

    expect( screen.queryByRole( 'checkbox' ) ).not.toBeInTheDocument()
  } )

  it( 'says a jobs source keeps its collected jobs', () => {
    setup( gmailSourceFixture( { destination: 'jobs', postings_count: 5 } ) )

    expect( screen.getByText( /collected jobs stay/ ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'checkbox' ) ).not.toBeInTheDocument()
  } )

  it( 'cancels', async () => {
    const { onCancel } = setup()

    await userEvent.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( onCancel ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'shows Deleting… while it runs, and why it failed', () => {
    setup( gmailSourceFixture(), { isDeleting: true, error: 'Gmail source not found' } )

    expect( screen.getByRole( 'button', { name: 'Deleting…' } ) ).toBeDisabled()
    expect( screen.getByText( 'Gmail source not found' ) ).toBeInTheDocument()
  } )
} )
