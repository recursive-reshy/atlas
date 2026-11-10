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
import { FEED_ID, feedFixture } from '#src/features/feeds/fixtures/feed.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { CODING_ID, profilesFixture } from '#src/features/jobs/fixtures/summarizer.fixture'
import { FeedList } from './FeedList'

const NOW = Date.parse( '2026-10-18T10:00:00.000Z' )

const setup = ( overrides: Partial< Parameters< typeof FeedList >[ 0 ] > = {} ) => {
  const onUpdate = vi.fn()
  const onCheck = vi.fn()
  const onEdit = vi.fn()
  const onDelete = vi.fn()

  renderWithClient(
    <FeedList
      feeds={ [ feedFixture() ] }
      profiles={ profilesFixture() }
      now={ NOW }
      checkingId={ null }
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

describe( 'FeedList', () => {
  it( 'says so when there are no feeds', () => {
    setup( { feeds: [] } )

    expect( screen.getByText( 'No feeds yet.' ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'list', { name: 'Feeds' } ) ).not.toBeInTheDocument()
  } )

  it( 'shows a feed\'s name, address, profile, last check and inbox count', () => {
    setup( { feeds: [ feedFixture( { profile_id: CODING_ID, inbox_count: 3 } ) ] } )

    const row = within( screen.getByRole( 'listitem' ) )
    expect( row.getByText( 'Example Blog' ) ).toBeInTheDocument()
    expect( row.getByText( 'https://blog.example.com/feed.xml' ) ).toBeInTheDocument()
    expect( row.getByText( 'Profile: Coding' ) ).toBeInTheDocument()
    expect( row.getByText( 'Checked 1h ago' ) ).toBeInTheDocument()
    expect( row.getByText( '3 in inbox' ) ).toBeInTheDocument()
  } )

  it( 'names the default profile when the feed has none or its profile is gone', () => {
    setup( {
      feeds: [
        feedFixture( { id: FEED_ID, profile_id: null } ),
        feedFixture( {
          id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
          name: 'Other',
          profile_id: '2c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
        } ),
      ],
    } )

    expect( screen.getAllByText( 'Profile: Default profile' ) ).toHaveLength( 2 )
  } )

  it( 'says a feed has not been checked yet', () => {
    setup( { feeds: [ feedFixture( { last_checked_at: null } ) ] } )

    expect( screen.getByText( 'Not checked yet' ) ).toBeInTheDocument()
  } )

  it( 'shows the last error as a warning and keeps the other details', () => {
    setup( { feeds: [ feedFixture( { last_error: 'The site answered 500' } ) ] } )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'The site answered 500' )
    expect( screen.getByText( 'Example Blog' ) ).toBeInTheDocument()
  } )

  it( 'shows the skipped count only when it is above zero', () => {
    setup( { feeds: [ feedFixture( { last_skipped_count: 4 } ) ] } )

    expect( screen.getByText( '4 skipped in the last check' ) ).toBeInTheDocument()
  } )

  it( 'leaves the skipped line and the alert out for a healthy feed', () => {
    setup()

    expect( screen.queryByText( /skipped/ ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument()
  } )

  it( 'shows the switches in their current state', () => {
    setup( { feeds: [ feedFixture( { enabled: false, auto_summarize: true } ) ] } )

    expect( screen.getByRole( 'switch', { name: 'On' } ) ).not.toBeChecked()
    expect( screen.getByRole( 'switch', { name: 'Summarize automatically' } ) ).toBeChecked()
  } )

  it( 'turns a feed off at once', async () => {
    const user = userEvent.setup()
    const { onUpdate } = setup()

    await user.click( screen.getByRole( 'switch', { name: 'On' } ) )

    expect( onUpdate ).toHaveBeenCalledWith( FEED_ID, { enabled: false } )
  } )

  it( 'turns automatic summarizing on at once', async () => {
    const user = userEvent.setup()
    const { onUpdate } = setup()

    await user.click( screen.getByRole( 'switch', { name: 'Summarize automatically' } ) )

    expect( onUpdate ).toHaveBeenCalledWith( FEED_ID, { auto_summarize: true } )
  } )

  it( 'checks one feed from its menu', async () => {
    const user = userEvent.setup()
    const { onCheck } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Example Blog actions' } ) )
    await user.click( screen.getByRole( 'menuitem', { name: 'Check now' } ) )

    expect( onCheck ).toHaveBeenCalledWith( FEED_ID )
    expect( screen.queryByRole( 'menu' ) ).not.toBeInTheDocument()
  } )

  it( 'opens Edit for the feed from its menu', async () => {
    const user = userEvent.setup()
    const { onEdit } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Example Blog actions' } ) )
    await user.click( screen.getByRole( 'menuitem', { name: 'Edit' } ) )

    expect( onEdit ).toHaveBeenCalledWith( feedFixture() )
    expect( screen.queryByRole( 'menu' ) ).not.toBeInTheDocument()
  } )

  it( 'opens Delete for the feed from its menu', async () => {
    const user = userEvent.setup()
    const { onDelete } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Example Blog actions' } ) )
    await user.click( screen.getByRole( 'menuitem', { name: 'Delete' } ) )

    expect( onDelete ).toHaveBeenCalledWith( feedFixture() )
  } )

  it( 'shows Checking… and disables Check now for the feed being checked', async () => {
    const user = userEvent.setup()
    setup( { checkingId: FEED_ID } )

    expect( screen.getByText( 'Checking…' ) ).toBeInTheDocument()
    await user.click( screen.getByRole( 'button', { name: 'Example Blog actions' } ) )
    expect( screen.getByRole( 'menuitem', { name: 'Check now' } ) )
      .toHaveAttribute( 'aria-disabled', 'true' )
  } )
} )
