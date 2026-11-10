// Testing Library
import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { meleteSubjectFixture } from '#src/features/melete/fixtures/melete.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { SubjectSettings } from './SubjectSettings'

vi.mock( '../SubjectGoalPicker', () => ( {
  SubjectGoalPicker: ( { onUpdate }: { onUpdate: ( body: { goal_id: null } ) => void } ) => (
    <button type="button" onClick={ () => onUpdate( { goal_id: null } ) }>goal picker</button>
  ),
} ) )

const setup = ( overrides = {} ) => {
  const onEnrollAll = vi.fn()
  const onUpdate = vi.fn()

  renderWithClient(
    <SubjectSettings
      subject={ meleteSubjectFixture( overrides ) }
      onEnrollAll={ onEnrollAll }
      onUpdate={ onUpdate }
    />,
  )

  return { onEnrollAll, onUpdate, user: userEvent.setup() }
}

const intent = (): HTMLElement => screen.getByRole( 'textbox', { name: 'Intent' } )

describe( 'SubjectSettings', () => {
  it( 'keeps the enrolment controls', async () => {
    const { user, onEnrollAll, onUpdate } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Enroll all' } ) )
    await user.click( screen.getByRole( 'switch', { name: 'Auto-enroll new notes' } ) )

    expect( onEnrollAll ).toHaveBeenCalledWith( true )
    expect( onUpdate ).toHaveBeenCalledWith( { auto_enroll: true } )
  } )

  it( 'shows the target level, or none yet', () => {
    setup( { target_level: 'proficient' } )

    expect( screen.getByRole( 'combobox', { name: 'Target level' } ) )
      .toHaveTextContent( 'Proficient' )
  } )

  it( 'changes the target level', async () => {
    const { user, onUpdate } = setup( { target_level: 'working' } )

    await user.click( screen.getByRole( 'combobox', { name: 'Target level' } ) )
    await user.click( within( screen.getByRole( 'listbox' ) )
      .getByRole( 'option', { name: 'Expert' } ) )

    expect( onUpdate ).toHaveBeenCalledWith( { target_level: 'expert' } )
  } )

  it( 'saves the intent when the field is left, only if it changed', async () => {
    const { user, onUpdate } = setup( { intent: 'Ship it' } )

    await user.click( intent() )
    await user.tab()

    expect( onUpdate ).not.toHaveBeenCalled()

    await user.clear( intent() )
    await user.type( intent(), 'Pass the exam' )
    await user.tab()

    expect( onUpdate ).toHaveBeenCalledWith( { intent: 'Pass the exam' } )
  } )

  it( 'clears the intent with a blank field', async () => {
    const { user, onUpdate } = setup( { intent: 'Ship it' } )

    await user.clear( intent() )
    fireEvent.blur( intent() )

    expect( onUpdate ).toHaveBeenCalledWith( { intent: '' } )
  } )

  it( 'limits the intent to 500 characters', () => {
    setup()

    expect( intent() ).toHaveAttribute( 'maxlength', '500' )
  } )

  it( 'has the goal picker, which updates the subject', async () => {
    const { user, onUpdate } = setup()

    await user.click( screen.getByRole( 'button', { name: 'goal picker' } ) )

    expect( onUpdate ).toHaveBeenCalledWith( { goal_id: null } )
  } )
} )
