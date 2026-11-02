// React
import type { ReactElement } from 'react'
// Shared
import { insertLink, isStale } from '@atlas/shared'
import type { Job, StoredLinkSuggestion } from '@atlas/shared'
// App
import { useAcceptLinkSuggestions } from '#src/hooks/useAcceptLinkSuggestions'
import type { AutosaveState } from '#src/hooks/useAutosaveDraft'
import { useDebouncedValue } from '#src/hooks/useDebouncedValue'
import { useRejectLinkSuggestions } from '#src/hooks/useRejectLinkSuggestions'
import { LinkSuggestionsPanel } from '../LinkSuggestionsPanel'

const STALE_DEBOUNCE_MS = 300

interface LinkSuggestionsTabProps {
  job: Job
  autosave: AutosaveState
  suggestions: StoredLinkSuggestion[]
  pending: StoredLinkSuggestion[]
}

const applyLinks = ( note: string, chosen: StoredLinkSuggestion[] ): string => {
  return chosen.reduce(
    ( text, suggestion ) => insertLink( text, suggestion, {
      asRelated: isStale( text, suggestion ),
    } ),
    note,
  )
}

export function LinkSuggestionsTab(
  { job, autosave, suggestions, pending }: LinkSuggestionsTabProps,
): ReactElement {
  const accept = useAcceptLinkSuggestions( job.id )
  const reject = useRejectLinkSuggestions( job.id )
  const shownNote = useDebouncedValue( autosave.note, STALE_DEBOUNCE_MS )

  const handleAccept = ( chosen: StoredLinkSuggestion[] ): void => {
    const next = applyLinks( autosave.note, chosen )

    reject.reset()
    autosave.replaceNote( next )
    accept.mutate(
      { ids: chosen.map( ( { id } ) => id ), note_markdown: next },
      { onSuccess: () => autosave.markSaved( next ) },
    )
  }

  const handleReject = ( chosen: StoredLinkSuggestion[] ): void => {
    accept.reset()
    reject.mutate( { ids: chosen.map( ( { id } ) => id ) } )
  }

  return (
    <LinkSuggestionsPanel
      suggestions={ suggestions }
      note={ shownNote }
      isBusy={ accept.isPending || reject.isPending }
      error={ accept.error?.message ?? reject.error?.message ?? null }
      onAccept={ ( suggestion ) => handleAccept( [ suggestion ] ) }
      onReject={ ( suggestion ) => handleReject( [ suggestion ] ) }
      onAcceptAll={ () => handleAccept( pending ) }
      onRejectAll={ () => handleReject( pending ) }
    />
  )
}
