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
import { useDeleteGoal } from '#src/features/themis/hooks/useGoalMutations'
import { useMe } from '#src/app/useMe'
import { useThemisGoal } from '#src/features/themis/hooks/useThemisGoals'
import { useThemisOverview } from '#src/features/themis/hooks/useThemisOverview'
import { meFixture } from '#src/test-support/me.fixture'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import {
  METRIC_GOAL_ID,
  SUBJECT_ID,
  learningCardFixture,
  overviewFixture,
} from '#src/features/themis/fixtures/themis.fixture'
import { goalDetailFixture } from '#src/features/themis/fixtures/themisGoal.fixture'
import { ThemisGoal } from './ThemisGoal'

const navigate = vi.fn()

vi.mock( 'react-router', async ( importOriginal ) => ( {
  ...await importOriginal< typeof import( 'react-router' ) >(),
  useNavigate: () => navigate,
} ) )
vi.mock( '#src/features/themis/hooks/useGoalMutations' )
vi.mock( '#src/app/useMe' )
vi.mock( '#src/features/themis/hooks/useThemisGoals' )
vi.mock( '#src/features/themis/hooks/useThemisOverview' )
vi.mock( '../GoalDialog', () => ( {
  GoalDialog: ( { goal }: { goal: { name: string } } ) => <p>{ `goal dialog ${ goal.name }` }</p>,
} ) )
vi.mock( '../MetricUpdateDialog', () => ( {
  MetricUpdateDialog: () => <p>metric dialog</p>,
} ) )
vi.mock( '../LinkSubjectsDialog', () => ( {
  LinkSubjectsDialog: () => <p>link dialog</p>,
} ) )

const remove = vi.fn()
const route = { route: `/themis/goals/${ METRIC_GOAL_ID }`, path: '/themis/goals/:goalId' }

const showGoal = ( overrides = {} ): void => {
  vi.mocked( useThemisGoal ).mockReturnValue( {
    detail: goalDetailFixture(),
    isLoading: false,
    error: null,
    ...overrides,
  } )
}

const signedInWith = ( modules: ( 'transcriber' | 'melete' | 'themis' )[] ): void => {
  vi.mocked( useMe ).mockReturnValue( {
    me: meFixture( { modules } ),
    isLoading: false,
    error: null,
  } )
}

beforeEach( () => {
  remove.mockReset()
  navigate.mockReset()
  showGoal()
  signedInWith( [ 'melete', 'themis' ] )
  vi.mocked( useThemisOverview ).mockReturnValue( {
    overview: overviewFixture(),
    isLoading: false,
    error: null,
  } )
  vi.mocked( useDeleteGoal ).mockReturnValue(
    mutationStub< ReturnType< typeof useDeleteGoal > >( { mutate: remove } ),
  )
} )

describe( 'ThemisGoal', () => {
  it( 'loads the goal named in the address', () => {
    renderWithClient( <ThemisGoal />, route )

    expect( useThemisGoal ).toHaveBeenCalledWith( METRIC_GOAL_ID )
  } )

  it( 'shows its name, area and a link back', () => {
    renderWithClient( <ThemisGoal />, route )

    expect( screen.getByRole( 'heading', { level: 1, name: 'Emergency fund' } ) )
      .toBeInTheDocument()
    expect( screen.getByText( 'Financial' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'link', { name: 'Themis' } ) ).toHaveAttribute( 'href', '/themis' )
  } )

  it( 'shows the outcome, the time by week and the history', () => {
    renderWithClient( <ThemisGoal />, route )

    expect( screen.getByText( '12 k of 30 k' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'heading', { name: 'Time by week' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'heading', { name: 'Updates' } ) ).toBeInTheDocument()
  } )

  it( 'shows the status of an achieved goal, and none for an active one', () => {
    renderWithClient( <ThemisGoal />, route )
    expect( screen.queryByText( 'Achieved' ) ).not.toBeInTheDocument()
  } )

  it( 'shows Achieved for an achieved goal', () => {
    const detail = goalDetailFixture()

    showGoal( { detail: { ...detail, goal: { ...detail.goal, status: 'achieved' } } } )
    renderWithClient( <ThemisGoal />, route )

    expect( screen.getByText( 'Achieved' ) ).toBeInTheDocument()
  } )

  it( 'lists the linked subjects', () => {
    showGoal( { detail: goalDetailFixture( {
      subjects: [ { id: SUBJECT_ID, name: 'Data Engineering' } ],
    } ) } )
    renderWithClient( <ThemisGoal />, route )

    expect( within( screen.getByRole( 'region', { name: 'Linked subjects' } ) )
      .getByText( 'Data Engineering' ) ).toBeInTheDocument()
  } )

  it( 'opens the edit dialog with the goal', async () => {
    renderWithClient( <ThemisGoal />, route )
    await userEvent.click( screen.getByRole( 'button', { name: 'Edit goal' } ) )

    expect( screen.getByText( 'goal dialog Emergency fund' ) ).toBeInTheDocument()
  } )

  it( 'offers Log update for a metric goal and opens its dialog', async () => {
    renderWithClient( <ThemisGoal />, route )
    await userEvent.click( screen.getByRole( 'button', { name: 'Log update' } ) )

    expect( screen.getByText( 'metric dialog' ) ).toBeInTheDocument()
  } )

  it( 'does not offer Log update for another outcome', () => {
    const { goal, outcome } = learningCardFixture()

    showGoal( { detail: goalDetailFixture( { goal, outcome } ) } )
    renderWithClient( <ThemisGoal />, route )

    expect( screen.queryByRole( 'button', { name: 'Log update' } ) ).not.toBeInTheDocument()
  } )

  it( 'offers Link subjects with Melete and opens its dialog', async () => {
    renderWithClient( <ThemisGoal />, route )
    await userEvent.click( screen.getByRole( 'button', { name: 'Link subjects' } ) )

    expect( screen.getByText( 'link dialog' ) ).toBeInTheDocument()
  } )

  it( 'does not offer Link subjects without Melete', () => {
    signedInWith( [ 'themis' ] )
    renderWithClient( <ThemisGoal />, route )

    expect( screen.queryByRole( 'button', { name: 'Link subjects' } ) ).not.toBeInTheDocument()
  } )

  it( 'asks before deleting and says what goes with the goal', async () => {
    renderWithClient( <ThemisGoal />, route )
    await userEvent.click( screen.getByRole( 'button', { name: 'Delete goal' } ) )

    const dialog = screen.getByRole( 'dialog', { name: 'Delete this goal?' } )

    expect( dialog ).toHaveTextContent( 'metric updates, check-ins and the time logged' )
    expect( remove ).not.toHaveBeenCalled()
  } )

  it( 'deletes the goal on confirm and returns to Themis', async () => {
    remove.mockImplementation( ( _id: string, options: { onSuccess: () => void } ) => {
      options.onSuccess()
    } )
    renderWithClient( <ThemisGoal />, route )

    await userEvent.click( screen.getByRole( 'button', { name: 'Delete goal' } ) )
    await userEvent.click( within( screen.getByRole( 'dialog' ) )
      .getByRole( 'button', { name: 'Delete goal' } ) )

    expect( remove ).toHaveBeenCalledWith( METRIC_GOAL_ID, expect.anything() )
    expect( navigate ).toHaveBeenCalledWith( '/themis' )
  } )

  it( 'does not delete on cancel', async () => {
    renderWithClient( <ThemisGoal />, route )
    await userEvent.click( screen.getByRole( 'button', { name: 'Delete goal' } ) )
    await userEvent.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( remove ).not.toHaveBeenCalled()
  } )

  it( 'shows a status while loading', () => {
    showGoal( { detail: null, isLoading: true } )
    renderWithClient( <ThemisGoal />, route )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading' )
  } )

  it( 'shows an error, such as a goal that is not there', () => {
    showGoal( { detail: null, error: 'Goal not found' } )
    renderWithClient( <ThemisGoal />, route )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Goal not found' )
  } )
} )
