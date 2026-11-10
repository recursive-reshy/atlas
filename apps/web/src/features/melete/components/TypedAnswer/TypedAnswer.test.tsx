// Testing Library
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { mockMatchMedia } from '#src/test-support/matchMedia'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { TypedAnswer } from './TypedAnswer'

interface Options {
  isChecked?: boolean
  isChecking?: boolean
}

const setup = ( { isChecked = false, isChecking = false }: Options = {} ) => {
  const onChange = vi.fn()
  const onCheck = vi.fn()

  renderWithClient(
    <TypedAnswer
      value="my answer"
      isChecked={ isChecked }
      isChecking={ isChecking }
      onChange={ onChange }
      onCheck={ onCheck }
    />,
  )

  return { onChange, onCheck, user: userEvent.setup() }
}

describe( 'TypedAnswer', () => {
  it( 'sends what is typed and checks on the button', async () => {
    const { onChange, onCheck, user } = setup()

    await user.type( screen.getByRole( 'textbox', { name: 'Your answer' } ), 'x' )
    await user.click( screen.getByRole( 'button', { name: 'Check' } ) )

    expect( onChange ).toHaveBeenCalledWith( 'my answerx' )
    expect( onCheck ).toHaveBeenCalledOnce()
  } )

  it( 'shows progress and cannot be pressed again while grading', () => {
    setup( { isChecking: true } )

    expect( screen.getByRole( 'button', { name: 'Checking…' } ) ).toBeDisabled()
    expect( screen.getByRole( 'textbox', { name: 'Your answer' } ) ).toHaveValue( 'my answer' )
  } )

  it( 'keeps the answer visible but read-only once checked, with no Check button', () => {
    setup( { isChecked: true } )

    expect( screen.getByRole( 'textbox', { name: 'Your answer' } ) )
      .toHaveAttribute( 'readonly' )
    expect( screen.queryByRole( 'button', { name: 'Check' } ) ).not.toBeInTheDocument()
  } )

  it( 'focuses the box on a wide window only', () => {
    setup()
    expect( screen.getByRole( 'textbox', { name: 'Your answer' } ) ).toHaveFocus()
  } )

  it( 'does not steal focus on a narrow window, so the phone keyboard stays down', () => {
    mockMatchMedia( { isWide: false } )
    setup()

    expect( screen.getByRole( 'textbox', { name: 'Your answer' } ) ).not.toHaveFocus()
  } )
} )
