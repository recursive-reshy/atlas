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
import { RULE_ID, ruleFixture } from '#src/features/themis/fixtures/calendarReview.fixture'
import { LEARN_GOAL_ID, SUBJECT_ID } from '#src/features/themis/fixtures/themis.fixture'
import { deleteRule, updateRule } from '#src/features/themis/api/calendar.api'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { CalendarRuleRow } from './CalendarRuleRow'

vi.mock( '#src/features/themis/api/calendar.api' )

const subjects = [ { id: SUBJECT_ID, name: 'Data Engineering' } ]
const goals = [ { id: LEARN_GOAL_ID, name: 'Move into data engineering' } ]

const show = ( { position = 1, isFirst = false, isLast = false } = {} ) => {
  renderWithClient( <CalendarRuleRow
    rule={ ruleFixture( { position } ) }
    isFirst={ isFirst }
    isLast={ isLast }
    subjects={ subjects }
    goals={ goals }
  /> )
}

beforeEach( () => {
  vi.resetAllMocks()
  vi.mocked( updateRule ).mockResolvedValue( ruleFixture() )
} )

describe( 'CalendarRuleRow', () => {
  it( 'shows the phrase and what it assigns to', () => {
    show()

    expect( screen.getByText( 'study block' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'combobox', { name: 'Assigns to' } ) )
      .toHaveValue( `goal:${ LEARN_GOAL_ID }` )
  } )

  it( 'changes the target', async () => {
    show()

    await userEvent.setup().selectOptions(
      screen.getByRole( 'combobox', { name: 'Assigns to' } ),
      `subject:${ SUBJECT_ID }`,
    )

    expect( updateRule ).toHaveBeenCalledWith( RULE_ID, { subject_id: SUBJECT_ID } )
  } )

  it( 'moves up and down by one place', async () => {
    show( { position: 1 } )
    const user = userEvent.setup()

    await user.click( screen.getByRole( 'button', { name: 'Move up' } ) )
    expect( updateRule ).toHaveBeenLastCalledWith( RULE_ID, { position: 0 } )

    await user.click( screen.getByRole( 'button', { name: 'Move down' } ) )
    expect( updateRule ).toHaveBeenLastCalledWith( RULE_ID, { position: 2 } )
  } )

  it( 'cannot move the first up or the last down', () => {
    show( { position: 0, isFirst: true, isLast: true } )

    expect( screen.getByRole( 'button', { name: 'Move up' } ) ).toBeDisabled()
    expect( screen.getByRole( 'button', { name: 'Move down' } ) ).toBeDisabled()
  } )

  it( 'deletes', async () => {
    vi.mocked( deleteRule ).mockResolvedValue( undefined )
    show()

    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Delete rule' } ) )

    expect( deleteRule ).toHaveBeenCalledWith( RULE_ID )
  } )

  it( 'shows why a change failed', async () => {
    vi.mocked( updateRule ).mockRejectedValue( new Error( 'Rule not found' ) )
    show()

    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Move up' } ) )

    expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'Rule not found' )
  } )
} )
