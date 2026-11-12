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
import {
  DRAFT_ID,
  draftFixture,
} from '#src/features/themis/fixtures/calendarReview.fixture'
import { LEARN_GOAL_ID, SUBJECT_ID } from '#src/features/themis/fixtures/themis.fixture'
import {
  approveDraft,
  dismissDraft,
  updateDraft,
} from '#src/features/themis/api/calendar.api'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { CalendarDraftRow } from './CalendarDraftRow'

vi.mock( '#src/features/themis/api/calendar.api' )

const subjects = [ { id: SUBJECT_ID, name: 'Data Engineering' } ]
const goals = [ { id: LEARN_GOAL_ID, name: 'Move into data engineering' } ]

const show = ( overrides = {} ) => {
  const onMakeRule = vi.fn()
  const onRecorded = vi.fn()

  renderWithClient( <CalendarDraftRow
    draft={ draftFixture( overrides ) }
    subjects={ subjects }
    goals={ goals }
    onMakeRule={ onMakeRule }
    onRecorded={ onRecorded }
  /> )

  return { onMakeRule, onRecorded }
}

beforeEach( () => {
  vi.resetAllMocks()
} )

describe( 'CalendarDraftRow', () => {
  it( 'shows the day, the time range and the title', () => {
    show()

    expect( screen.getByText( '2026-11-09' ) ).toBeInTheDocument()
    expect( screen.getByText( '09:00–10:00' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Data engineering study block' ) ).toBeInTheDocument()
  } )

  it( 'says what counts when nothing is measured already', () => {
    show()

    expect( screen.getByText( '1 h · counts 1 h' ) ).toBeInTheDocument()
  } )

  it( 'says what measured time already covers, and what counts', () => {
    show( { overlap_seconds: 1500, counts_seconds: 2100 } )

    expect( screen.getByText( '1 h · 25 min already measured · counts 35 min' ) )
      .toBeInTheDocument()
  } )

  it( 'shows the assignment, and the rule that made it', () => {
    show( { goal_id: LEARN_GOAL_ID, assigned_by: 'rule', rule_phrase: 'study block' } )

    expect( screen.getByRole( 'combobox', { name: 'Counts toward' } ) )
      .toHaveValue( `goal:${ LEARN_GOAL_ID }` )
    expect( screen.getByText( 'Assigned by the rule "study block"' ) ).toBeInTheDocument()
  } )

  it.each( [
    [ `subject:${ SUBJECT_ID }`, { subject_id: SUBJECT_ID } ],
    [ `goal:${ LEARN_GOAL_ID }`, { goal_id: LEARN_GOAL_ID } ],
  ] )( 'assigns by hand to %s', async ( value, body ) => {
    vi.mocked( updateDraft ).mockResolvedValue( draftFixture() )
    show()

    await userEvent.setup()
      .selectOptions( screen.getByRole( 'combobox', { name: 'Counts toward' } ), value )

    expect( updateDraft ).toHaveBeenCalledWith( DRAFT_ID, body )
  } )

  it( 'cannot be approved before it is assigned', () => {
    show()

    expect( screen.getByRole( 'button', { name: 'Approve' } ) ).toBeDisabled()
  } )

  it( 'approves an assigned draft and reports the minutes recorded', async () => {
    vi.mocked( approveDraft ).mockResolvedValue(
      { time_entry_id: DRAFT_ID, recorded_seconds: 2100 },
    )
    const { onRecorded } = show( { subject_id: SUBJECT_ID } )

    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Approve' } ) )

    await vi.waitFor( () => expect( onRecorded ).toHaveBeenCalledWith( 2100 ) )
    expect( approveDraft ).toHaveBeenCalledWith( DRAFT_ID )
  } )

  it( 'shows why approving failed', async () => {
    vi.mocked( approveDraft ).mockRejectedValue( new Error( 'Assign it first' ) )
    show( { subject_id: SUBJECT_ID } )

    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Approve' } ) )

    expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'Assign it first' )
  } )

  it( 'dismisses', async () => {
    vi.mocked( dismissDraft ).mockResolvedValue( undefined )
    show()

    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Dismiss' } ) )

    expect( dismissDraft ).toHaveBeenCalledWith( DRAFT_ID )
  } )

  it( 'offers to make a rule from the title', async () => {
    const { onMakeRule } = show()

    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Make a rule' } ) )

    expect( onMakeRule ).toHaveBeenCalledWith( 'Data engineering study block' )
  } )

  it( 'saves a note when the field loses focus, and clears it with null', async () => {
    vi.mocked( updateDraft ).mockResolvedValue( draftFixture() )
    show( { note: 'old' } )
    const user = userEvent.setup()
    const field = screen.getByRole( 'textbox', { name: 'Note (optional)' } )

    await user.clear( field )
    await user.tab()
    expect( updateDraft ).toHaveBeenCalledWith( DRAFT_ID, { note: null } )

    await user.type( field, 'Standup' )
    await user.tab()
    expect( updateDraft ).toHaveBeenLastCalledWith( DRAFT_ID, { note: 'Standup' } )
  } )

  it( 'does not save an unchanged note', async () => {
    show( { note: 'same' } )
    const user = userEvent.setup()

    await user.click( screen.getByRole( 'textbox', { name: 'Note (optional)' } ) )
    await user.tab()

    expect( updateDraft ).not.toHaveBeenCalled()
  } )
} )
