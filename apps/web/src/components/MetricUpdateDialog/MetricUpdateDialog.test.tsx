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
import { useLogMetric } from '#src/hooks/useGoalMutations'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { METRIC_GOAL_ID } from '#src/test-support/themis.fixture'
import { MetricUpdateDialog } from './MetricUpdateDialog'

vi.mock( '#src/hooks/useGoalMutations' )

const mutate = vi.fn()
const onClose = vi.fn()
const goal = { id: METRIC_GOAL_ID, name: 'Emergency fund', unit: 'k' }

const stub = ( overrides: object = {} ): void => {
  vi.mocked( useLogMetric ).mockReturnValue(
    mutationStub< ReturnType< typeof useLogMetric > >( { mutate, ...overrides } ),
  )
}

beforeEach( () => {
  mutate.mockReset()
  onClose.mockReset()
  stub()
} )

describe( 'MetricUpdateDialog', () => {
  it( 'names the goal and the unit', () => {
    renderWithClient( <MetricUpdateDialog goal={ goal } onClose={ onClose } /> )

    expect( screen.getByRole( 'dialog', { name: 'Update Emergency fund' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'spinbutton', { name: 'Value (k)' } ) ).toBeInTheDocument()
  } )

  it( 'leaves the unit out of the label when there is none', () => {
    renderWithClient( <MetricUpdateDialog goal={ { ...goal, unit: null } } onClose={ onClose } /> )

    expect( screen.getByRole( 'spinbutton', { name: 'Value' } ) ).toBeInTheDocument()
  } )

  it( 'records the value and a trimmed note, then closes', async () => {
    mutate.mockImplementation( ( _vars: unknown, options: { onSuccess: () => void } ) => {
      options.onSuccess()
    } )
    renderWithClient( <MetricUpdateDialog goal={ goal } onClose={ onClose } /> )

    await userEvent.type( screen.getByRole( 'spinbutton', { name: 'Value (k)' } ), '12.5' )
    await userEvent.type( screen.getByRole( 'textbox', { name: 'Note (optional)' } ), ' Bonus ' )
    await userEvent.click( screen.getByRole( 'button', { name: 'Save update' } ) )

    expect( mutate ).toHaveBeenCalledWith(
      { goalId: METRIC_GOAL_ID, body: { value: 12.5, note: 'Bonus' } },
      expect.anything(),
    )
    expect( onClose ).toHaveBeenCalled()
  } )

  it( 'leaves the note out when it is empty, and accepts zero', async () => {
    renderWithClient( <MetricUpdateDialog goal={ goal } onClose={ onClose } /> )

    await userEvent.type( screen.getByRole( 'spinbutton', { name: 'Value (k)' } ), '0' )
    await userEvent.click( screen.getByRole( 'button', { name: 'Save update' } ) )

    expect( mutate ).toHaveBeenCalledWith(
      { goalId: METRIC_GOAL_ID, body: { value: 0 } },
      expect.anything(),
    )
  } )

  it( 'keeps Save update off without a value', () => {
    renderWithClient( <MetricUpdateDialog goal={ goal } onClose={ onClose } /> )

    expect( screen.getByRole( 'button', { name: 'Save update' } ) ).toBeDisabled()
  } )

  it( 'shows the server\'s message', () => {
    stub( { error: new Error( 'Only a metric goal takes updates' ) } )
    renderWithClient( <MetricUpdateDialog goal={ goal } onClose={ onClose } /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Only a metric goal' )
  } )
} )
