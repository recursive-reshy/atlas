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
import { ruleFixture } from '#src/features/themis/fixtures/calendarReview.fixture'
import { LEARN_GOAL_ID, SUBJECT_ID } from '#src/features/themis/fixtures/themis.fixture'
import { createRule, listRules } from '#src/features/themis/api/calendar.api'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { CalendarRules } from './CalendarRules'

vi.mock( '#src/features/themis/api/calendar.api' )
vi.mock( '#src/features/themis/hooks/useTimeTargets', () => ( {
  useTimeTargets: () => ( {
    subjects: [ { id: SUBJECT_ID, name: 'Data Engineering' } ],
    goals: [ { id: LEARN_GOAL_ID, name: 'Move into data engineering' } ],
  } ),
} ) )

beforeEach( () => {
  vi.resetAllMocks()
  vi.mocked( listRules ).mockResolvedValue( [
    ruleFixture( { phrase: 'standup', position: 0 } ),
    ruleFixture( { id: '7e000000-0000-4000-8000-000000000002', phrase: 'lunch', position: 1 } ),
  ] )
} )

describe( 'CalendarRules', () => {
  it( 'lists the rules in order', async () => {
    renderWithClient( <CalendarRules /> )

    const rows = await screen.findAllByRole( 'listitem' )

    expect( rows.map( ( row ) => row.textContent ) ).toEqual( [
      expect.stringContaining( 'standup' ),
      expect.stringContaining( 'lunch' ),
    ] )
  } )

  it( 'explains the rules when there are none', async () => {
    vi.mocked( listRules ).mockResolvedValue( [] )
    renderWithClient( <CalendarRules /> )

    expect( await screen.findByText( /No rules yet/ ) ).toBeInTheDocument()
  } )

  it( 'disables Add until there is a phrase and a target', async () => {
    renderWithClient( <CalendarRules /> )
    const user = userEvent.setup()

    await screen.findAllByRole( 'listitem' )
    expect( screen.getByRole( 'button', { name: 'Add rule' } ) ).toBeDisabled()

    await user.type( screen.getByRole( 'textbox', { name: 'Phrase' } ), 'review' )
    expect( screen.getByRole( 'button', { name: 'Add rule' } ) ).toBeDisabled()

    await user.selectOptions(
      screen.getByRole( 'combobox', { name: 'New rule assigns to' } ),
      `subject:${ SUBJECT_ID }`,
    )
    expect( screen.getByRole( 'button', { name: 'Add rule' } ) ).toBeEnabled()
  } )

  it( 'adds a rule with a goal target and clears the row', async () => {
    vi.mocked( createRule ).mockResolvedValue( ruleFixture() )
    renderWithClient( <CalendarRules /> )
    const user = userEvent.setup()

    await screen.findAllByRole( 'listitem' )
    await user.type( screen.getByRole( 'textbox', { name: 'Phrase' } ), '  review  ' )
    await user.selectOptions(
      screen.getByRole( 'combobox', { name: 'New rule assigns to' } ),
      `goal:${ LEARN_GOAL_ID }`,
    )
    await user.click( screen.getByRole( 'button', { name: 'Add rule' } ) )

    await vi.waitFor( () => expect( createRule ).toHaveBeenCalledWith(
      { phrase: 'review', goal_id: LEARN_GOAL_ID },
    ) )
    await vi.waitFor(
      () => expect( screen.getByRole( 'textbox', { name: 'Phrase' } ) ).toHaveValue( '' ),
    )
  } )

  it( 'starts the add row with the phrase it was given', async () => {
    renderWithClient( <CalendarRules initialPhrase="Data engineering study block" /> )

    await screen.findAllByRole( 'listitem' )
    expect( screen.getByRole( 'textbox', { name: 'Phrase' } ) )
      .toHaveValue( 'Data engineering study block' )
  } )

  it( 'shows why adding failed and keeps the row', async () => {
    vi.mocked( createRule ).mockRejectedValue( new Error( 'Phrase is too long' ) )
    renderWithClient( <CalendarRules initialPhrase="x" /> )
    const user = userEvent.setup()

    await screen.findAllByRole( 'listitem' )
    await user.selectOptions(
      screen.getByRole( 'combobox', { name: 'New rule assigns to' } ),
      `subject:${ SUBJECT_ID }`,
    )
    await user.click( screen.getByRole( 'button', { name: 'Add rule' } ) )

    expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'Phrase is too long' )
    expect( screen.getByRole( 'textbox', { name: 'Phrase' } ) ).toHaveValue( 'x' )
  } )

  it( 'shows an error when the rules cannot load', async () => {
    vi.mocked( listRules ).mockRejectedValue( new Error( 'Could not reach the server' ) )
    renderWithClient( <CalendarRules /> )

    expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
  } )
} )
