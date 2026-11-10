// Testing Library
import { screen, waitFor } from '@testing-library/react'
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
import { PromptEditor } from './PromptEditor'

const base = {
  value: 'Focus on ideas.',
  isDirty: false,
  isSaving: false,
  canReset: true,
  error: null,
  onChange: vi.fn(),
  onSave: vi.fn(),
  onDiscard: vi.fn(),
  onReset: vi.fn(),
}

describe( 'PromptEditor', () => {
  it( 'shows the guidance in a labelled field with a character count', () => {
    renderWithClient( <PromptEditor { ...base } /> )

    expect( screen.getByRole( 'textbox', { name: 'Guidance' } ) ).toHaveValue( 'Focus on ideas.' )
    expect( screen.getByText( '15 / 20,000' ) ).toBeInTheDocument()
  } )

  it( 'reports edits', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithClient( <PromptEditor { ...base } value="" onChange={ onChange } /> )

    await user.type( screen.getByRole( 'textbox', { name: 'Guidance' } ), 'a' )

    expect( onChange ).toHaveBeenCalledWith( 'a' )
  } )

  it( 'says nothing about unsaved changes while clean', () => {
    renderWithClient( <PromptEditor { ...base } /> )

    expect( screen.queryByText( 'Unsaved changes' ) ).not.toBeInTheDocument()
  } )

  it( 'says Unsaved changes in text while dirty', () => {
    renderWithClient( <PromptEditor { ...base } isDirty /> )

    expect( screen.getByText( 'Unsaved changes' ) ).toBeInTheDocument()
  } )

  it( 'disables Save and Discard while unchanged', () => {
    renderWithClient( <PromptEditor { ...base } /> )

    expect( screen.getByRole( 'button', { name: 'Save' } ) ).toBeDisabled()
    expect( screen.getByRole( 'button', { name: 'Discard changes' } ) ).toBeDisabled()
  } )

  it( 'saves when dirty', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    renderWithClient( <PromptEditor { ...base } isDirty onSave={ onSave } /> )

    await user.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( onSave ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'cannot save empty guidance', () => {
    renderWithClient( <PromptEditor { ...base } value="   " isDirty /> )

    expect( screen.getByRole( 'button', { name: 'Save' } ) ).toBeDisabled()
  } )

  it( 'cannot save guidance over the limit, and marks the count', () => {
    renderWithClient( <PromptEditor { ...base } value={ 'a'.repeat( 20_001 ) } isDirty /> )

    expect( screen.getByRole( 'button', { name: 'Save' } ) ).toBeDisabled()
    expect( screen.getByText( '20,001 / 20,000' ) ).toBeInTheDocument()
    expect( screen.getByText( /too long/i ) ).toBeInTheDocument()
  } )

  it( 'discards the changes', async () => {
    const user = userEvent.setup()
    const onDiscard = vi.fn()
    renderWithClient( <PromptEditor { ...base } isDirty onDiscard={ onDiscard } /> )

    await user.click( screen.getByRole( 'button', { name: 'Discard changes' } ) )

    expect( onDiscard ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'shows a save error', () => {
    renderWithClient( <PromptEditor { ...base } isDirty error="Could not reach the server" /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
  } )

  it( 'offers Reset to default for a profile the app ships', () => {
    renderWithClient( <PromptEditor { ...base } /> )

    expect( screen.getByRole( 'button', { name: 'Reset to default' } ) ).toBeInTheDocument()
  } )

  it( 'does not offer Reset to default for a profile the user made', () => {
    renderWithClient( <PromptEditor { ...base } canReset={ false } /> )

    expect( screen.queryByRole( 'button', { name: 'Reset to default' } ) ).not.toBeInTheDocument()
  } )

  it( 'resets only after confirming', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()
    renderWithClient( <PromptEditor { ...base } onReset={ onReset } /> )

    await user.click( screen.getByRole( 'button', { name: 'Reset to default' } ) )

    expect( onReset ).not.toHaveBeenCalled()

    await user.click( screen.getByRole( 'button', { name: 'Reset' } ) )

    expect( onReset ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'does not reset when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()
    renderWithClient( <PromptEditor { ...base } onReset={ onReset } /> )

    await user.click( screen.getByRole( 'button', { name: 'Reset to default' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    await waitFor( () => expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument() )
    expect( onReset ).not.toHaveBeenCalled()
  } )
} )
