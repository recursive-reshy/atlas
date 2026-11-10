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
import { useSetGoalSubjects } from '#src/hooks/useGoalMutations'
import { useMeleteToday } from '#src/features/melete/hooks/useMeleteToday'
import {
  meleteSubjectFixture,
  meleteTodayFixture,
} from '#src/features/melete/fixtures/melete.fixture'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { LEARN_GOAL_ID, METRIC_GOAL_ID } from '#src/test-support/themis.fixture'
import { LinkSubjectsDialog } from './LinkSubjectsDialog'

vi.mock( '#src/hooks/useGoalMutations' )
vi.mock( '#src/features/melete/hooks/useMeleteToday' )

const A = '3b1c8f2e-6a4d-4e0b-9c57-1d2e3f4a5b01'
const B = '3b1c8f2e-6a4d-4e0b-9c57-1d2e3f4a5b02'
const C = '3b1c8f2e-6a4d-4e0b-9c57-1d2e3f4a5b03'

const mutate = vi.fn()
const onClose = vi.fn()

const show = ( overrides = {} ): void => {
  vi.mocked( useMeleteToday ).mockReturnValue( {
    today: meleteTodayFixture( {
      subjects: [
        meleteSubjectFixture( { id: A, name: 'Alpha', goal_id: METRIC_GOAL_ID } ),
        meleteSubjectFixture( { id: B, name: 'Beta', goal_id: LEARN_GOAL_ID } ),
        meleteSubjectFixture( { id: C, name: 'Gamma', goal_id: null } ),
      ],
    } ),
    isLoading: false,
    error: null,
    ...overrides,
  } )
}

beforeEach( () => {
  mutate.mockReset()
  onClose.mockReset()
  show()
  vi.mocked( useSetGoalSubjects ).mockReturnValue(
    mutationStub< ReturnType< typeof useSetGoalSubjects > >( { mutate } ),
  )
} )

const open = (): void => {
  renderWithClient( <LinkSubjectsDialog goalId={ METRIC_GOAL_ID } onClose={ onClose } /> )
}

describe( 'LinkSubjectsDialog', () => {
  it( 'lists the subjects with the ones linked to this goal ticked', () => {
    open()

    expect( screen.getByRole( 'checkbox', { name: /Alpha/ } ) ).toBeChecked()
    expect( screen.getByRole( 'checkbox', { name: /Beta/ } ) ).not.toBeChecked()
    expect( screen.getByRole( 'checkbox', { name: /Gamma/ } ) ).not.toBeChecked()
  } )

  it( 'warns that a subject linked to another goal moves over', () => {
    open()

    expect( screen.getByText( 'Linked to another goal; ticking it moves it here' ) )
      .toBeInTheDocument()
  } )

  it( 'sets exactly the ticked subjects, then closes', async () => {
    mutate.mockImplementation( ( _vars: unknown, options: { onSuccess: () => void } ) => {
      options.onSuccess()
    } )
    open()
    await userEvent.click( screen.getByRole( 'checkbox', { name: /Gamma/ } ) )
    await userEvent.click( screen.getByRole( 'checkbox', { name: /Alpha/ } ) )
    await userEvent.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( mutate ).toHaveBeenCalledWith(
      { goalId: METRIC_GOAL_ID, subjectIds: [ C ] },
      expect.anything(),
    )
    expect( onClose ).toHaveBeenCalled()
  } )

  it( 'says so when there are no subjects', () => {
    show( { today: meleteTodayFixture( { subjects: [] } ) } )
    open()

    expect( screen.getByText( 'No subjects yet. Add one in Melete.' ) ).toBeInTheDocument()
  } )

  it( 'shows a status while loading and an error when it fails', () => {
    show( { today: null, isLoading: true } )
    open()
    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading' )
  } )

  it( 'shows the load error', () => {
    show( { today: null, error: 'Server down' } )
    open()

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Server down' )
  } )

  it( 'shows the server\'s message when saving fails', () => {
    vi.mocked( useSetGoalSubjects ).mockReturnValue(
      mutationStub< ReturnType< typeof useSetGoalSubjects > >( {
        error: new Error( 'Subject not found' ),
      } ),
    )
    open()

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Subject not found' )
  } )
} )
