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
import { DisconnectCalendarDialog } from './DisconnectCalendarDialog'

describe( 'DisconnectCalendarDialog', () => {
  it( 'is closed until opened', () => {
    render( <DisconnectCalendarDialog open={ false } onConfirm={ vi.fn() } onCancel={ vi.fn() } /> )

    expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument()
  } )

  it( 'keeps imported time by default', async () => {
    const onConfirm = vi.fn()

    render( <DisconnectCalendarDialog open onConfirm={ onConfirm } onCancel={ vi.fn() } /> )
    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Disconnect Calendar' } ) )

    expect( onConfirm ).toHaveBeenCalledWith( false )
  } )

  it( 'removes imported time when the box is ticked', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()

    render( <DisconnectCalendarDialog open onConfirm={ onConfirm } onCancel={ vi.fn() } /> )
    await user.click( screen.getByRole( 'checkbox', { name: 'Also remove imported time' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Disconnect Calendar' } ) )

    expect( onConfirm ).toHaveBeenCalledWith( true )
  } )

  it( 'cancels', async () => {
    const onCancel = vi.fn()

    render( <DisconnectCalendarDialog open onConfirm={ vi.fn() } onCancel={ onCancel } /> )
    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( onCancel ).toHaveBeenCalled()
  } )
} )
