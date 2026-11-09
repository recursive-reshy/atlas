// Testing Library
import { screen, within } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { useThemisGoals } from '#src/hooks/useThemisGoals'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { LEARN_GOAL_ID } from '#src/test-support/themis.fixture'
import { DROPPED_GOAL_ID, goalsListFixture } from '#src/test-support/themisGoal.fixture'
import { AllGoals } from './AllGoals'

vi.mock( '#src/hooks/useThemisGoals' )

const show = ( overrides = {} ): void => {
  vi.mocked( useThemisGoals ).mockReturnValue( {
    goals: goalsListFixture().goals,
    isLoading: false,
    error: null,
    ...overrides,
  } )
}

beforeEach( () => {
  show()
} )

describe( 'AllGoals', () => {
  it( 'links back to the Themis home', () => {
    renderWithClient( <AllGoals /> )

    expect( screen.getByRole( 'link', { name: 'Back to Themis' } ) )
      .toHaveAttribute( 'href', '/themis' )
  } )

  it( 'groups goals as Active, Achieved and Dropped, in that order', () => {
    renderWithClient( <AllGoals /> )

    expect( screen.getAllByRole( 'heading', { level: 2 } ).map( ( h ) => h.textContent ) )
      .toEqual( [ 'Active', 'Achieved', 'Dropped' ] )
  } )

  it( 'lists each goal as a link to its page with its area', () => {
    renderWithClient( <AllGoals /> )

    const dropped = screen.getByRole( 'region', { name: 'Dropped' } )

    expect( within( dropped ).getByRole( 'link', { name: 'Old plan' } ) )
      .toHaveAttribute( 'href', `/themis/goals/${ DROPPED_GOAL_ID }` )
    expect( within( dropped ).getByText( 'Career' ) ).toBeInTheDocument()

    const active = screen.getByRole( 'region', { name: 'Active' } )

    expect( within( active ).getByRole( 'link', { name: 'Move into data engineering' } ) )
      .toHaveAttribute( 'href', `/themis/goals/${ LEARN_GOAL_ID }` )
    expect( within( active ).getAllByRole( 'listitem' ) ).toHaveLength( 2 )
  } )

  it( 'leaves out a status with no goal', () => {
    show( { goals: goalsListFixture().goals.filter( ( { goal } ) => goal.status === 'active' ) } )
    renderWithClient( <AllGoals /> )

    expect( screen.getAllByRole( 'heading', { level: 2 } ).map( ( h ) => h.textContent ) )
      .toEqual( [ 'Active' ] )
  } )

  it( 'says so when there are no goals', () => {
    show( { goals: [] } )
    renderWithClient( <AllGoals /> )

    expect( screen.getByText( 'No goals yet' ) ).toBeInTheDocument()
  } )

  it( 'shows a status while loading', () => {
    show( { goals: null, isLoading: true } )
    renderWithClient( <AllGoals /> )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading' )
  } )

  it( 'shows an error', () => {
    show( { goals: null, error: 'Server down' } )
    renderWithClient( <AllGoals /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Server down' )
  } )
} )
