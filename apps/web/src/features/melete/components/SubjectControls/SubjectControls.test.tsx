// Testing Library
import { fireEvent, screen } from '@testing-library/react'
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
import { SubjectControls } from './SubjectControls'

const setup = ( overrides = {} ) => {
  const onEnrollAll = vi.fn()
  const onUpdate = vi.fn()
  renderWithClient(
    <SubjectControls
      subject={ meleteSubjectFixture( overrides ) }
      onEnrollAll={ onEnrollAll }
      onUpdate={ onUpdate }
    />,
  )

  return { onEnrollAll, onUpdate, user: userEvent.setup() }
}

const field = (): HTMLElement => screen.getByLabelText( 'New questions per day' )

describe( 'SubjectControls', () => {
  it( 'enrolls and unenrolls the whole subject', async () => {
    const { onEnrollAll, user } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Enroll all' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Unenroll all' } ) )

    expect( onEnrollAll ).toHaveBeenNthCalledWith( 1, true )
    expect( onEnrollAll ).toHaveBeenNthCalledWith( 2, false )
  } )

  it( 'switches auto-enrollment', async () => {
    const { onUpdate, user } = setup( { auto_enroll: false } )
    const toggle = screen.getByRole( 'switch', { name: 'Auto-enroll new notes' } )

    expect( toggle ).not.toBeChecked()
    await user.click( toggle )

    expect( onUpdate ).toHaveBeenCalledWith( { auto_enroll: true } )
  } )

  it( 'shows the current limit and saves a changed one on blur', async () => {
    const { onUpdate, user } = setup()

    expect( field() ).toHaveValue( 10 )
    await user.clear( field() )
    await user.type( field(), '25' )
    expect( onUpdate ).not.toHaveBeenCalled()
    await user.tab()

    expect( onUpdate ).toHaveBeenCalledWith( { new_per_day: 25 } )
  } )

  it( 'does not save an unchanged limit', async () => {
    const { onUpdate, user } = setup()

    await user.click( field() )
    await user.tab()

    expect( onUpdate ).not.toHaveBeenCalled()
  } )

  it.each( [ '101', '-1', '', '2.5' ] )( 'rejects %j and sends nothing', async ( value ) => {
    const { onUpdate, user } = setup()

    await user.clear( field() )
    if( value !== '' ) {
      fireEvent.change( field(), { target: { value } } )
    }
    await user.tab()

    expect( screen.getByText( 'Enter a whole number from 0 to 100' ) ).toBeInTheDocument()
    expect( onUpdate ).not.toHaveBeenCalled()
  } )
} )
