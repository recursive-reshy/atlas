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
import { SOURCE_ID, gmailSourceFixture } from '#src/features/gmail/fixtures/gmail.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { GmailSourceList } from './GmailSourceList'

const NOW = Date.parse( '2026-10-20T10:00:00.000Z' )

const setup = ( overrides: Partial< Parameters< typeof GmailSourceList >[ 0 ] > = {} ) => {
  const onUpdate = vi.fn()
  const onCheck = vi.fn()
  const onEdit = vi.fn()
  const onDelete = vi.fn()

  renderWithClient(
    <GmailSourceList
      sources={ [ gmailSourceFixture() ] }
      now={ NOW }
      checkingId={ null }
      disabled={ false }
      onUpdate={ onUpdate }
      onCheck={ onCheck }
      onEdit={ onEdit }
      onDelete={ onDelete }
      { ...overrides }
    />,
  )

  return {
    onUpdate,
    onCheck,
    onEdit,
    onDelete,
  }
}

describe( 'GmailSourceList', () => {
  it( 'says so when there are no sources', () => {
    setup( { sources: [] } )

    expect( screen.getByText( 'No sources yet.' ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'list', { name: 'Gmail sources' } ) ).not.toBeInTheDocument()
  } )

  it( 'shows a newsletter source\'s name, destination, labels, last check and inbox count', () => {
    setup( { sources: [ gmailSourceFixture( {
      name: 'Substacks',
      label_names: [ 'Newsletters', 'Reading' ],
      inbox_count: 3,
    } ) ] } )

    const row = within( screen.getByRole( 'listitem' ) )

    expect( row.getByText( 'Substacks' ) ).toBeInTheDocument()
    expect( row.getByText( 'Newsletter' ) ).toBeInTheDocument()
    expect( row.getByText( 'Newsletters' ) ).toBeInTheDocument()
    expect( row.getByText( 'Reading' ) ).toBeInTheDocument()
    expect( row.getByText( 'Checked 1h ago' ) ).toBeInTheDocument()
    expect( row.getByText( '3 in inbox' ) ).toBeInTheDocument()
  } )

  it( 'shows a search source\'s query as written', () => {
    setup( { sources: [ gmailSourceFixture( {
      match: { kind: 'query', query: 'from:donotreply@upwork.com' },
      label_names: [],
    } ) ] } )

    expect( screen.getByText( 'from:donotreply@upwork.com' ) ).toBeInTheDocument()
  } )

  it( 'shows a jobs source with the number of postings collected', () => {
    setup( { sources: [ gmailSourceFixture( {
      destination: 'jobs',
      postings_count: 42,
      inbox_count: 0,
    } ) ] } )

    const row = within( screen.getByRole( 'listitem' ) )

    expect( row.getByText( 'Freelance jobs' ) ).toBeInTheDocument()
    expect( row.getByText( '42 postings collected' ) ).toBeInTheDocument()
    expect( row.queryByText( /in inbox/ ) ).not.toBeInTheDocument()
  } )

  it( 'says "1 posting collected" for one', () => {
    setup( { sources: [ gmailSourceFixture( { destination: 'jobs', postings_count: 1 } ) ] } )

    expect( screen.getByText( '1 posting collected' ) ).toBeInTheDocument()
  } )

  it( 'says a source has not been checked yet', () => {
    setup( { sources: [ gmailSourceFixture( { last_checked_at: null } ) ] } )

    expect( screen.getByText( 'Not checked yet' ) ).toBeInTheDocument()
  } )

  it( 'shows how many emails the last check skipped', () => {
    setup( { sources: [ gmailSourceFixture( { last_skipped_count: 4 } ) ] } )

    expect( screen.getByText( '4 skipped in the last check' ) ).toBeInTheDocument()
  } )

  it( 'says when a newsletter source summarizes automatically', () => {
    setup( { sources: [ gmailSourceFixture( { auto_summarize: true } ) ] } )

    expect( screen.getByText( 'Summarizes automatically' ) ).toBeInTheDocument()
  } )

  it( 'shows a source\'s last error', () => {
    setup( { sources: [
      gmailSourceFixture( { last_error: 'Label not found in Gmail: Label_9' } ),
    ] } )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Label not found in Gmail: Label_9' )
  } )

  it( 'shows no alert when there is no error', () => {
    setup()

    expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument()
  } )

  it( 'turns a source off and on', async () => {
    const { onUpdate } = setup()

    await userEvent.click( screen.getByRole( 'switch', { name: 'On' } ) )

    expect( onUpdate ).toHaveBeenCalledWith( SOURCE_ID, { enabled: false } )
  } )

  it( 'shows a turned-off source as off', () => {
    setup( { sources: [ gmailSourceFixture( { enabled: false } ) ] } )

    expect( screen.getByRole( 'switch', { name: 'On' } ) ).not.toBeChecked()
  } )

  it( 'checks a source from its menu', async () => {
    const { onCheck } = setup()

    await userEvent.click( screen.getByRole( 'button', { name: 'Newsletters actions' } ) )
    await userEvent.click( screen.getByRole( 'menuitem', { name: 'Check now' } ) )

    expect( onCheck ).toHaveBeenCalledWith( SOURCE_ID )
  } )

  it( 'edits a source from its menu', async () => {
    const { onEdit } = setup()

    await userEvent.click( screen.getByRole( 'button', { name: 'Newsletters actions' } ) )
    await userEvent.click( screen.getByRole( 'menuitem', { name: 'Edit' } ) )

    expect( onEdit ).toHaveBeenCalledWith( gmailSourceFixture() )
  } )

  it( 'deletes a source from its menu', async () => {
    const { onDelete } = setup()

    await userEvent.click( screen.getByRole( 'button', { name: 'Newsletters actions' } ) )
    await userEvent.click( screen.getByRole( 'menuitem', { name: 'Delete' } ) )

    expect( onDelete ).toHaveBeenCalledWith( gmailSourceFixture() )
  } )

  it( 'shows Checking… and disables Check now for the source being checked', async () => {
    setup( { checkingId: SOURCE_ID } )

    expect( screen.getByText( 'Checking…' ) ).toBeInTheDocument()

    await userEvent.click( screen.getByRole( 'button', { name: 'Newsletters actions' } ) )

    expect( screen.getByRole( 'menuitem', { name: 'Check now' } ) ).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  } )

  describe( 'while Gmail is not connected', () => {
    it( 'disables the switch, Check now and Edit, but not Delete', async () => {
      setup( { disabled: true } )

      expect( screen.getByRole( 'switch', { name: 'On' } ) ).toBeDisabled()

      await userEvent.click( screen.getByRole( 'button', { name: 'Newsletters actions' } ) )

      for( const name of [ 'Check now', 'Edit' ] ) {
        expect( screen.getByRole( 'menuitem', { name } ) )
          .toHaveAttribute( 'aria-disabled', 'true' )
      }

      expect( screen.getByRole( 'menuitem', { name: 'Delete' } ) )
        .not.toHaveAttribute( 'aria-disabled' )
    } )
  } )
} )
