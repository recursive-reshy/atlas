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
import { ProfileActions } from './ProfileActions'

const base = {
  deleteBlockedReason: null,
  onNew: vi.fn(),
  onRename: vi.fn(),
  onDelete: vi.fn(),
}

describe( 'ProfileActions', () => {
  it( 'offers New profile, Rename and Delete', async () => {
    const user = userEvent.setup()
    const onNew = vi.fn()
    const onRename = vi.fn()
    const onDelete = vi.fn()
    renderWithClient(
      <ProfileActions
        { ...base }
        onNew={ onNew }
        onRename={ onRename }
        onDelete={ onDelete }
      />,
    )

    await user.click( screen.getByRole( 'button', { name: 'New profile' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Rename' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Delete' } ) )

    expect( onNew ).toHaveBeenCalledTimes( 1 )
    expect( onRename ).toHaveBeenCalledTimes( 1 )
    expect( onDelete ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'disables Delete and explains why in a tooltip', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    renderWithClient(
      <ProfileActions
        { ...base }
        onDelete={ onDelete }
        deleteBlockedReason="The default profile can't be deleted."
      />,
    )

    const button = screen.getByRole( 'button', { name: 'Delete' } )
    await user.hover( button )

    expect( button ).toBeDisabled()
    expect( await screen.findByRole( 'tooltip' ) )
      .toHaveTextContent( "The default profile can't be deleted." )

    await user.click( button )

    expect( onDelete ).not.toHaveBeenCalled()
  } )
} )

describe( 'ProfileActions, for the list', () => {
  it( 'offers Set as default, and disables it for the default profile', async () => {
    const user = userEvent.setup()
    const onSetDefault = vi.fn()
    const { rerender } = renderWithClient(
      <ProfileActions { ...base } onSetDefault={ onSetDefault } isDefault={ false } />,
    )

    await user.click( screen.getByRole( 'button', { name: 'Set as default' } ) )

    expect( onSetDefault ).toHaveBeenCalledTimes( 1 )

    rerender( <ProfileActions { ...base } onSetDefault={ onSetDefault } isDefault /> )

    expect( screen.getByRole( 'button', { name: 'Set as default' } ) ).toBeDisabled()
  } )

  it( 'offers only New profile when no profile is selected', () => {
    renderWithClient( <ProfileActions { ...base } hasProfile={ false } /> )

    expect( screen.getByRole( 'button', { name: 'New profile' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'button', { name: 'Rename' } ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'button', { name: 'Delete' } ) ).not.toBeInTheDocument()
  } )
} )
