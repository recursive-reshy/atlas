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
import { ProfileNameDialog } from './ProfileNameDialog'

const base = {
  open: true,
  initialName: '',
  initialGuidance: 'Focus on ideas.',
  error: null,
  isSaving: false,
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
}

describe( 'ProfileNameDialog, new profile', () => {
  it( 'has a name field and a guidance field prefilled from the viewed profile', () => {
    renderWithClient( <ProfileNameDialog { ...base } mode="create" /> )

    expect( screen.getByRole( 'dialog', { name: 'New profile' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'textbox', { name: 'Name' } ) ).toHaveValue( '' )
    expect( screen.getByRole( 'textbox', { name: 'Guidance' } ) ).toHaveValue( 'Focus on ideas.' )
  } )

  it( 'submits the trimmed name and the guidance', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderWithClient( <ProfileNameDialog { ...base } mode="create" onSubmit={ onSubmit } /> )

    await user.type( screen.getByRole( 'textbox', { name: 'Name' } ), '  Research  ' )
    await user.click( screen.getByRole( 'button', { name: 'Create' } ) )

    expect( onSubmit ).toHaveBeenCalledExactlyOnceWith( {
      name: 'Research',
      guidance: 'Focus on ideas.',
    } )
  } )

  it( 'disables Create for an empty or blank name', async () => {
    const user = userEvent.setup()
    renderWithClient( <ProfileNameDialog { ...base } mode="create" /> )

    expect( screen.getByRole( 'button', { name: 'Create' } ) ).toBeDisabled()

    await user.type( screen.getByRole( 'textbox', { name: 'Name' } ), '   ' )

    expect( screen.getByRole( 'button', { name: 'Create' } ) ).toBeDisabled()
  } )

  it( 'disables Create for a name over 60 characters', async () => {
    const user = userEvent.setup()
    renderWithClient( <ProfileNameDialog { ...base } mode="create" /> )

    await user.type( screen.getByRole( 'textbox', { name: 'Name' } ), 'a'.repeat( 61 ) )

    expect( screen.getByRole( 'button', { name: 'Create' } ) ).toBeDisabled()
  } )

  it( 'disables Create when the guidance is empty', async () => {
    const user = userEvent.setup()
    renderWithClient( <ProfileNameDialog { ...base } mode="create" /> )

    await user.type( screen.getByRole( 'textbox', { name: 'Name' } ), 'Research' )
    await user.clear( screen.getByRole( 'textbox', { name: 'Guidance' } ) )

    expect( screen.getByRole( 'button', { name: 'Create' } ) ).toBeDisabled()
  } )

  it( 'shows the server message and stays open', () => {
    renderWithClient(
      <ProfileNameDialog
        { ...base }
        mode="create"
        error="A profile with that name already exists"
      />,
    )

    expect( screen.getByRole( 'alert' ) )
      .toHaveTextContent( 'A profile with that name already exists' )
    expect( screen.getByRole( 'dialog' ) ).toBeInTheDocument()
  } )

  it( 'cancels without submitting', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    renderWithClient(
      <ProfileNameDialog { ...base } mode="create" onSubmit={ onSubmit } onCancel={ onCancel } />,
    )

    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( onCancel ).toHaveBeenCalledTimes( 1 )
    expect( onSubmit ).not.toHaveBeenCalled()
  } )
} )

describe( 'ProfileNameDialog, rename', () => {
  it( 'has only the name field, prefilled', () => {
    renderWithClient( <ProfileNameDialog { ...base } mode="rename" initialName="Coding" /> )

    expect( screen.getByRole( 'dialog', { name: 'Rename profile' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'textbox', { name: 'Name' } ) ).toHaveValue( 'Coding' )
    expect( screen.queryByRole( 'textbox', { name: 'Guidance' } ) ).not.toBeInTheDocument()
  } )

  it( 'submits only the new name', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderWithClient(
      <ProfileNameDialog { ...base } mode="rename" initialName="Coding" onSubmit={ onSubmit } />,
    )

    await user.clear( screen.getByRole( 'textbox', { name: 'Name' } ) )
    await user.type( screen.getByRole( 'textbox', { name: 'Name' } ), 'Code' )
    await user.click( screen.getByRole( 'button', { name: 'Rename' } ) )

    expect( onSubmit ).toHaveBeenCalledExactlyOnceWith( { name: 'Code' } )
  } )

  it( 'disables Rename while the name is unchanged', () => {
    renderWithClient( <ProfileNameDialog { ...base } mode="rename" initialName="Coding" /> )

    expect( screen.getByRole( 'button', { name: 'Rename' } ) ).toBeDisabled()
  } )
} )
