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
import { PasteTextDialog } from './PasteTextDialog'

const pasted = 'Pasted words go here. '.repeat( 15 )

const setup = ( props: { isSubmitting?: boolean, error?: string | null } = {} ) => {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()

  render(
    <PasteTextDialog
      isSubmitting={ false }
      error={ null }
      onSubmit={ onSubmit }
      onCancel={ onCancel }
      { ...props }
    />,
  )

  return { onSubmit, onCancel, user: userEvent.setup() }
}

const paste = async ( user: ReturnType< typeof userEvent.setup >, text: string ) => {
  await user.click( screen.getByRole( 'textbox', { name: 'Article text' } ) )
  await user.paste( text )
}

describe( 'PasteTextDialog', () => {
  it( 'is a dialog with the title and article text fields', () => {
    setup()

    expect( screen.getByRole( 'dialog', { name: 'Paste the article text' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'textbox', { name: 'Title' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'textbox', { name: 'Article text' } ) ).toBeInTheDocument()
  } )

  it( 'keeps Summarize disabled until there are 200 characters', async () => {
    const { user } = setup()
    const button = screen.getByRole( 'button', { name: 'Summarize' } )

    expect( button ).toBeDisabled()

    await paste( user, 'too short' )

    expect( button ).toBeDisabled()
    expect( screen.getByText( /at least 200 characters/ ) ).toBeInTheDocument()

    await paste( user, pasted )

    expect( button ).toBeEnabled()
  } )

  it( 'submits the trimmed text and title', async () => {
    const { onSubmit, user } = setup()

    await user.type( screen.getByRole( 'textbox', { name: 'Title' } ), '  My title ' )
    await paste( user, `  ${ pasted }  ` )
    await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

    expect( onSubmit ).toHaveBeenCalledExactlyOnceWith( { text: pasted.trim(), title: 'My title' } )
  } )

  it( 'leaves the title out when it is blank', async () => {
    const { onSubmit, user } = setup()

    await paste( user, pasted )
    await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

    expect( onSubmit ).toHaveBeenCalledExactlyOnceWith( { text: pasted.trim() } )
  } )

  it( 'shows a server error and keeps what was typed', async () => {
    const { user } = setup( { error: 'Pasted text can only continue a failed article job' } )

    await paste( user, pasted )

    expect( screen.getByRole( 'alert' ) )
      .toHaveTextContent( 'Pasted text can only continue a failed article job' )
    expect( screen.getByRole( 'textbox', { name: 'Article text' } ) ).toHaveValue( pasted )
  } )

  it( 'disables the actions that would submit while it is submitting', () => {
    setup( { isSubmitting: true } )

    expect( screen.getByRole( 'button', { name: 'Summarizing…' } ) ).toBeDisabled()
    expect( screen.getByRole( 'textbox', { name: 'Article text' } ) ).toBeDisabled()
  } )

  it( 'closes on Cancel', async () => {
    const { onCancel, user } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( onCancel ).toHaveBeenCalledTimes( 1 )
  } )
} )
