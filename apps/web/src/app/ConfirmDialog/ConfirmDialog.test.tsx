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
import { renderWithClient } from '#src/test-support/renderWithClient'
import { ConfirmDialog } from './ConfirmDialog'

const props = {
  open: true,
  title: 'Delete this profile?',
  message: 'Coding will be removed.',
  confirmLabel: 'Delete',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
}

describe( 'ConfirmDialog', () => {
  it( 'shows the title, the message and both buttons', () => {
    renderWithClient( <ConfirmDialog { ...props } /> )

    expect( screen.getByRole( 'dialog', { name: 'Delete this profile?' } ) ).toBeInTheDocument()
    expect( screen.getByText( 'Coding will be removed.' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Delete' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Cancel' } ) ).toBeInTheDocument()
  } )

  it( 'renders nothing when closed', () => {
    renderWithClient( <ConfirmDialog { ...props } open={ false } /> )

    expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument()
  } )

  it( 'confirms and cancels', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    renderWithClient( <ConfirmDialog { ...props } onConfirm={ onConfirm } onCancel={ onCancel } /> )

    await user.click( screen.getByRole( 'button', { name: 'Delete' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( onConfirm ).toHaveBeenCalledTimes( 1 )
    expect( onCancel ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'cancels on Escape', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    renderWithClient( <ConfirmDialog { ...props } onCancel={ onCancel } /> )

    await user.keyboard( '{Escape}' )

    expect( onCancel ).toHaveBeenCalled()
  } )
} )
