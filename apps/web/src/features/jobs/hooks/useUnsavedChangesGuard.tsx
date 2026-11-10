// React
import { useEffect } from 'react'
import type { ReactElement } from 'react'
// Packages
import { useBlocker } from 'react-router'
// App
import { ConfirmDialog } from '#src/app/ConfirmDialog'

// Guards reloading or closing the tab (beforeunload) and moving to another path inside the app.
// The caller renders the returned dialog.
export function useUnsavedChangesGuard( isDirty: boolean ): ReactElement {
  const blocker = useBlocker(
    ( { currentLocation, nextLocation } ) => (
      isDirty && currentLocation.pathname !== nextLocation.pathname
    ),
  )

  useEffect( () => {
    if( !isDirty ) {
      return undefined
    }

    const handleBeforeUnload = ( event: BeforeUnloadEvent ): void => {
      event.preventDefault()
    }

    window.addEventListener( 'beforeunload', handleBeforeUnload )

    return () => window.removeEventListener( 'beforeunload', handleBeforeUnload )
  }, [ isDirty ] )

  return (
    <ConfirmDialog
      open={ blocker.state === 'blocked' }
      title="Discard unsaved changes?"
      message="Your edits haven't been saved."
      confirmLabel="Discard"
      onConfirm={ () => blocker.proceed?.() }
      onCancel={ () => blocker.reset?.() }
    />
  )
}
