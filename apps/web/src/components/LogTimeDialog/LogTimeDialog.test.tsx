// Testing Library
import { screen, within } from '@testing-library/react'
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
import { useLogTime } from '#src/hooks/useLogTime'
import { useMe } from '#src/app/useMe'
import { useMeleteToday } from '#src/hooks/useMeleteToday'
import { useThemisOverview } from '#src/hooks/useThemisOverview'
import { meFixture } from '#src/test-support/me.fixture'
import {
  SUBJECT_ID,
  meleteSubjectFixture,
  meleteTodayFixture,
} from '#src/test-support/melete.fixture'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { METRIC_GOAL_ID, overviewFixture } from '#src/test-support/themis.fixture'
import { LogTimeDialog } from './LogTimeDialog'

vi.mock( '#src/hooks/useLogTime' )
vi.mock( '#src/app/useMe' )
vi.mock( '#src/hooks/useMeleteToday' )
vi.mock( '#src/hooks/useThemisOverview' )

const mutate = vi.fn()
const onClose = vi.fn()

const signedInWith = ( modules: ( 'transcriber' | 'melete' | 'themis' )[] ): void => {
  vi.mocked( useMe ).mockReturnValue( {
    me: meFixture( { modules } ),
    isLoading: false,
    error: null,
  } )
}

const stub = ( overrides: object = {} ): void => {
  vi.mocked( useLogTime ).mockReturnValue(
    mutationStub< ReturnType< typeof useLogTime > >( { mutate, ...overrides } ),
  )
}

const target = (): HTMLElement => screen.getByRole( 'combobox', { name: 'Subject or goal' } )
const minutes = (): HTMLElement => screen.getByRole( 'spinbutton', { name: 'Minutes' } )
const save = (): HTMLElement => screen.getByRole( 'button', { name: 'Log time' } )

const open = ( props: { subjectId?: string, goalId?: string } = {} ): void => {
  renderWithClient( <LogTimeDialog { ...props } onClose={ onClose } /> )
}

beforeEach( () => {
  vi.useFakeTimers( { toFake: [ 'Date' ] } )
  vi.setSystemTime( new Date( 2026, 10, 8, 14, 30 ) )
  mutate.mockReset()
  onClose.mockReset()
  stub()
  signedInWith( [ 'melete', 'themis' ] )
  vi.mocked( useMeleteToday ).mockReturnValue( {
    today: meleteTodayFixture( { subjects: [ meleteSubjectFixture() ] } ),
    isLoading: false,
    error: null,
  } )
  vi.mocked( useThemisOverview ).mockReturnValue( {
    overview: overviewFixture(),
    isLoading: false,
    error: null,
  } )
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'LogTimeDialog, the target', () => {
  it( 'groups subjects and the active goals', () => {
    open()

    const subjects = within( target() ).getByRole( 'group', { name: 'Subjects' } )
    const goals = within( target() ).getByRole( 'group', { name: 'Goals' } )

    expect( within( subjects ).getByRole( 'option', { name: 'TypeScript' } ) ).toBeInTheDocument()
    expect( within( goals ).getAllByRole( 'option' ).map( ( option ) => option.textContent ) )
      .toEqual( [ 'Move into data engineering', 'Emergency fund', 'Time with family' ] )
  } )

  it( 'asks only for what the user has: no goals without Themis', () => {
    signedInWith( [ 'melete' ] )
    open()

    expect( useThemisOverview ).toHaveBeenCalledWith( 'week', false )
    expect( within( target() ).queryByRole( 'group', { name: 'Goals' } ) ).not.toBeInTheDocument()
    expect( useMeleteToday ).toHaveBeenCalledWith( true )
  } )

  it( 'does not ask for subjects without Melete', () => {
    signedInWith( [ 'themis' ] )
    vi.mocked( useMeleteToday ).mockReturnValue( { today: null, isLoading: false, error: null } )
    open()

    expect( useMeleteToday ).toHaveBeenCalledWith( false )
    expect( within( target() ).queryByRole( 'group', { name: 'Subjects' } ) )
      .not.toBeInTheDocument()
  } )

  it( 'starts on the subject it was opened for', () => {
    open( { subjectId: SUBJECT_ID } )

    expect( target() ).toHaveValue( `subject:${ SUBJECT_ID }` )
  } )

  it( 'starts on the goal it was opened for', () => {
    open( { goalId: METRIC_GOAL_ID } )

    expect( target() ).toHaveValue( `goal:${ METRIC_GOAL_ID }` )
  } )

  it( 'starts with nothing chosen otherwise, and will not log', () => {
    open()

    expect( target() ).toHaveValue( '' )
    expect( save() ).toBeDisabled()
  } )
} )

describe( 'LogTimeDialog, the minutes', () => {
  it( 'fills the minutes from a quick chip and marks it pressed', async () => {
    open( { subjectId: SUBJECT_ID } )

    for( const chip of [ 15, 30, 45, 60, 90 ] ) {
      expect( screen.getByRole( 'button', { name: `${ chip } min` } ) ).toBeInTheDocument()
    }

    await userEvent.click( screen.getByRole( 'button', { name: '45 min' } ) )

    expect( minutes() ).toHaveValue( 45 )
    expect( screen.getByRole( 'button', { name: '45 min' } ) )
      .toHaveAttribute( 'aria-pressed', 'true' )
    expect( screen.getByRole( 'button', { name: '30 min' } ) )
      .toHaveAttribute( 'aria-pressed', 'false' )
  } )

  it.each( [ '', '0', '1441', '2.5' ] )( 'will not log "%s" minutes', async ( text ) => {
    open( { subjectId: SUBJECT_ID } )

    if( text !== '' ) {
      await userEvent.type( minutes(), text )
    }

    expect( save() ).toBeDisabled()
  } )

  it( 'accepts a whole number from 1 to 1440', async () => {
    open( { subjectId: SUBJECT_ID } )
    await userEvent.type( minutes(), '1440' )

    expect( save() ).toBeEnabled()
  } )
} )

describe( 'LogTimeDialog, the day', () => {
  it( 'is today on the device, and cannot be later or a year back', () => {
    open( { subjectId: SUBJECT_ID } )

    const day = screen.getByLabelText( 'Day' )

    expect( day ).toHaveValue( '2026-11-08' )
    expect( day ).toHaveAttribute( 'max', '2026-11-08' )
    expect( day ).toHaveAttribute( 'min', '2025-11-08' )
  } )
} )

describe( 'LogTimeDialog, saving', () => {
  it( 'logs minutes against a subject with the day, then closes', async () => {
    mutate.mockImplementation( ( _body: unknown, options: { onSuccess: () => void } ) => {
      options.onSuccess()
    } )
    open( { subjectId: SUBJECT_ID } )
    await userEvent.click( screen.getByRole( 'button', { name: '30 min' } ) )
    await userEvent.click( save() )

    expect( mutate ).toHaveBeenCalledWith(
      { subject_id: SUBJECT_ID, day: '2026-11-08', minutes: 30 },
      expect.anything(),
    )
    expect( onClose ).toHaveBeenCalled()
  } )

  it( 'logs against a goal, with a trimmed note and a back-dated day', async () => {
    open()
    await userEvent.selectOptions( target(), `goal:${ METRIC_GOAL_ID }` )
    await userEvent.type( minutes(), '20' )
    await userEvent.type( screen.getByRole( 'textbox', { name: 'Note (optional)' } ), ' Read ' )
    await userEvent.clear( screen.getByLabelText( 'Day' ) )
    await userEvent.type( screen.getByLabelText( 'Day' ), '2026-11-06' )
    await userEvent.click( save() )

    expect( mutate ).toHaveBeenCalledWith(
      { goal_id: METRIC_GOAL_ID, day: '2026-11-06', minutes: 20, note: 'Read' },
      expect.anything(),
    )
  } )

  it( 'shows the server\'s message and stays open', () => {
    stub( { error: new Error( 'The day is more than a year back' ) } )
    open( { subjectId: SUBJECT_ID } )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'more than a year back' )
    expect( onClose ).not.toHaveBeenCalled()
  } )

  it( 'will not log twice while saving', async () => {
    stub( { isPending: true } )
    open( { subjectId: SUBJECT_ID } )
    await userEvent.type( minutes(), '10' )

    expect( save() ).toBeDisabled()
  } )

  it( 'closes on Cancel without logging', async () => {
    open()
    await userEvent.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( mutate ).not.toHaveBeenCalled()
    expect( onClose ).toHaveBeenCalled()
  } )
} )
