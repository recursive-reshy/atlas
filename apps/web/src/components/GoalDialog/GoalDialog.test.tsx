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
import { useCreateGoal, useUpdateGoal } from '#src/hooks/useGoalMutations'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import {
  CAREER_ID,
  FINANCE_ID,
  checkinCardFixture,
  learningCardFixture,
  metricCardFixture,
} from '#src/test-support/themis.fixture'
import { GoalDialog } from './GoalDialog'

vi.mock( '#src/hooks/useGoalMutations' )

const areas = [ { id: CAREER_ID, name: 'Career' }, { id: FINANCE_ID, name: 'Financial' } ]
const create = vi.fn()
const update = vi.fn()
const onClose = vi.fn()

const stubs = ( overrides: { create?: object, update?: object } = {} ): void => {
  vi.mocked( useCreateGoal ).mockReturnValue(
    mutationStub< ReturnType< typeof useCreateGoal > >( { mutate: create, ...overrides.create } ),
  )
  vi.mocked( useUpdateGoal ).mockReturnValue(
    mutationStub< ReturnType< typeof useUpdateGoal > >( { mutate: update, ...overrides.update } ),
  )
}

const succeed = ( mock: ReturnType< typeof vi.fn > ): void => {
  mock.mockImplementation( ( _vars: unknown, options: { onSuccess: () => void } ) => {
    options.onSuccess()
  } )
}

const text = ( name: string ): Promise< void > => {
  return userEvent.type( screen.getByRole( 'textbox', { name } ), 'x' ).then( () => undefined )
}

beforeEach( () => {
  create.mockReset()
  update.mockReset()
  onClose.mockReset()
  stubs()
} )

describe( 'GoalDialog, new goal', () => {
  const open = (): void => {
    renderWithClient( <GoalDialog
      goal={ null }
      areaId={ FINANCE_ID }
      areas={ areas }
      onClose={ onClose }
    /> )
  }

  it( 'starts in the area it was opened from, on the learning outcome', () => {
    open()

    expect( screen.getByRole( 'dialog', { name: 'New goal' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'combobox', { name: 'Area' } ) ).toHaveValue( FINANCE_ID )
    expect( screen.getByRole( 'combobox', { name: 'Outcome' } ) ).toHaveValue( 'learning' )
  } )

  it( 'creates a learning goal with an optional target date', async () => {
    succeed( create )
    open()

    await userEvent.type( screen.getByRole( 'textbox', { name: 'Goal name' } ), ' Learn Go ' )
    await userEvent.type( screen.getByLabelText( 'Target date (optional)' ), '2027-03-01' )
    await userEvent.click( screen.getByRole( 'button', { name: 'Create goal' } ) )

    expect( create ).toHaveBeenCalledWith(
      { area_id: FINANCE_ID, name: 'Learn Go', outcome: 'learning', target_date: '2027-03-01' },
      expect.anything(),
    )
    expect( onClose ).toHaveBeenCalled()
  } )

  it( 'shows the unit and target for a metric goal, and sends them', async () => {
    succeed( create )
    open()
    await userEvent.selectOptions( screen.getByRole( 'combobox', { name: 'Outcome' } ), 'metric' )
    await userEvent.type( screen.getByRole( 'textbox', { name: 'Goal name' } ), 'Fund' )
    await userEvent.type( screen.getByRole( 'textbox', { name: 'Unit (optional)' } ), 'k' )
    await userEvent.type( screen.getByRole( 'spinbutton', { name: 'Target' } ), '30' )
    await userEvent.click( screen.getByRole( 'button', { name: 'Create goal' } ) )

    expect( create ).toHaveBeenCalledWith(
      { area_id: FINANCE_ID, name: 'Fund', outcome: 'metric', metric_unit: 'k', metric_target: 30 },
      expect.anything(),
    )
  } )

  it( 'needs a target before a metric goal can be created', async () => {
    open()
    await userEvent.selectOptions( screen.getByRole( 'combobox', { name: 'Outcome' } ), 'metric' )
    await userEvent.type( screen.getByRole( 'textbox', { name: 'Goal name' } ), 'Fund' )

    expect( screen.getByRole( 'button', { name: 'Create goal' } ) ).toBeDisabled()
  } )

  it( 'shows the cadence for a check-in goal, weekly first, and sends it', async () => {
    succeed( create )
    open()
    await userEvent.selectOptions( screen.getByRole( 'combobox', { name: 'Outcome' } ), 'checkin' )

    expect( screen.getByRole( 'combobox', { name: 'Cadence' } ) ).toHaveValue( 'weekly' )
    await userEvent.selectOptions( screen.getByRole( 'combobox', { name: 'Cadence' } ), 'monthly' )
    await userEvent.type( screen.getByRole( 'textbox', { name: 'Goal name' } ), 'Family' )
    await userEvent.click( screen.getByRole( 'button', { name: 'Create goal' } ) )

    expect( create ).toHaveBeenCalledWith(
      { area_id: FINANCE_ID, name: 'Family', outcome: 'checkin', checkin_cadence: 'monthly' },
      expect.anything(),
    )
  } )

  it( 'keeps Create goal off while the name is empty', () => {
    open()

    expect( screen.getByRole( 'button', { name: 'Create goal' } ) ).toBeDisabled()
  } )

  it( 'shows the server\'s message and stays open', () => {
    stubs( { create: { error: new Error( 'Area not found' ) } } )
    open()

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Area not found' )
    expect( onClose ).not.toHaveBeenCalled()
  } )
} )

describe( 'GoalDialog, existing goal', () => {
  const open = ( goal = metricCardFixture().goal ): void => {
    renderWithClient( <GoalDialog
      goal={ goal }
      areaId={ null }
      areas={ areas }
      onClose={ onClose }
    /> )
  }

  it( 'starts with the goal\'s values and shows the outcome as fixed', () => {
    open()

    expect( screen.getByRole( 'dialog', { name: 'Edit goal' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'textbox', { name: 'Goal name' } ) ).toHaveValue( 'Emergency fund' )
    expect( screen.getByRole( 'combobox', { name: 'Area' } ) ).toHaveValue( FINANCE_ID )
    expect( screen.getByRole( 'combobox', { name: 'Status' } ) ).toHaveValue( 'active' )
    expect( screen.getByText( 'Outcome: Metric (fixed)' ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'combobox', { name: 'Outcome' } ) ).not.toBeInTheDocument()
    expect( screen.getByRole( 'textbox', { name: 'Unit (optional)' } ) ).toHaveValue( 'k' )
    expect( screen.getByRole( 'spinbutton', { name: 'Target' } ) ).toHaveValue( 30 )
  } )

  it( 'sends only what changed', async () => {
    succeed( update )
    open()
    await userEvent.selectOptions( screen.getByRole( 'combobox', { name: 'Status' } ), 'achieved' )
    await userEvent.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( update ).toHaveBeenCalledWith(
      { id: metricCardFixture().goal.id, body: { status: 'achieved' } },
      expect.anything(),
    )
    expect( onClose ).toHaveBeenCalled()
  } )

  it( 'moves the goal to another area and renames it', async () => {
    succeed( update )
    open( learningCardFixture().goal )
    await userEvent.selectOptions( screen.getByRole( 'combobox', { name: 'Area' } ), FINANCE_ID )
    await text( 'Goal name' )
    await userEvent.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( update ).toHaveBeenCalledWith(
      {
        id: learningCardFixture().goal.id,
        body: { name: 'Move into data engineeringx', area_id: FINANCE_ID },
      },
      expect.anything(),
    )
  } )

  it( 'clears the target date with null', async () => {
    succeed( update )
    open( learningCardFixture().goal )
    await userEvent.clear( screen.getByLabelText( 'Target date (optional)' ) )
    await userEvent.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( update ).toHaveBeenCalledWith(
      { id: learningCardFixture().goal.id, body: { target_date: null } },
      expect.anything(),
    )
  } )

  it( 'changes a check-in goal\'s cadence', async () => {
    succeed( update )
    open( checkinCardFixture().goal )
    await userEvent.selectOptions( screen.getByRole( 'combobox', { name: 'Cadence' } ), 'monthly' )
    await userEvent.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( update ).toHaveBeenCalledWith(
      { id: checkinCardFixture().goal.id, body: { checkin_cadence: 'monthly' } },
      expect.anything(),
    )
  } )

  it( 'just closes when nothing changed', async () => {
    open()
    await userEvent.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( update ).not.toHaveBeenCalled()
    expect( onClose ).toHaveBeenCalled()
  } )
} )
