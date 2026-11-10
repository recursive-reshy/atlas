// React
import type { ReactElement } from 'react'
// Packages
import { useNavigate } from 'react-router'
// Testing Library
import {
  act,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
} from 'vitest'
// App
import { renderHookWithClient, renderWithClient } from '#src/test-support/renderWithClient'
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard'

const fire = (): Event => {
  const event = new Event( 'beforeunload', { cancelable: true } )
  window.dispatchEvent( event )

  return event
}

function Probe( { isDirty }: { isDirty: boolean } ): ReactElement {
  const dialog = useUnsavedChangesGuard( isDirty )
  const navigate = useNavigate()

  return (
    <>
      <button onClick={ () => void navigate( '/elsewhere' ) }>Go elsewhere</button>
      <button onClick={ () => void navigate( '/start?tab=2' ) }>Same path</button>
      { dialog }
    </>
  )
}

describe( 'useUnsavedChangesGuard', () => {
  describe( 'reloading or closing the tab', () => {
    it( 'asks the browser to warn while there are unsaved changes', () => {
      renderHookWithClient( () => useUnsavedChangesGuard( true ) )

      expect( fire().defaultPrevented ).toBe( true )
    } )

    it( 'does nothing when clean', () => {
      renderHookWithClient( () => useUnsavedChangesGuard( false ) )

      expect( fire().defaultPrevented ).toBe( false )
    } )

    it( 'follows the flag as it changes', () => {
      const { rerender } = renderHookWithClient(
        ( dirty: boolean ) => useUnsavedChangesGuard( dirty ),
        { initialProps: true },
      )

      rerender( false )

      expect( fire().defaultPrevented ).toBe( false )
    } )

    it( 'stops warning after unmount', () => {
      const { unmount } = renderHookWithClient( () => useUnsavedChangesGuard( true ) )

      unmount()

      expect( fire().defaultPrevented ).toBe( false )
    } )
  } )

  describe( 'moving inside the app', () => {
    it( 'asks first when dirty, and Discard lets the move through', async () => {
      const user = userEvent.setup()
      const { location } = renderWithClient( <Probe isDirty />, { route: '/start' } )

      await user.click( screen.getByRole( 'button', { name: 'Go elsewhere' } ) )

      expect( await screen.findByRole( 'dialog', { name: 'Discard unsaved changes?' } ) )
        .toBeInTheDocument()
      expect( location().pathname ).toBe( '/start' )

      await user.click( screen.getByRole( 'button', { name: 'Discard' } ) )

      expect( location().pathname ).toBe( '/elsewhere' )
      await waitFor( () => expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument() )
    } )

    it( 'stays put when the user keeps editing', async () => {
      const user = userEvent.setup()
      const { location } = renderWithClient( <Probe isDirty />, { route: '/start' } )

      await user.click( screen.getByRole( 'button', { name: 'Go elsewhere' } ) )
      await user.click( await screen.findByRole( 'button', { name: 'Cancel' } ) )

      expect( location().pathname ).toBe( '/start' )
      await waitFor( () => expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument() )
    } )

    it( 'lets a clean page move without asking', async () => {
      const user = userEvent.setup()
      const { location } = renderWithClient( <Probe isDirty={ false } />, { route: '/start' } )

      await user.click( screen.getByRole( 'button', { name: 'Go elsewhere' } ) )

      expect( location().pathname ).toBe( '/elsewhere' )
      expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument()
    } )

    it( 'does not block a move that keeps the same path', async () => {
      const user = userEvent.setup()
      const { location } = renderWithClient( <Probe isDirty />, { route: '/start' } )

      await act( async () => {
        await user.click( screen.getByRole( 'button', { name: 'Same path' } ) )
      } )

      expect( location().search ).toBe( '?tab=2' )
      expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument()
    } )
  } )
} )
