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
import { calendarFixture } from '#src/features/themis/fixtures/calendar.fixture'
import { draftFixture } from '#src/features/themis/fixtures/calendarReview.fixture'
import {
  approveDraft,
  approveMatched,
  getCalendar,
  listDrafts,
  syncCalendar,
} from '#src/features/themis/api/calendar.api'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { SUBJECT_ID } from '#src/features/themis/fixtures/themis.fixture'
import { CalendarDrafts } from './CalendarDrafts'

vi.mock( '#src/features/themis/api/calendar.api' )
vi.mock( '#src/features/themis/hooks/useTimeTargets', () => ( {
  useTimeTargets: () => ( {
    subjects: [ { id: SUBJECT_ID, name: 'Data Engineering' } ],
    goals: [],
  } ),
} ) )

const ID_2 = '7d000000-0000-4000-8000-000000000002'
const ID_3 = '7d000000-0000-4000-8000-000000000003'

const counts = { added: 0, updated: 0, removed: 0, drafts: 0, skipped: false }

beforeEach( () => {
  vi.resetAllMocks()
  vi.mocked( getCalendar ).mockResolvedValue( calendarFixture() )
  vi.mocked( syncCalendar ).mockResolvedValue( counts )
  vi.mocked( listDrafts ).mockResolvedValue( [
    draftFixture( {
      title: 'Standup',
      subject_id: SUBJECT_ID,
      assigned_by: 'rule',
      rule_phrase: 'stand',
    } ),
    draftFixture( { id: ID_2, title: 'Planning', subject_id: SUBJECT_ID, assigned_by: 'rule' } ),
    draftFixture( { id: ID_3, title: 'Lunch' } ),
  ] )
} )

const show = ( onMakeRule = vi.fn() ) => {
  renderWithClient( <CalendarDrafts onMakeRule={ onMakeRule } /> )

  return { onMakeRule }
}

describe( 'CalendarDrafts', () => {
  it( 'lists a row per draft', async () => {
    show()

    const rows = await screen.findAllByRole( 'listitem' )

    expect( rows ).toHaveLength( 3 )
    expect( within( rows[ 2 ] ).getByText( 'Lunch' ) ).toBeInTheDocument()
  } )

  it( 'says so when nothing waits', async () => {
    vi.mocked( listDrafts ).mockResolvedValue( [] )
    show()

    expect( await screen.findByText( 'No calendar drafts to review' ) ).toBeInTheDocument()
  } )

  it( 'syncs when opened, skipping a read under five minutes old', async () => {
    show()

    await vi.waitFor( () => expect( syncCalendar ).toHaveBeenCalledWith( 300 ) )
  } )

  it( 'does not sync, and points to Settings, when no calendar is connected', async () => {
    vi.mocked( getCalendar ).mockResolvedValue( calendarFixture( { status: 'not_connected' } ) )
    vi.mocked( listDrafts ).mockResolvedValue( [] )
    show()

    expect( await screen.findByRole( 'link', { name: 'Connect a calendar in Settings' } ) )
      .toHaveAttribute( 'href', '/settings/sources' )
    expect( syncCalendar ).not.toHaveBeenCalled()
  } )

  it( 'syncs now without the age check', async () => {
    show()
    await screen.findAllByRole( 'listitem' )
    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Sync now' } ) )

    await vi.waitFor( () => expect( syncCalendar ).toHaveBeenLastCalledWith() )
  } )

  it( 'counts the drafts a rule matched on the approve-all button', async () => {
    show()

    expect( await screen.findByRole( 'button', { name: 'Approve all matched (2)' } ) ).toBeEnabled()
  } )

  it( 'disables approve-all when no rule matched anything', async () => {
    vi.mocked( listDrafts ).mockResolvedValue( [ draftFixture() ] )
    show()

    expect( await screen.findByRole( 'button', { name: 'Approve all matched (0)' } ) )
      .toBeDisabled()
  } )

  it( 'approves everything matched and says how many', async () => {
    vi.mocked( approveMatched ).mockResolvedValue( 2 )
    show()

    await userEvent.setup()
      .click( await screen.findByRole( 'button', { name: 'Approve all matched (2)' } ) )

    expect( await screen.findByRole( 'status' ) ).toHaveTextContent( 'Approved 2 drafts' )
  } )

  it( 'says how much a single approval recorded', async () => {
    vi.mocked( approveDraft ).mockResolvedValue( { time_entry_id: ID_3, recorded_seconds: 2100 } )
    show()

    const row = ( await screen.findAllByRole( 'listitem' ) )[ 0 ]

    await userEvent.setup().click( within( row ).getByRole( 'button', { name: 'Approve' } ) )

    expect( await screen.findByRole( 'status' ) ).toHaveTextContent( 'Recorded 35 min' )
  } )

  it( 'says when measured time already covered the whole event', async () => {
    vi.mocked( approveDraft ).mockResolvedValue( { time_entry_id: null, recorded_seconds: 0 } )
    show()

    const row = ( await screen.findAllByRole( 'listitem' ) )[ 0 ]

    await userEvent.setup().click( within( row ).getByRole( 'button', { name: 'Approve' } ) )

    expect( await screen.findByRole( 'status' ) )
      .toHaveTextContent( 'Nothing to record: measured time already covered it' )
  } )

  it( 'passes a title on to make a rule', async () => {
    const { onMakeRule } = show()

    const row = ( await screen.findAllByRole( 'listitem' ) )[ 2 ]

    await userEvent.setup().click( within( row ).getByRole( 'button', { name: 'Make a rule' } ) )

    expect( onMakeRule ).toHaveBeenCalledWith( 'Lunch' )
  } )

  it( 'shows an error when the drafts cannot load', async () => {
    vi.mocked( listDrafts ).mockRejectedValue( new Error( 'Could not reach the server' ) )
    show()

    expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
  } )
} )
