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
import { useThemisOverview } from '#src/features/themis/hooks/useThemisOverview'
import { renderWithClient } from '#src/test-support/renderWithClient'
import {
  CAREER_ID,
  dueFixture,
  overviewFixture,
} from '#src/features/themis/fixtures/themis.fixture'
import { ThemisHome } from './ThemisHome'

vi.mock( '#src/features/themis/hooks/useThemisOverview' )
vi.mock( '../CheckinsDue', () => ( {
  CheckinsDue: ( { due }: { due: unknown[] } ) => <p>{ `check-ins: ${ due.length }` }</p>,
} ) )
vi.mock( '../AddAreaForm', () => ( { AddAreaForm: () => <p>add area form</p> } ) )
vi.mock( '../AreaDialog', () => ( {
  AreaDialog: ( { area }: { area: { name: string } | null } ) => (
    <p>{ area === null ? 'area dialog new' : `area dialog ${ area.name }` }</p>
  ),
} ) )
vi.mock( '../GoalDialog', () => ( {
  GoalDialog: ( { areaId }: { areaId: string | null } ) => <p>{ `goal dialog in ${ areaId }` }</p>,
} ) )
vi.mock( '../LogTimeButton', () => ( {
  LogTimeButton: ( { isFloating }: { isFloating?: boolean } ) => (
    <p>{ isFloating ? 'floating log time' : 'log time' }</p>
  ),
} ) )
vi.mock( '../AllGoals', () => ( { AllGoals: () => <p>all goals list</p> } ) )

const show = ( overrides = {} ): void => {
  vi.mocked( useThemisOverview ).mockReturnValue( {
    overview: overviewFixture(),
    isLoading: false,
    error: null,
    ...overrides,
  } )
}

beforeEach( () => {
  show()
} )

describe( 'ThemisHome', () => {
  it( 'asks for the week by default', () => {
    renderWithClient( <ThemisHome /> )

    expect( useThemisOverview ).toHaveBeenCalledWith( 'week' )
  } )

  it( 'reads the period from the address', () => {
    renderWithClient( <ThemisHome />, { route: '/themis?period=quarter' } )

    expect( useThemisOverview ).toHaveBeenCalledWith( 'quarter' )
  } )

  it( 'falls back to the week for an unknown period', () => {
    renderWithClient( <ThemisHome />, { route: '/themis?period=decade' } )

    expect( useThemisOverview ).toHaveBeenCalledWith( 'week' )
  } )

  it( 'writes the chosen period to the address', async () => {
    const { location } = renderWithClient( <ThemisHome />, { route: '/themis' } )

    await userEvent.click( screen.getByRole( 'button', { name: 'Month' } ) )

    expect( location().search ).toBe( '?period=month' )
  } )

  it( 'shows a status while loading', () => {
    show( { overview: null, isLoading: true } )
    renderWithClient( <ThemisHome /> )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading' )
  } )

  it( 'shows an error', () => {
    show( { overview: null, error: 'Server down' } )
    renderWithClient( <ThemisHome /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Server down' )
  } )

  it( 'shows the empty state with the area form when there are no areas', () => {
    show( { overview: overviewFixture( { areas: [] } ) } )
    renderWithClient( <ThemisHome /> )

    expect( screen.getByRole( 'heading', { name: 'Add your first area' } ) ).toBeInTheDocument()
    expect( screen.getByText( 'add area form' ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'heading', { name: 'Where your time went' } ) )
      .not.toBeInTheDocument()
  } )

  it( 'groups the goal cards under their area headings, in order', () => {
    renderWithClient( <ThemisHome /> )

    const headings = screen.getAllByRole( 'heading', { level: 2 } ).map( ( h ) => h.textContent )

    expect( headings ).toEqual( [
      'Where your time went',
      'Career',
      'Financial',
    ] )

    const career = screen.getByRole( 'region', { name: 'Career' } )

    expect( within( career ).getByText( 'Move into data engineering' ) ).toBeInTheDocument()
    expect( within( career ).queryByText( 'Emergency fund' ) ).not.toBeInTheDocument()
  } )

  it( 'says so for an area with no active goals', () => {
    const [ career, financial ] = overviewFixture().areas

    show( { overview: overviewFixture( { areas: [ career, { ...financial, goals: [] } ] } ) } )
    renderWithClient( <ThemisHome /> )

    expect( within( screen.getByRole( 'region', { name: 'Financial' } ) )
      .getByText( 'No active goals' ) ).toBeInTheDocument()
  } )

  it( 'passes the check-ins due to the check-in section', () => {
    show( { overview: overviewFixture( { checkins_due: [ dueFixture() ] } ) } )
    renderWithClient( <ThemisHome /> )

    expect( screen.getByText( 'check-ins: 1' ) ).toBeInTheDocument()
  } )

  it( 'adds an area from the page', async () => {
    renderWithClient( <ThemisHome /> )
    await userEvent.click( screen.getByRole( 'button', { name: 'Add area' } ) )

    expect( screen.getByText( 'area dialog new' ) ).toBeInTheDocument()
  } )

  it( 'edits an area from its section', async () => {
    renderWithClient( <ThemisHome /> )
    await userEvent.click( screen.getByRole( 'button', { name: 'Edit area Career' } ) )

    expect( screen.getByText( 'area dialog Career' ) ).toBeInTheDocument()
  } )

  it( 'adds a goal in the area it was opened from', async () => {
    renderWithClient( <ThemisHome /> )
    await userEvent.click( screen.getByRole( 'button', { name: 'Add goal to Career' } ) )

    expect( screen.getByText( `goal dialog in ${ CAREER_ID }` ) ).toBeInTheDocument()
  } )

  it( 'links to the list of all goals', () => {
    renderWithClient( <ThemisHome /> )

    expect( screen.getByRole( 'link', { name: 'All goals' } ) )
      .toHaveAttribute( 'href', '/themis?view=all' )
  } )

  it( 'shows the list of all goals instead of the home for ?view=all', () => {
    renderWithClient( <ThemisHome />, { route: '/themis?view=all' } )

    expect( screen.getByText( 'all goals list' ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'heading', { name: 'Where your time went' } ) )
      .not.toBeInTheDocument()
  } )

  it( 'keeps a floating Log time button on the home', () => {
    renderWithClient( <ThemisHome /> )

    expect( screen.getByText( 'floating log time' ) ).toBeInTheDocument()
  } )

  it( 'keeps it in the empty state too', () => {
    show( { overview: overviewFixture( { areas: [] } ) } )
    renderWithClient( <ThemisHome /> )

    expect( screen.getByText( 'floating log time' ) ).toBeInTheDocument()
  } )

  it( 'leaves it off the list of all goals', () => {
    renderWithClient( <ThemisHome />, { route: '/themis?view=all' } )

    expect( screen.queryByText( 'floating log time' ) ).not.toBeInTheDocument()
  } )
} )

describe( 'ThemisHome, calendar link', () => {
  it.each( [ 'connected', 'broken', 'not_connected' ] as const )(
    'links to the calendar review when the status is %s',
    ( status ) => {
      show( { overview: overviewFixture( { calendar_status: status } ) } )
      renderWithClient( <ThemisHome /> )

      expect( screen.getByRole( 'link', { name: 'Calendar time' } ) )
        .toHaveAttribute( 'href', '/themis/calendar' )
    },
  )

  it( 'leaves it out when Calendar is not configured', () => {
    renderWithClient( <ThemisHome /> )

    expect( screen.queryByRole( 'link', { name: 'Calendar time' } ) ).not.toBeInTheDocument()
  } )
} )
