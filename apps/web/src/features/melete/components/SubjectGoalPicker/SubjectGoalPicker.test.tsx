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
import { useMe } from '#src/app/useMe'
import { useThemisOverview } from '#src/features/themis/hooks/useThemisOverview'
import { meFixture } from '#src/test-support/me.fixture'
import { meleteSubjectFixture } from '#src/features/melete/fixtures/melete.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import {
  LEARN_GOAL_ID,
  METRIC_GOAL_ID,
  overviewFixture,
} from '#src/features/themis/fixtures/themis.fixture'
import { SubjectGoalPicker } from './SubjectGoalPicker'

vi.mock( '#src/app/useMe' )
vi.mock( '#src/features/themis/hooks/useThemisOverview' )

const onUpdate = vi.fn()

const signedInWith = ( modules: ( 'transcriber' | 'melete' | 'themis' )[] ): void => {
  vi.mocked( useMe ).mockReturnValue( {
    me: meFixture( { modules } ),
    isLoading: false,
    error: null,
  } )
}

const picker = (): HTMLElement => screen.getByRole( 'combobox', { name: 'Goal' } )

beforeEach( () => {
  onUpdate.mockReset()
  signedInWith( [ 'melete', 'themis' ] )
  vi.mocked( useThemisOverview ).mockReturnValue( {
    overview: overviewFixture(),
    isLoading: false,
    error: null,
  } )
} )

describe( 'SubjectGoalPicker', () => {
  it( 'renders nothing for a user without Themis, and asks for nothing', () => {
    signedInWith( [ 'melete' ] )
    const { container } = renderWithClient(
      <SubjectGoalPicker subject={ meleteSubjectFixture() } onUpdate={ onUpdate } />,
    )

    expect( container ).toBeEmptyDOMElement()
    expect( useThemisOverview ).toHaveBeenCalledWith( 'week', false )
  } )

  it( 'offers None and the active goals', () => {
    renderWithClient(
      <SubjectGoalPicker subject={ meleteSubjectFixture() } onUpdate={ onUpdate } />,
    )

    expect( within( picker() ).getAllByRole( 'option' ).map( ( o ) => o.textContent ) ).toEqual( [
      'None',
      'Move into data engineering',
      'Emergency fund',
      'Time with family',
    ] )
    expect( picker() ).toHaveValue( '' )
  } )

  it( 'shows the linked goal', () => {
    renderWithClient( <SubjectGoalPicker
      subject={ meleteSubjectFixture( { goal_id: METRIC_GOAL_ID } ) }
      onUpdate={ onUpdate }
    /> )

    expect( picker() ).toHaveValue( METRIC_GOAL_ID )
  } )

  it( 'keeps a link to a goal that is no longer active visible', () => {
    const gone = '7b000000-0000-4000-8000-0000000000ff'

    renderWithClient( <SubjectGoalPicker
      subject={ meleteSubjectFixture( { goal_id: gone } ) }
      onUpdate={ onUpdate }
    /> )

    expect( picker() ).toHaveValue( gone )
    expect( screen.getByRole( 'option', { name: 'Achieved or dropped goal' } ) )
      .toBeInTheDocument()
  } )

  it( 'links the chosen goal', async () => {
    renderWithClient(
      <SubjectGoalPicker subject={ meleteSubjectFixture() } onUpdate={ onUpdate } />,
    )
    await userEvent.selectOptions( picker(), LEARN_GOAL_ID )

    expect( onUpdate ).toHaveBeenCalledWith( { goal_id: LEARN_GOAL_ID } )
  } )

  it( 'unlinks with None', async () => {
    renderWithClient( <SubjectGoalPicker
      subject={ meleteSubjectFixture( { goal_id: METRIC_GOAL_ID } ) }
      onUpdate={ onUpdate }
    /> )
    await userEvent.selectOptions( picker(), '' )

    expect( onUpdate ).toHaveBeenCalledWith( { goal_id: null } )
  } )
} )
