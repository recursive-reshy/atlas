// Testing Library
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { ApiError } from '#src/lib/apiError'
import {
  calendarChoicesFixture,
  calendarFixture,
} from '#src/features/themis/fixtures/calendar.fixture'
import { listCalendars, selectCalendar } from '#src/features/themis/api/calendar.api'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { CalendarChooser } from './CalendarChooser'

vi.mock( '#src/features/themis/api/calendar.api' )

beforeEach( () => {
  vi.resetAllMocks()
  vi.useFakeTimers( { toFake: [ 'Date' ] } )
  vi.setSystemTime( new Date( 2026, 10, 10, 12 ) )
  vi.mocked( listCalendars ).mockResolvedValue( calendarChoicesFixture() )
  vi.mocked( selectCalendar ).mockResolvedValue( calendarFixture() )
} )

afterEach( () => {
  vi.useRealTimers()
} )

const show = ( props: { currentId?: string, importFrom?: string } = {} ) => {
  const onDone = vi.fn()
  const onCancel = vi.fn()

  renderWithClient( <CalendarChooser { ...props } onDone={ onDone } onCancel={ onCancel } /> )

  return { onDone, onCancel }
}

describe( 'CalendarChooser', () => {
  it( 'lists the calendars, with the primary one chosen at first and 14 days back', async () => {
    show()

    const select = await screen.findByRole( 'combobox', { name: 'Calendar' } )

    expect( select ).toHaveValue( 'naresh@example.com' )
    expect( screen.getByLabelText( 'Import events from' ) ).toHaveValue( '2026-10-27' )
  } )

  it( 'starts on the calendar already chosen and its start date', async () => {
    show( { currentId: 'work@example.com', importFrom: '2026-11-01' } )

    expect( await screen.findByRole( 'combobox', { name: 'Calendar' } ) )
      .toHaveValue( 'work@example.com' )
    expect( screen.getByLabelText( 'Import events from' ) ).toHaveValue( '2026-11-01' )
  } )

  it( 'saves the choice and finishes', async () => {
    const { onDone } = show()
    const user = userEvent.setup( { advanceTimers: vi.advanceTimersByTime } )

    await user.selectOptions(
      await screen.findByRole( 'combobox', { name: 'Calendar' } ),
      'work@example.com',
    )
    await user.click( screen.getByRole( 'button', { name: 'Save' } ) )

    await vi.waitFor( () => expect( onDone ).toHaveBeenCalled() )
    expect( selectCalendar ).toHaveBeenCalledWith(
      { calendar_id: 'work@example.com', import_from: '2026-10-27' },
    )
  } )

  it.each( [
    [ '2026-11-11', 'in the future' ],
    [ '2025-11-09', 'more than a year' ],
    [ '', 'Pick a start date' ],
  ] )( 'refuses a start date of %s', async ( day, text ) => {
    show()
    const user = userEvent.setup( { advanceTimers: vi.advanceTimersByTime } )

    await screen.findByRole( 'combobox', { name: 'Calendar' } )
    const input = screen.getByLabelText( 'Import events from' )

    await user.clear( input )

    if( day !== '' ) {
      await user.type( input, day )
    }

    expect( screen.getByRole( 'button', { name: 'Save' } ) ).toBeDisabled()
    expect( screen.getByText( new RegExp( text ) ) ).toBeInTheDocument()
  } )

  it( 'shows why saving failed and stays open', async () => {
    vi.mocked( selectCalendar ).mockRejectedValue( new ApiError( 'Google doesn\'t know it', 404 ) )
    const { onDone } = show()
    const user = userEvent.setup( { advanceTimers: vi.advanceTimersByTime } )

    await screen.findByRole( 'combobox', { name: 'Calendar' } )
    await user.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'Google doesn\'t know it' )
    expect( onDone ).not.toHaveBeenCalled()
  } )

  it( 'can be cancelled', async () => {
    const { onCancel } = show( { currentId: 'work@example.com' } )

    await screen.findByRole( 'combobox', { name: 'Calendar' } )
    await userEvent.setup( { advanceTimers: vi.advanceTimersByTime } )
      .click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( onCancel ).toHaveBeenCalled()
  } )

  it( 'shows the error when the calendars cannot be listed', async () => {
    vi.mocked( listCalendars ).mockRejectedValue( new ApiError( 'Could not reach Google', 502 ) )
    show()

    expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'Could not reach Google' )
  } )
} )
