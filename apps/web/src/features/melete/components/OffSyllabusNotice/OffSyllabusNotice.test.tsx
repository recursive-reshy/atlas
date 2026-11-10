// Testing Library
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { OffSyllabusNotice } from './OffSyllabusNotice'

const sections = [ { id: 'section-1', name: 'Basics' }, { id: 'section-2', name: 'Advanced' } ]

const setup = ( suggestion: string | null = 'Decorators', isBusy = false ) => {
  const onDismiss = vi.fn()
  const onAdd = vi.fn()

  render(
    <OffSyllabusNotice
      suggestion={ suggestion }
      sections={ sections }
      isBusy={ isBusy }
      onDismiss={ onDismiss }
      onAdd={ onAdd }
    />,
  )

  return { onDismiss, onAdd, user: userEvent.setup() }
}

describe( 'OffSyllabusNotice', () => {
  it( 'says the note is off-syllabus and quotes the suggestion', () => {
    setup()

    expect( screen.getByText( /Off-syllabus/ ) ).toBeInTheDocument()
    expect( screen.getByText( /“Decorators”/ ) ).toBeInTheDocument()
  } )

  it( 'says the same without a suggestion', () => {
    setup( null )

    expect( screen.getByText( /Off-syllabus/ ) ).toBeInTheDocument()
    expect( screen.queryByText( /“/ ) ).not.toBeInTheDocument()
  } )

  it( 'dismisses', async () => {
    const { onDismiss, user } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Dismiss' } ) )

    expect( onDismiss ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'adds the concept to the first section by default', async () => {
    const { onAdd, user } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Add concept' } ) )

    expect( onAdd ).toHaveBeenCalledWith( 'section-1' )
  } )

  it( 'adds it to the section chosen', async () => {
    const { onAdd, user } = setup()

    await user.selectOptions( screen.getByLabelText( 'Section' ), 'Advanced' )
    await user.click( screen.getByRole( 'button', { name: 'Add concept' } ) )

    expect( onAdd ).toHaveBeenCalledWith( 'section-2' )
  } )

  it( 'does not offer to add a concept without a suggestion to name it', () => {
    setup( null )

    expect( screen.queryByRole( 'button', { name: 'Add concept' } ) ).not.toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Dismiss' } ) ).toBeInTheDocument()
  } )

  it( 'disables both buttons while a change is saving', () => {
    setup( 'Decorators', true )

    expect( screen.getByRole( 'button', { name: 'Dismiss' } ) ).toBeDisabled()
    expect( screen.getByRole( 'button', { name: 'Add concept' } ) ).toBeDisabled()
  } )
} )
