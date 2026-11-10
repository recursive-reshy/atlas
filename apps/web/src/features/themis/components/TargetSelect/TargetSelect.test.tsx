// Testing Library
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { TargetSelect } from './TargetSelect'

const subjects = [ { id: 's1', name: 'Rust' }, { id: 's2', name: 'SQL' } ]
const goals = [ { id: 'g1', name: 'Learn data engineering' } ]

describe( 'TargetSelect', () => {
  it( 'groups subjects and goals under the label, with a Choose… option first', () => {
    render( <TargetSelect
      label="Subject or goal"
      value=""
      subjects={ subjects }
      goals={ goals }
      onChange={ vi.fn() }
    /> )

    const select = screen.getByRole( 'combobox', { name: 'Subject or goal' } )

    expect( within( select ).getAllByRole( 'option' ).map( ( option ) => option.textContent ) )
      .toEqual( [ 'Choose…', 'Rust', 'SQL', 'Learn data engineering' ] )
    expect( within( select ).getByRole( 'group', { name: 'Subjects' } ) ).toBeInTheDocument()
    expect( within( select ).getByRole( 'group', { name: 'Goals' } ) ).toBeInTheDocument()
  } )

  it( 'leaves out a group with nothing in it', () => {
    render( <TargetSelect
      label="Target"
      value=""
      subjects={ [] }
      goals={ goals }
      onChange={ vi.fn() }
    /> )

    expect( screen.queryByRole( 'group', { name: 'Subjects' } ) ).not.toBeInTheDocument()
  } )

  it( 'reports the choice as kind:id', async () => {
    const onChange = vi.fn()

    render( <TargetSelect
      label="Target"
      value=""
      subjects={ subjects }
      goals={ goals }
      onChange={ onChange }
    /> )
    const user = userEvent.setup()

    await user.selectOptions( screen.getByRole( 'combobox', { name: 'Target' } ), 'subject:s2' )
    expect( onChange ).toHaveBeenLastCalledWith( 'subject:s2' )

    await user.selectOptions( screen.getByRole( 'combobox', { name: 'Target' } ), 'goal:g1' )
    expect( onChange ).toHaveBeenLastCalledWith( 'goal:g1' )
  } )

  it( 'keeps a target it does not know as "Selected", so the value is not lost', () => {
    render( <TargetSelect
      label="Target"
      value="goal:gone"
      subjects={ subjects }
      goals={ goals }
      onChange={ vi.fn() }
    /> )

    expect( screen.getByRole( 'combobox', { name: 'Target' } ) ).toHaveValue( 'goal:gone' )
    expect( screen.getByRole( 'option', { name: 'Selected' } ) ).toBeInTheDocument()
  } )
} )
