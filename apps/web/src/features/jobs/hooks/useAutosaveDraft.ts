// React
import { useEffect, useRef, useState } from 'react'
// Packages
import { useQueryClient } from '@tanstack/react-query'
// Shared
import type { Job, UpdateDraftBody } from '@atlas/shared'
// App
import { updateDraft } from '../api/jobs.api'
import type { AutosaveState, AutosaveStatus, Values } from './autosaveDraft.types'
import { jobKeys } from '#src/lib/queryKeys'
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard'

export type { AutosaveState, AutosaveStatus } from './autosaveDraft.types'

export const AUTOSAVE_DEBOUNCE_MS = 1500

export function useAutosaveDraft( job: Job ): AutosaveState {
  const queryClient = useQueryClient()
  const initial: Values = { note: job.note_markdown ?? '', folder: job.target_folder }
  const [ values, setValues ] = useState< Values >( initial )
  const [ status, setStatus ] = useState< AutosaveStatus >( 'saved' )
  const [ message, setMessage ] = useState< string | null >( null )

  const latest = useRef< Values >( initial )
  const sent = useRef< Values >( initial )
  const serverNote = useRef< string | null >( null )
  const timer = useRef< ReturnType< typeof setTimeout > | undefined >( undefined )
  const inFlight = useRef< Promise< boolean > | null >( null )
  const isCancelled = useRef( false )
  const flushRef = useRef< () => Promise< boolean > >( () => Promise.resolve( true ) )

  const isDirty = (): boolean => {
    return latest.current.note !== sent.current.note
      || latest.current.folder !== sent.current.folder
  }

  const run = async (): Promise< boolean > => {
    while( isDirty() ) {
      const { note, folder } = latest.current
      const body: UpdateDraftBody = {}

      if( note !== sent.current.note ) {
        body.note_markdown = note
      }

      if( folder !== sent.current.folder ) {
        body.target_folder = folder
      }

      setStatus( 'saving' )

      try {
        const updated = await updateDraft( job.id, body )

        sent.current = { note, folder }
        serverNote.current = updated.note_markdown
        queryClient.setQueryData( jobKeys.detail( job.id ), updated )
      } catch( error ) {
        setStatus( 'error' )
        setMessage( error instanceof Error ? error.message : 'Unexpected error' )

        return false
      }
    }

    setStatus( 'saved' )
    setMessage( null )

    return true
  }

  // While a request runs, its loop sets the status itself.
  const refreshStatus = (): void => {
    if( inFlight.current === null ) {
      setStatus( isDirty() ? 'unsaved' : 'saved' )
    }
  }

  const flush = async (): Promise< boolean > => {
    clearTimeout( timer.current )

    if( inFlight.current !== null ) {
      // The running loop re-reads the latest values; wait for it, then check once more.
      const ok = await inFlight.current

      return ok && isDirty() ? flush() : ok
    }

    inFlight.current = run().finally( () => {
      inFlight.current = null
    } )

    return inFlight.current
  }

  useEffect( () => {
    flushRef.current = flush
  } )

  const scheduleFlush = (): void => {
    clearTimeout( timer.current )
    timer.current = setTimeout( () => void flushRef.current(), AUTOSAVE_DEBOUNCE_MS )
  }

  const putNote = ( note: string ): void => {
    isCancelled.current = false
    latest.current = { ...latest.current, note }
    setValues( latest.current )
    refreshStatus()
  }

  const setNote = ( note: string ): void => {
    putNote( note )
    scheduleFlush()
  }

  const setFolder = ( folder: string | null ): void => {
    isCancelled.current = false
    latest.current = { ...latest.current, folder }
    setValues( latest.current )
    void flush()
  }

  // For when the note is about to be replaced: no timer and no save on unmount. The edit stays
  // on screen, still unsaved, and the next edit or an explicit flush saves it again.
  const cancelPending = (): void => {
    clearTimeout( timer.current )
    isCancelled.current = true
  }

  // For a change the caller stores itself (an accepted link): the note changes on screen and no
  // save is scheduled. markSaved records that the server has it; until then it stays unsaved.
  const replaceNote = ( note: string ): void => {
    clearTimeout( timer.current )
    putNote( note )
  }

  const markSaved = ( note: string ): void => {
    sent.current = { ...sent.current, note }
    serverNote.current = note
    refreshStatus()
  }

  const adoptServerNote = (): void => {
    const note = serverNote.current

    if( note === null || isDirty() || inFlight.current !== null || note === latest.current.note ) {
      return
    }

    latest.current = { ...latest.current, note }
    sent.current = { ...sent.current, note }
    setValues( latest.current )
  }

  useEffect( () => () => {
    clearTimeout( timer.current )

    if( isDirty() && !isCancelled.current ) {
      void flushRef.current()
    }
  }, [] )

  const guard = useUnsavedChangesGuard( status !== 'saved' )

  return {
    note: values.note,
    folder: values.folder,
    setNote,
    setFolder,
    flush,
    status,
    message,
    adoptServerNote,
    cancelPending,
    replaceNote,
    markSaved,
    guard,
  }
}
